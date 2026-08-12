import 'server-only'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/db'
import { getSettings } from '@/lib/services/settings'
import { REF_COOKIE, attributeOrder } from '@/lib/services/affiliate'
import * as razorpay from '@/lib/razorpay'
import { activateAndLockIfEligible, computeTharaDiscount } from '@/lib/services/thara'
import type { OrderStatus } from '@prisma/client'

/**
 * Checkout service — turns a server-backed guest cart into a real Order, then
 * opens a Razorpay payment order against it.
 *
 * The order is written in status 'pending' (awaiting payment) and only flips to
 * 'paid' once payment is verified — either synchronously via /api/payments/verify
 * or asynchronously via the Razorpay webhook (see markOrderPaid). Everything
 * money-related (line prices, subtotal, shipping, the amount charged) is
 * RECOMPUTED here from ProductVariant.price — the client payload is only ever
 * trusted for who/where to ship, never for what to charge.
 */

// Flat courier fee below the free-shipping threshold. Kept in sync with the
// storefront's cart hint; the threshold itself is editable via Settings.
const SHIPPING_FEE = 49

/** No cart / empty cart at checkout time. Route layer maps this to a 400. */
export class EmptyCartError extends Error {
  constructor() {
    super('Your bag is empty.')
    this.name = 'EmptyCartError'
  }
}

/** A line whose quantity now exceeds available stock. Route maps this to a 409
 *  so the shopper sees exactly which item to adjust rather than a generic 500. */
export class OutOfStockError extends Error {
  constructor(itemName: string) {
    super(`Sorry, "${itemName}" just went out of stock. Please reduce the quantity or remove it to continue.`)
    this.name = 'OutOfStockError'
  }
}

/** The order number in a payment callback doesn't resolve to any order. Route
 *  maps this to a 400 (bad reference) rather than surfacing a 500. */
export class OrderNotFoundError extends Error {
  constructor(orderNo: string) {
    super(`Order ${orderNo} not found.`)
    this.name = 'OrderNotFoundError'
  }
}

/** A capture arrived for an order that has no matching payment-intent row. We
 *  never fabricate one (that would mark an order paid with no money behind it),
 *  so the caller must reject. Route maps this to a 400. */
export class PaymentIntentMissingError extends Error {
  constructor(orderNo: string) {
    super(`No matching payment found for order ${orderNo}.`)
    this.name = 'PaymentIntentMissingError'
  }
}

/** The captured payment's amount doesn't equal the order total we charged. A
 *  tampered/mismatched capture — never mark such an order paid. Route → 400. */
export class PaymentAmountMismatchError extends Error {
  constructor(orderNo: string) {
    super(`Payment amount does not match order ${orderNo}.`)
    this.name = 'PaymentAmountMismatchError'
  }
}

export class OrderNotPayableError extends Error {
  constructor(orderNo: string) {
    super(`Order ${orderNo} is not awaiting payment.`)
    this.name = 'OrderNotPayableError'
  }
}

/** Shipping/customer details captured on the checkout form. */
export interface CheckoutCustomer {
  name: string
  phone: string
  email?: string
  line: string
  city: string
  state?: string
  pincode?: string
}

/** The payment intent the client needs to open the Razorpay Checkout widget
 *  (or, in mock mode, to POST the dev "mark paid" call). `configured` tells the
 *  UI which flow to run; `keyId` is empty unless a real publishable key is set. */
export interface PaymentIntent {
  razorpayOrderId: string
  amount: number // rupees (matches Order.total)
  keyId: string
  configured: boolean
}

export interface PlaceOrderResult {
  orderNo: string
  payment: PaymentIntent
}

/**
 * Re-open the existing Razorpay intent for a pending order. Checkout already
 * persisted this intent before consuming the cart, so a shopper who dismissed
 * the gateway can safely retry without creating a second order or reserving
 * stock again.
 */
export async function pendingPaymentIntent(orderNo: string): Promise<PaymentIntent> {
  const order = await prisma.order.findUnique({
    where: { orderNo },
    select: {
      status: true,
      total: true,
      payments: {
        where: { status: 'created' },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { razorpayOrderId: true, amount: true },
      },
    },
  })
  if (!order) throw new OrderNotFoundError(orderNo)
  if (order.status !== 'pending') throw new OrderNotPayableError(orderNo)

  const payment = order.payments[0]
  if (!payment?.razorpayOrderId) throw new PaymentIntentMissingError(orderNo)
  if (payment.amount !== order.total) throw new PaymentAmountMismatchError(orderNo)

  return {
    razorpayOrderId: payment.razorpayOrderId,
    amount: order.total,
    keyId: razorpay.publicKeyId(),
    configured: razorpay.isConfigured(),
  }
}

