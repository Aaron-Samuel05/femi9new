import 'server-only'
import { dbFor, type Brand } from '@femi9/db'
import type { CouponType, OrderStatus, Prisma } from '@prisma/client'
import * as razorpay from '../../razorpay'
import { sendOrderStatusEmail } from '../order-mail'
import { sendOrderStatusWhatsapp } from '../order-whatsapp'
import {
  reverseTharaCreditForRefund,
  reverseTharaPointsForRefund,
} from '../thara'
import { reverseOrderCommission } from '../affiliate'
import { addressEditState } from '../order-address'

/**
 * Admin orders service — the single seam between the DB and the Ops console's
 * sales views. List/detail are read models shaped for the table + detail page;
 * updateOrderStatus is the one write the module exposes.
 *
 * Money is stored as whole rupees (see schema), so no paise conversion happens
 * here — callers format for display.
 */

// Canonical status list — source of truth for the filter chips + the PATCH
// validator so the UI, service and API never drift. Matches the OrderStatus
// enum in schema.prisma exactly.
export const ORDER_STATUSES = [
  'pending',
  'paid',
  'processing',
  'shipped',
  'delivered',
  'cancelled',
  'refunded',
] as const

/** One row in the orders table (list view). */
export interface OrderListItem {
  id: string
  orderNo: string
  customerName: string
  city: string | null
  itemCount: number
  total: number
  status: OrderStatus
  placedAt: Date
}

export interface ListOrdersArgs {
  status?: string
  q?: string
  page?: number
}

export interface OrderListResult {
  orders: OrderListItem[]
  total: number
  page: number
  pageCount: number
  pageSize: number
}

const PAGE_SIZE = 20

/** True when `s` is a real OrderStatus — guards user-supplied filter values. */
function isStatus(s: string): s is OrderStatus {
  return (ORDER_STATUSES as readonly string[]).includes(s)
}

/**
 * Paginated orders, newest first. Optional status filter and a free-text query
 * matched against order number, customer name or shipping city.
 */
