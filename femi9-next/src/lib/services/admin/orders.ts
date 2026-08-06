import 'server-only'
import { prisma } from '@/lib/db'
import type { OrderStatus, Prisma } from '@prisma/client'
import * as razorpay from '@/lib/razorpay'

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
export async function listOrders({ status, q, page = 1 }: ListOrdersArgs = {}): Promise<OrderListResult> {
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

  const current = Math.max(1, Math.floor(page) || 1)

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

export interface OrderDetail {
  id: string
  orderNo: string
  status: OrderStatus
  channel: string
  placedAt: Date
  subtotal: number
  discount: number
  shipping: number
  total: number
  customer: OrderCustomer | null
  address: OrderAddress | null
  items: OrderLine[]
}

/** Full order — items (purchase-time snapshots), customer and shipping. */
export async function getOrder(id: string): Promise<OrderDetail | null> {
  const r = await prisma.order.findUnique({
    where: { id },
    include: {
      user: { select: { name: true, email: true, phone: true } },
      address: true,
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
    items: r.items.map((it) => ({
      id: it.id,
      productName: it.productName,
      variantLabel: it.variantLabel,
      unitPrice: it.unitPrice,
      qty: it.qty,
      lineTotal: it.lineTotal,
    })),
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
export async function updateOrderStatus(id: string, status: OrderStatus): Promise<OrderDetail | null> {
  // Non-cancellation transitions are a plain status flip (no stock effect).
  if (status !== 'cancelled') {
    const res = await prisma.order.updateMany({ where: { id }, data: { status } })
    if (res.count === 0) return null
    return getOrder(id)
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
    } else if (order.status !== 'cancelled') {
      // Not holding a reservation (e.g. delivered/refunded) and not already
      // cancelled — honor the requested status change without touching stock.
      await tx.order.update({ where: { id }, data: { status: 'cancelled' } })
    }

    return { kind: 'ok' as const }
  })

  if (outcome.kind === 'missing') return null
  return getOrder(id)
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
 * One transaction guards the whole reversal so a partial failure can never leave
 * money refunded but stock/points un-restored (or vice versa):
 *   1. Re-read the order under the txn and REQUIRE status 'paid' — this is also
 *      the idempotency gate, so a double-click on an already-'refunded' order is
 *      rejected instead of restoring stock / reversing points twice.
 *   2. Reverse the money at the gateway (razorpay.refundPayment, mock-safe: no
 *      network call until real keys are set) for the full order total.
 *   3. Flip the order and its Payment row(s) to 'refunded'.
 *   4. Restore each line's variant stock — the mirror of checkout's decrement.
 *   5. Write ONE negative PointsLedger row clawing back exactly the points that
 *      were awarded for this order (base + any welcome bonus), with a running
 *      balanceAfter so the customer's points history still reads like a statement.
 *
 * Returns null when no such order exists (clean 404 at the route); throws
 * NotRefundableError when the order isn't 'paid'.
 */
export async function refundOrder(id: string): Promise<OrderDetail | null> {
  const outcome = await prisma.$transaction(async (tx) => {
    // Pull items (to give stock back), payments (to refund + flip), and the
    // loyalty rows tied to this order (to reverse) in the same read the guard
    // sees, so the decision and the writes share one consistent snapshot.
    const order = await tx.order.findUnique({
      where: { id },
      include: {
        items: { select: { variantId: true, qty: true } },
        payments: true,
        points: true,
      },
    })
    if (!order) return { kind: 'missing' as const }
    if (order.status !== 'paid') return { kind: 'not_paid' as const, status: order.status }

    // Reverse the money first. Prefer the captured row (the one carrying a
    // gateway payment id) and refund the full order total. razorpayPaymentId is
    // nullable in the schema, so only call the gateway when we actually have one
    // — in mock mode markOrderPaid still stamps a synthetic id, so a normal paid
    // order always does.
    const payment = order.payments.find((p) => p.razorpayPaymentId) ?? order.payments[0] ?? null
    if (payment?.razorpayPaymentId) {
      await razorpay.refundPayment(payment.razorpayPaymentId, order.total)
    }

    // Order + payment(s) → refunded. updateMany covers the (normal) single
    // captured row without needing to thread its id through.
    await tx.order.update({ where: { id }, data: { status: 'refunded' } })
    await tx.payment.updateMany({ where: { orderId: id }, data: { status: 'refunded' } })

    // Give the reserved stock back.
    for (const it of order.items) {
      await tx.productVariant.update({
        where: { id: it.variantId },
        data: { stock: { increment: it.qty } },
      })
    }

    // Reverse the loyalty award. Summing the ledger rows tied to this order gives
    // exactly what checkout granted (a single positive row: base points + bonus);
    // the status guard means no prior refund row can be in this set. Skip when
    // nothing was awarded — a guest order carries no user, and PointsLedger.userId
    // is non-null, so there is no row to reverse against.
    const awarded = order.points.reduce((sum, p) => sum + p.delta, 0)
    if (awarded > 0) {
      // Every award row shares the customer's id; take it from the row rather
      // than the nullable Order.userId so the reversal lands on the right ledger.
      const userId = order.points[0].userId
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

    return { kind: 'ok' as const }
  })

  if (outcome.kind === 'missing') return null
  if (outcome.kind === 'not_paid') throw new NotRefundableError(outcome.status)
  return getOrder(id)
}