/** True only for a P2002 unique-constraint violation on Order.orderNo, so the
 *  caller can retry orderNo allocation without masking other unique collisions. */
function isOrderNoUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const e = err as { code?: unknown; meta?: { target?: unknown } }
  if (e.code !== 'P2002') return false
  const target = e.meta?.target
  const fields = Array.isArray(target)
    ? target.map((t) => String(t))
    : typeof target === 'string'
      ? [target]
      : []
  return fields.some((f) => f.toLowerCase().includes('orderno'))
}

/**
 * Place an order for the guest identified by `token`, then open a Razorpay
 * payment order against it.
 *
 * The price/stock recompute, customer upsert, order write and stock decrement
 * run inside a single transaction so a mid-flight failure can never leave a
 * half-created order or a double-decremented variant. The cart remains intact
 * until the gateway intent has also been persisted. The gateway network call
 * happens outside a DB transaction; if it fails, a compensating transaction
 * restores stock and removes the pending order while preserving the shopper's
 * cart for a retry.
 */
export async function placeOrder(token: string, customer: CheckoutCustomer): Promise<PlaceOrderResult> {
  // Settings are a read of business config, not part of the atomic order write —
  // fetch them before opening the transaction to keep it short. (Loyalty points
  // are no longer awarded here; they are granted on capture in markOrderPaid.)
  const { freeShipThreshold } = await getSettings()

  // Referral attribution rides in an httpOnly cookie dropped by /r/[code]. Read
  // it here (request scope) so the transaction can stamp the order's affiliate.
  const refCode = (await cookies()).get(REF_COOKIE)?.value?.trim() || undefined

  // Never persist an empty email; it would clash with the User.email @unique
  // index (many guests, no email) and blank a returning customer's real email.
  const email = customer.email?.trim() || undefined

  // Concurrent checkouts can compute the same next orderNo and collide on the
  // @unique index. Retry the whole transaction a few times on THAT specific
  // P2002 so the number is re-allocated instead of surfacing a 500.
  const MAX_ORDERNO_ATTEMPTS = 5
  let placed: { orderId: string; orderNo: string; total: number; cartId: string } | undefined
  for (let attempt = 1; attempt <= MAX_ORDERNO_ATTEMPTS; attempt++) {
   try {
    placed = await prisma.$transaction(async (tx) => {
    const cart = await tx.cart.findUnique({
      where: { guestToken: token },
      include: {
        items: {
          orderBy: { id: 'asc' },
          include: { variant: { include: { product: { select: { name: true } } } } },
        },
      },
    })
    if (!cart || cart.items.length === 0) throw new EmptyCartError()

    // Re-read within the transaction: current price + current stock. Snapshot
    // the line fields as we go so the OrderItem records survive later catalog edits.
    let subtotal = 0
    const lines = cart.items.map((item) => {
      const { variant } = item
      // Stock is NOT checked here — a read-then-decrement would race two
      // concurrent checkouts into overselling. The reservation below is a
      // conditional atomic decrement that is the sole guard against oversell.
      const unitPrice = variant.price // server is the source of truth on price
      const lineTotal = unitPrice * item.qty
      subtotal += lineTotal
      return {
        variantId: variant.id,
        productName: variant.product.name,
        variantLabel: variant.label,
        unitPrice,
        qty: item.qty,
        lineTotal,
      }
    })

    const shipping = subtotal >= freeShipThreshold ? 0 : SHIPPING_FEE

    // Guest checkouts become durable customer records, keyed by phone so a
    // repeat buyer reuses the same User (and its address book / order history).
    // The buyer is identified by PHONE; email is only a nice-to-have. If the
    // supplied email already belongs to a DIFFERENT user, writing it would trip
    // the User.email @unique index and 500 the whole checkout — so we simply
    // skip claiming it in that case (the order still ties to the phone-user).
    const emailFree =
      email && !(await tx.user.findFirst({
        where: { email, phone: { not: customer.phone } },
        select: { id: true },
      }))
    const emailPatch = emailFree ? { email } : {}
    const user = await tx.user.upsert({
      where: { phone: customer.phone },
      update: { name: customer.name, ...emailPatch },
      create: { phone: customer.phone, name: customer.name, role: 'customer', ...emailPatch },
    })

    // Thara personal discount — applies to the buyer's own orders when they are
    // an active member and the cart clears ₹3,000. Zero when the flag is off,
    // the user isn't a member, or the member is not yet active.
    const tharaDiscount = await computeTharaDiscount(tx, user.id, subtotal)
    const discount = tharaDiscount.discountPaise
    const total = Math.max(0, subtotal - discount + shipping)

    // First address for a user is their primary; later ones are added alongside.
    const addressCount = await tx.address.count({ where: { userId: user.id } })
    const address = await tx.address.create({
      data: {
        userId: user.id,
        label: 'Home',
        name: customer.name,
        line: customer.line,
        city: customer.city,
        state: customer.state ?? null,
        pincode: customer.pincode ?? null,
        phone: customer.phone,
        isPrimary: addressCount === 0,
      },
    })

    // Human-friendly, sequential order number continuing past the current max.
    // Zero-padded to a fixed width so lexical desc ordering == numeric ordering.
    const last = await tx.order.findFirst({
      where: { orderNo: { startsWith: 'FM-' } },
      orderBy: { orderNo: 'desc' },
      select: { orderNo: true },
    })
    const lastNum = last ? Number.parseInt(last.orderNo.slice(3), 10) : 0
    const nextNum = (Number.isFinite(lastNum) ? lastNum : 0) + 1
    const orderNo = 'FM-' + String(nextNum).padStart(5, '0')

    const order = await tx.order.create({
      data: {
        orderNo,
        userId: user.id,
        addressId: address.id,
        status: 'pending', // awaiting payment — Razorpay capture comes later
        channel: 'web',
        subtotal,
        discount,
        shipping,
        total,
        items: {
          create: lines.map((l) => ({
            variantId: l.variantId,
            productName: l.productName,
            variantLabel: l.variantLabel,
            unitPrice: l.unitPrice,
            qty: l.qty,
            lineTotal: l.lineTotal,
          })),
        },
      },
      select: { id: true, orderNo: true },
    })

    // Reserve stock atomically. Each line is a CONDITIONAL decrement that only
    // succeeds while enough stock remains (WHERE stock >= qty), so two concurrent
    // checkouts can never both drive the same variant negative. A count of 0 means
    // the guard failed → out of stock, and the transaction rolls back.
    for (const l of lines) {
      const res = await tx.productVariant.updateMany({
        where: { id: l.variantId, stock: { gte: l.qty } },
        data: { stock: { decrement: l.qty } },
      })
      if (res.count === 0) throw new OutOfStockError(`${l.productName} — ${l.variantLabel}`)
    }

    // ── LOYALTY ──────────────────────────────────────────────────────────────
    // Points are NOT awarded here. The order is only 'pending' at this point; the
    // Bloom points award now lives in markOrderPaid so it's granted exactly once,
    // when (and only when) the order actually becomes 'paid'.

    // ── AFFILIATE ────────────────────────────────────────────────────────────
    // Attribute the order to the referring creator, if the ref cookie maps to an
    // approved affiliate. attributeOrder writes the commission event (inside this
    // same transaction) and returns the affiliate id to stamp on the order; it's
    // a no-op for an unknown/pending/suspended code.
    if (refCode) {
      const affiliateId = await attributeOrder(refCode, order.id, subtotal, tx)
      if (affiliateId) {
        await tx.order.update({ where: { id: order.id }, data: { affiliateId } })
      }
    }

    // Do NOT consume the cart yet. The gateway order is opened after this
    // transaction; keeping the cart until that succeeds means a gateway outage
    // does not erase the shopper's bag.
    return { orderId: order.id, orderNo: order.orderNo, total, cartId: cart.id }
    })
    break
   } catch (err) {
    // Re-allocate only on the orderNo unique collision; any other P2002 is a
    // real error and must surface.
    if (isOrderNoUniqueViolation(err) && attempt < MAX_ORDERNO_ATTEMPTS) continue
    throw err
   }
  }
  if (!placed) throw new Error('Could not allocate an order number. Please try again.')
  const { orderId, orderNo, total, cartId } = placed

  let gatewayOrder: Awaited<ReturnType<typeof razorpay.createOrder>>
  try {
    // Open the gateway order for the exact server-computed total, using our
    // orderNo as the receipt so callbacks can tie it back to our order.
    gatewayOrder = await razorpay.createOrder({ amountRupees: total, receipt: orderNo })

    // Persist the payment intent and consume the cart atomically. If either
    // write fails, the transaction rolls back and the compensation below
    // restores the reserved stock/order.
    await prisma.$transaction(async (tx) => {
      await tx.payment.create({
        data: {
          orderId,
          provider: 'razorpay',
          razorpayOrderId: gatewayOrder.id,
          amount: total,
          status: 'created',
        },
      })
      await tx.cartItem.deleteMany({ where: { cartId } })
      await tx.cart.deleteMany({ where: { id: cartId } })
    })
  } catch (gatewayError) {
    // Compensate the already-committed reservation. The cart was deliberately
    // left untouched, so the shopper can retry once the gateway is available.
    try {
      await prisma.$transaction(async (tx) => {
        const order = await tx.order.findUnique({
          where: { id: orderId },
          include: { items: { select: { variantId: true, qty: true } } },
        })
        if (!order) return
        for (const item of order.items) {
          await tx.productVariant.update({
            where: { id: item.variantId },
            data: { stock: { increment: item.qty } },
          })
        }
        await tx.order.delete({ where: { id: orderId } })
      })
    } catch (compensationError) {
      const combined = new Error(
        `Gateway setup failed for ${orderNo}, and checkout compensation also failed.`,
      )
      Object.assign(combined, { gatewayError, compensationError })
      throw combined
    }
    throw gatewayError
  }

  return {
    orderNo,
    payment: {
      razorpayOrderId: gatewayOrder.id,
      amount: total,
      keyId: razorpay.publicKeyId(),
      configured: razorpay.isConfigured(),
    },
  }
}