export async function listOrders(brand: Brand, { status, q, page = 1 }: ListOrdersArgs = {}): Promise<OrderListResult> {
  const prisma = dbFor(brand)
  const current = Math.max(1, Math.floor(page) || 1)
  try {
    const where: Prisma.OrderWhereInput = {}

    // Silently ignore an unknown status so a stale/hand-edited URL never 500s.
    if (status && isStatus(status)) where.status = status

    const term = q?.trim()
    if (term) {
      where.OR = [
        { orderNo: { contains: term, mode: 'insensitive' } },
        { user: { name: { contains: term, mode: 'insensitive' } } },
        { address: { city: { contains: term, mode: 'insensitive' } } },
      ]
    }

    const [total, rows] = await Promise.all([
      prisma.order.count({ where }),
      prisma.order.findMany({
        where,
        orderBy: { placedAt: 'desc' },
        skip: (current - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: {
          user: { select: { name: true } },
          address: { select: { city: true } },
          // Item count without hauling the line rows into the list query.
          _count: { select: { items: true } },
        },
      }),
    ])

    return {
      orders: rows.map((r) => ({
        id: r.id,
        orderNo: r.orderNo,
        customerName: r.user?.name ?? 'Guest',
        city: r.address?.city ?? null,
        itemCount: r._count.items,
        total: r.total,
        status: r.status,
        placedAt: r.placedAt,
      })),
      total,
      page: current,
      pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
      pageSize: PAGE_SIZE,
    }
  } catch (err) {
    console.error('Failed to list orders:', err)
    return {
      orders: [],
      total: 0,
      page: current,
      pageCount: 1,
      pageSize: PAGE_SIZE,
    }
  }
}

export interface OrderLine {
  id: string
  productName: string
  variantLabel: string
  unitPrice: number
  qty: number
  lineTotal: number
}

export interface OrderCustomer {
  name: string
  email: string | null
  phone: string | null
}

export interface OrderAddress {
  name: string
  line: string
  city: string
  state: string | null
  pincode: string | null
  phone: string | null
}

/**
 * The coupon an order was placed with, when one still exists.
 *
 * `discount` on the order is the money that actually came off, and it is the
 * only part that is a fact about the ORDER. This is read through the relation,
 * so `type`/`value` are the coupon's rule as it stands TODAY, not necessarily
 * the rule that priced this order - a 10% code later edited to 15% reports 15%
 * beside a discount computed at 10%. The code is the useful half; the rule is
 * context for it, never a recomputation of the total.
 */
export interface OrderCoupon {
  code: string
  type: CouponType
  value: number
}

export interface OrderDetail {
  id: string
  orderNo: string
  status: OrderStatus
  channel: string
  placedAt: Date
  subtotal: number
  discount: number
  /** Null when the order carried no coupon, or when that coupon has since been
   *  hard-deleted - the relation is optional, so the delete nulls `couponId`
   *  and leaves `discount` behind with nothing naming it. */
  coupon: OrderCoupon | null
  shipping: number
  total: number
  customer: OrderCustomer | null
  address: OrderAddress | null
  items: OrderLine[]
  /**
   * The one-time address correction — see `services/order-address.ts`.
   *
   * Surfaced here because support is the only party who can open it, and they
   * decide from this screen. `usedAt` is as important as `grantedAt`: without
   * it the console cannot tell "she has not got round to it" from "she has
   * already changed it once", and those want opposite answers on a call.
   */
  addressEdit: {
    grantedAt: Date | null
    grantedBy: string | null
    usedAt: Date | null
    /** Whether the customer can act on it right now, status included. */
    open: boolean
  }
}

/** Full order — items (purchase-time snapshots), customer and shipping. */
export async function getOrder(brand: Brand, id: string): Promise<OrderDetail | null> {
  const prisma = dbFor(brand)
  try {
    const r = await prisma.order.findUnique({
      where: { id },
      include: {
        user: { select: { name: true, email: true, phone: true } },
        address: true,
        coupon: { select: { code: true, type: true, value: true } },
        items: { orderBy: { productName: 'asc' } },
      },
    })
    if (!r) return null

    return {
      id: r.id,
      orderNo: r.orderNo,
      status: r.status,
      channel: r.channel,
      placedAt: r.placedAt,
      subtotal: r.subtotal,
      discount: r.discount,
      coupon: r.coupon
        ? { code: r.coupon.code, type: r.coupon.type, value: r.coupon.value }
        : null,
      shipping: r.shipping,
      total: r.total,
      customer: r.user
        ? { name: r.user.name ?? 'Guest', email: r.user.email, phone: r.user.phone }
        : null,
      address: r.address
        ? {
            name: r.address.name,
            line: r.address.line,
            city: r.address.city,
            state: r.address.state,
            pincode: r.address.pincode,
            phone: r.address.phone,
          }
        : null,
      addressEdit: {
        grantedAt: r.addressEditGrantedAt,
        grantedBy: r.addressEditGrantedBy,
        usedAt: r.addressEditUsedAt,
        open: addressEditState(r).open,
      },
      items: r.items.map((it) => ({
        id: it.id,
        productName: it.productName,
        variantLabel: it.variantLabel,
        unitPrice: it.unitPrice,
        qty: it.qty,
        lineTotal: it.lineTotal,
      })),
    }
  } catch (err) {
    console.error(`Failed to get order ${id}:`, err)
    return null
  }
}

/**
 * States that still hold a stock reservation (checkout/renewal decremented on
 * order create; it isn't given back until the order is cancelled or refunded).
 * Cancelling FROM one of these must restore stock; cancelling from any other
 * state (already cancelled/refunded ⇒ released; delivered ⇒ goods shipped) must
 * not, so a re-cancel never double-restores.
 */
const STOCK_RESERVING_STATUSES: OrderStatus[] = ['pending', 'paid', 'processing', 'shipped']

/**
 * Set an order's status. Returns the refreshed detail, or null when no such
 * order exists (a missing id becomes a clean 404 at the route rather than a 500).
 *
 * Transitioning TO 'cancelled' also RELEASES the reserved stock — the mirror of
 * checkout's decrement, mirroring refundOrder's give-back. It runs in one
 * transaction and is gated by a compare-and-swap: only the caller that actually
 * flips a reservation-holding order to 'cancelled' restores stock, so concurrent
 * or repeated cancels can't restore the same lines twice.
 */
export async function updateOrderStatus(brand: Brand, id: string, status: OrderStatus): Promise<OrderDetail | null> {
  const prisma = dbFor(brand)
  // Non-cancellation transitions are a plain status flip (no stock effect).
  if (status !== 'cancelled') {
    // Only send on a REAL transition — the update is scoped to a differing
    // status so an ops double-click cannot re-notify the customer. That, plus
    // the dedupeKey on NotificationLog, makes the dispatch email single-shot.
    const res = await prisma.order.updateMany({
      where: { id, status: { not: status } },
      data: { status },
    })
    if (res.count === 0) {
      // Either the order does not exist or it was already in this status.
      return getOrder(brand, id)
    }
    if (status === 'shipped' || status === 'delivered') {
      const order = await prisma.order.findUnique({ where: { id }, select: { orderNo: true } })
      // Dispatch is email-only: there is no approved WhatsApp template for
      // `shipped`, and the delivered one says the order "has been" completed.
      if (order && status === 'shipped') await sendOrderStatusEmail(brand, order.orderNo, 'shipped')
      if (order && status === 'delivered') await sendOrderStatusWhatsapp(brand, order.orderNo, 'delivered')
    }
    return getOrder(brand, id)
  }

  const outcome = await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id },
      include: { items: { select: { variantId: true, qty: true } } },
    })
    if (!order) return { kind: 'missing' as const }

    // CAS gate: flip to 'cancelled' ONLY from a reservation-holding state. The
    // updateMany row-locks, so exactly one concurrent caller gets count 1 (and
    // restores stock); a second attempt re-evaluates against the now-'cancelled'
    // row, matches nothing, and skips the restore.
    const claimed = await tx.order.updateMany({
      where: { id, status: { in: STOCK_RESERVING_STATUSES } },
      data: { status: 'cancelled' },
    })

    if (claimed.count > 0) {
      // Give the reserved stock back — one atomic increment per line.
      for (const it of order.items) {
        await tx.productVariant.update({
          where: { id: it.variantId },
          data: { stock: { increment: it.qty } },
        })
      }
      if (order.couponId) {
        await tx.coupon.updateMany({
          where: { id: order.couponId, usedCount: { gt: 0 } },
          data: { usedCount: { decrement: 1 } },
        })
      }
    } else if (order.status !== 'cancelled') {
      // Not holding a reservation (e.g. delivered/refunded) and not already
      // cancelled — honor the requested status change without touching stock.
      await tx.order.update({ where: { id }, data: { status: 'cancelled' } })
    }

    // Only a REAL transition tells the customer. An order that was already
    // cancelled goes through this branch every time an ops click re-submits it,
    // and "we're sorry to inform you" is not a message to send twice. The
    // dedupeKey would catch it too; this keeps the row out of the log entirely.
    const transitioned = claimed.count > 0 || order.status !== 'cancelled'
    return { kind: 'ok' as const, transitioned, orderNo: order.orderNo }
  })

  if (outcome.kind === 'missing') return null
  // Outside the transaction: a Meta round-trip has no business holding a stock
  // restore open, and sendOrderStatusWhatsapp never throws.
  if (outcome.transitioned) await sendOrderStatusWhatsapp(brand, outcome.orderNo, 'cancelled')
  return getOrder(brand, id)
}

/**
 * Thrown when a refund is requested on an order that isn't in a refundable
 * state. A distinct type (rather than a bare Error) lets the route map it to a
 * 400 "can't refund" instead of a generic 500 — the id exists, the action just
 * isn't allowed right now.
 */
export class NotRefundableError extends Error {
  constructor(status: OrderStatus) {
    super(`Only a paid order can be refunded (this order is "${status}").`)
    this.name = 'NotRefundableError'
  }
}

/**
 * Refund a paid order end-to-end and return the refreshed detail.
 *
 * ORDER OF OPERATIONS MATTERS HERE, and it is not the obvious one. The whole
 * reversal used to sit inside a single transaction with the gateway call in the
 * middle of it, which read as maximally safe and was the opposite: an
 * interactive transaction has a 5s budget (see PRISMA_TRANSACTION_TIMEOUT_MS),
 * `fetch` had no timeout, and a slow-but-successful refund therefore rolled the
 * database back AFTER the money had already left. The order stayed 'paid', so
 * the status guard — the thing standing between an operator and a second
 * refund — waved the retry straight through. Money gone twice, nothing in the
 * data to say so.
 *
 * So the money moves OUTSIDE any transaction, and the sequence is built to be
 * safely repeatable rather than atomic-or-nothing:
 *
 *   1. Read and REQUIRE status 'paid'. A completed refund leaves 'refunded',
 *      so a double-click is still rejected here.
 *   2. CLAIM the payment row ('captured' -> 'refunded') with a compare-and-swap.
 *      This is what serialises two operators clicking at the same instant: only
 *      one update returns count 1, and it happens before any money moves.
 *   3. Reverse the money at the gateway, with a bounded timeout and no
 *      transaction open. razorpay.refundPayment adopts an existing refund
 *      rather than creating a second one, so a retry converges.
 *   4. Reverse the books in ONE transaction — order + payments to 'refunded',
 *      stock restored, loyalty/Thara/commission clawed back — gated by its own
 *      compare-and-swap so those side effects run exactly once.
 *
 * The in-between state (payment 'refunded', order still 'paid') is deliberate
 * and is the resume marker: it means the money went back but the books did not
 * finish. Running the refund again from there re-enters at step 3, adopts the
 * existing gateway refund, and completes step 4. A stuck order is therefore
 * fixed by clicking Refund again — never by refunding a second time.
 *
 * Returns null when no such order exists (clean 404 at the route); throws
 * NotRefundableError when the order isn't 'paid'.
 */