/**
 * Mark an order paid from a verified payment signal (sync verify OR webhook).
 *
 * Idempotent by design — a re-delivered webhook, a client double-submit, or the
 * verify call racing the webhook must all converge on a single 'paid' order with
 * one captured Payment row:
 *  - If the order is already 'paid', return ok WITHOUT writing anything again.
 *  - Otherwise require the PRE-EXISTING payment-intent row for this order (and,
 *    when supplied, its gateway order id) and confirm its amount equals the order
 *    total — we never fabricate a Payment (that would mark an order paid with no
 *    money behind it). Then flip that row to 'captured' (stamping the @unique
 *    razorpayPaymentId — the DB is the final backstop against a duplicate
 *    capture), set the order to 'paid', and award loyalty points, all in one
 *    transaction. Points are granted here (on capture) exactly once.
 */
export async function markOrderPaid({
  orderNo,
  razorpayPaymentId,
  razorpayOrderId,
  signatureVerified,
  method,
}: {
  orderNo: string
  razorpayPaymentId: string
  razorpayOrderId?: string
  signatureVerified: boolean
  method?: string
}): Promise<{ ok: true; status: 'paid'; alreadyPaid: boolean }> {
  // Loyalty rate/bonus for the on-capture award. A plain config read — kept
  // outside the transaction to keep it short.
  const { pointsPerRupee, firstOrderBonusPoints } = await getSettings()

  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { orderNo },
      select: { id: true, status: true, total: true, userId: true },
    })
    if (!order) throw new OrderNotFoundError(orderNo)

    // Idempotency gate: already-paid orders short-circuit so re-delivery / retries
    // never double-write (points, capture, etc. stay single-shot).
    if (order.status === 'paid') {
      return { ok: true as const, status: 'paid' as const, alreadyPaid: true }
    }

    // Require the checkout payment-intent row for THIS order (matched on the
    // gateway order id when the caller has one). No row → refuse to mark paid;
    // we never invent a captured Payment out of nothing.
    const payment = await tx.payment.findFirst({
      where: { orderId: order.id, ...(razorpayOrderId ? { razorpayOrderId } : {}) },
      orderBy: { createdAt: 'desc' },
    })
    if (!payment) throw new PaymentIntentMissingError(orderNo)

    // The intent must have been opened for exactly what we charged; a mismatch is
    // a tampered/stale capture and must not flip the order to paid.
    if (payment.amount !== order.total) throw new PaymentAmountMismatchError(orderNo)

    // Claim the pending order with a compare-and-set BEFORE updating the payment
    // or points. Sync verification and the webhook can arrive concurrently; the
    // row-level update lets exactly one transaction perform capture side effects.
    const claimed = await tx.order.updateMany({
      where: { id: order.id, status: 'pending' },
      data: { status: 'paid' },
    })
    if (claimed.count === 0) {
      const current = await tx.order.findUnique({
        where: { id: order.id },
        select: { status: true },
      })
      if (current?.status === 'paid') {
        return { ok: true as const, status: 'paid' as const, alreadyPaid: true }
      }
      throw new Error(`Order ${orderNo} cannot be paid from status ${current?.status ?? 'missing'}.`)
    }

    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: 'captured',
        razorpayPaymentId,
        signatureVerified,
        ...(method ? { method } : {}),
      },
    })

    // ── LOYALTY (granted on capture, exactly once) ─────────────────────────────
    // Now that the order is paid, award Bloom points: a rate on the order total
    // plus a one-time welcome bonus on the user's FIRST paid order. The already-
    // paid short-circuit above guarantees this runs at most once per order.
    if (order.userId) {
      const basePoints = Math.round(order.total * pointsPerRupee)
      // First paid order = the user has no OTHER paid order (this one is being
      // flipped to paid right now, so exclude it from the count).
      const priorPaidCount = await tx.order.count({
        where: { userId: order.userId, status: 'paid', id: { not: order.id } },
      })
      const isFirstPaidOrder = priorPaidCount === 0
      const pointsDelta = basePoints + (isFirstPaidOrder ? firstOrderBonusPoints : 0)
      if (pointsDelta > 0) {
        const prior = await tx.pointsLedger.aggregate({
          where: { userId: order.userId },
          _sum: { delta: true },
        })
        const balanceAfter = (prior._sum.delta ?? 0) + pointsDelta
        await tx.pointsLedger.create({
          data: {
            userId: order.userId,
            delta: pointsDelta,
            reason: isFirstPaidOrder ? `Order ${orderNo} + welcome bonus` : `Order ${orderNo}`,
            orderId: order.id,
            balanceAfter,
          },
        })
      }
    }

    // Thara: activate membership and lock incoming referral for qualifying orders.
    await activateAndLockIfEligible(tx, order.id)

    return { ok: true as const, status: 'paid' as const, alreadyPaid: false }
  })
}