export async function refundOrder(brand: Brand, id: string): Promise<OrderDetail | null> {
  const prisma = dbFor(brand)

  // ── 1. Read + guard ────────────────────────────────────────────────────────
  const order = await prisma.order.findUnique({
    where: { id },
    select: {
      id: true,
      orderNo: true,
      status: true,
      total: true,
      payments: { select: { id: true, status: true, razorpayPaymentId: true } },
    },
  })
  if (!order) return null
  if (order.status !== 'paid') throw new NotRefundableError(order.status)

  // Prefer the row carrying a gateway payment id — that is the captured one.
  const payment = order.payments.find((p) => p.razorpayPaymentId) ?? order.payments[0] ?? null

  // ── 2. Claim ───────────────────────────────────────────────────────────────
  // Scoped to `status: not refunded` so exactly one caller can win. A count of
  // 0 means either a concurrent operator won the race or an earlier attempt
  // died between here and step 4 — both are resumed, not refused, because the
  // order is demonstrably still 'paid' and therefore its books are unreversed.
  let claimed = false
  if (payment) {
    const claim = await prisma.payment.updateMany({
      where: { id: payment.id, status: { not: 'refunded' } },
      data: { status: 'refunded' },
    })
    claimed = claim.count === 1
    if (!claimed) {
      console.warn(
        `[refund] ${order.orderNo}: payment already marked refunded while the order is still paid — ` +
          `resuming an interrupted refund rather than starting a new one.`,
      )
    }
  }

  // ── 3. Gateway — no transaction open, bounded, idempotent ──────────────────
  if (payment?.razorpayPaymentId) {
    try {
      const refund = await razorpay.refundPayment(brand, payment.razorpayPaymentId, order.total)
      if (refund.adopted) {
        console.warn(
          `[refund] ${order.orderNo}: adopted existing gateway refund ${refund.id} — ` +
            `a previous attempt had already returned the money.`,
        )
      }
    } catch (err) {
      // Give the claim back ONLY when the gateway is known not to have acted.
      // A timeout or a 5xx is ambiguous: the refund may well have gone through
      // and the reply been lost, so the claim stays and the operator retries
      // into the adoption path above instead of into a second refund.
      if (claimed && err instanceof razorpay.GatewayNotExecutedError) {
        await prisma.payment.updateMany({
          where: { id: payment.id },
          data: { status: payment.status },
        })
      } else if (claimed) {
        console.error(
          `[refund] ${order.orderNo}: gateway outcome UNKNOWN for payment ${payment.razorpayPaymentId}. ` +
            `The claim is held and the order left 'paid' — retry the refund to converge.`,
          err,
        )
      }
      throw err
    }
  }

  // ── 4. Reverse the books ───────────────────────────────────────────────────
  const outcome = await prisma.$transaction(async (tx) => {
    // Compare-and-swap on 'paid' — the once-only gate for every side effect
    // below, so a concurrent caller that also got past step 1 cannot
    // double-restore stock or double-reverse points.
    const claimedOrder = await tx.order.updateMany({
      where: { id, status: 'paid' },
      data: { status: 'refunded' },
    })
    if (claimedOrder.count === 0) return { kind: 'already' as const }

    const detail = await tx.order.findUnique({
      where: { id },
      select: {
        couponId: true,
        items: { select: { variantId: true, qty: true } },
        points: { select: { userId: true, delta: true } },
      },
    })
    if (!detail) return { kind: 'already' as const }

    await tx.payment.updateMany({ where: { orderId: id }, data: { status: 'refunded' } })
    if (detail.couponId) {
      await tx.coupon.updateMany({
        where: { id: detail.couponId, usedCount: { gt: 0 } },
        data: { usedCount: { decrement: 1 } },
      })
    }

    // Give the reserved stock back.
    for (const it of detail.items) {
      await tx.productVariant.update({
        where: { id: it.variantId },
        data: { stock: { increment: it.qty } },
      })
    }

    // Reverse the loyalty award. Summing the ledger rows tied to this order gives
    // exactly what checkout granted (a single positive row: base points + bonus);
    // the compare-and-swap above means no prior refund row can be in this set.
    // Skip when nothing was awarded — a guest order carries no user, and
    // PointsLedger.userId is non-null, so there is no row to reverse against.
    const awarded = detail.points.reduce((sum, p) => sum + p.delta, 0)
    if (awarded > 0) {
      // Every award row shares the customer's id; take it from the row rather
      // than the nullable Order.userId so the reversal lands on the right ledger.
      const userId = detail.points[0].userId
      const prior = await tx.pointsLedger.aggregate({
        where: { userId },
        _sum: { delta: true },
      })
      const balanceAfter = (prior._sum.delta ?? 0) - awarded
      await tx.pointsLedger.create({
        data: {
          userId,
          delta: -awarded,
          reason: `Refund ${order.orderNo}`,
          orderId: id,
          balanceAfter,
        },
      })
    }

    // Thara: reverse any commission that was accrued for this order, AND give
    // back any Thara credit that was spent on this order (so a refund is whole
    // for the buyer). Both live on the TharaCreditLedger; the helper reads it.
    await reverseTharaCreditForRefund(tx, id)

    // Thara: reverse any reward-points earned for this order (mirror-signed).
    await reverseTharaPointsForRefund(tx, id)

    // The creator's commission, same treatment: a refunded order is not a sale,
    // and the console's Earnings column is what an operator pays out from.
    await reverseOrderCommission(tx, id)

    return { kind: 'ok' as const }
  })

  if (outcome.kind === 'already') {
    console.warn(`[refund] ${order.orderNo}: books were already reversed by a concurrent refund.`)
  }
  return getOrder(brand, id)
}