/**
 * Resolve our public orderNo from a Razorpay order id, via the Payment row
 * stamped at checkout. The webhook only carries gateway ids, so this is how it
 * finds which of our orders to mark paid. Returns null when nothing references it.
 */
export async function orderNoForRazorpayOrderId(razorpayOrderId: string): Promise<string | null> {
  const payment = await prisma.payment.findFirst({
    where: { razorpayOrderId },
    orderBy: { createdAt: 'desc' },
    include: { order: { select: { orderNo: true } } },
  })
  return payment?.order.orderNo ?? null
}

/** One purchased line, shaped for the confirmation page. */
export interface ConfirmationLine {
  productName: string
  variantLabel: string
  unitPrice: number
  qty: number
  lineTotal: number
}

/** Order confirmation read model — order + items + address + customer name. */
export interface OrderConfirmation {
  orderNo: string
  status: OrderStatus
  placedAt: Date
  subtotal: number
  shipping: number
  total: number
  customerName: string
  items: ConfirmationLine[]
  address: {
    name: string
    line: string
    city: string
    state: string | null
    pincode: string | null
    phone: string | null
  } | null
}

/** Load an order by its public order number for the confirmation page, or null. */
export async function getOrderByNo(orderNo: string): Promise<OrderConfirmation | null> {
  const order = await prisma.order.findUnique({
    where: { orderNo },
    include: {
      user: { select: { name: true } },
      address: true,
      items: { orderBy: { id: 'asc' } },
    },
  })
  if (!order) return null

  return {
    orderNo: order.orderNo,
    status: order.status,
    placedAt: order.placedAt,
    subtotal: order.subtotal,
    shipping: order.shipping,
    total: order.total,
    customerName: order.user?.name ?? order.address?.name ?? 'there',
    items: order.items.map((it) => ({
      productName: it.productName,
      variantLabel: it.variantLabel,
      unitPrice: it.unitPrice,
      qty: it.qty,
      lineTotal: it.lineTotal,
    })),
    address: order.address
      ? {
          name: order.address.name,
          line: order.address.line,
          city: order.address.city,
          state: order.address.state,
          pincode: order.address.pincode,
          phone: order.address.phone,
        }
      : null,
  }
}