/**
 * Open or close the one-time address correction on a single order.
 *
 * Granting CLEARS `addressEditUsedAt`. That is deliberate and is the only way
 * a second correction is possible: the customer gets one save per grant, and
 * support consciously giving her another is a different thing from her having
 * an open-ended right to edit. Revoking leaves `usedAt` alone, because it is
 * history — whether she already changed the address once stays true after the
 * window is shut.
 *
 * `grantedBy` records which admin opened it. It is the admin's email as free
 * text, not a relation: admin identity lives in the `platform` schema, which a
 * brand's Prisma client cannot reach, so a foreign key is not expressible.
 *
 * Returns null when no such order exists, so the route answers 404 rather than
 * reporting success for an order it never touched.
 */
export async function setOrderAddressEditGrant(
  brand: Brand,
  id: string,
  granted: boolean,
  grantedBy: string,
): Promise<{ orderNo: string; grantedAt: Date | null; usedAt: Date | null } | null> {
  const prisma = dbFor(brand)
  try {
    const updated = await prisma.order.update({
      where: { id },
      data: granted
        ? { addressEditGrantedAt: new Date(), addressEditGrantedBy: grantedBy, addressEditUsedAt: null }
        : { addressEditGrantedAt: null, addressEditGrantedBy: null },
      select: { orderNo: true, addressEditGrantedAt: true, addressEditUsedAt: true },
    })
    return {
      orderNo: updated.orderNo,
      grantedAt: updated.addressEditGrantedAt,
      usedAt: updated.addressEditUsedAt,
    }
  } catch {
    // Prisma throws P2025 for a missing row; the caller only needs "not found".
    return null
  }
}
