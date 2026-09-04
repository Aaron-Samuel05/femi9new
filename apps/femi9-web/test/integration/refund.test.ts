import { describe, it, expect, beforeEach, vi } from 'vitest'
import { prisma, resetDb, seedSettings, makeProduct, cartWith } from '../helpers/db'
import { placeOrder, markOrderPaid, type CheckoutCustomer } from '@femi9/core/services/checkout'
import {
  getOrder,
  recordGatewayRefund,
  refundOrder,
  updateOrderStatus,
  NotRefundableError,
} from '@femi9/core/services/admin/orders'

/**
 * Refund integration tests.
 *
 * A refund must fully reverse a paid order in one shot: flip to 'refunded',
 * give the reserved stock back, and claw back exactly the loyalty points that
 * were awarded — while being gated so it only ever runs on a genuinely 'paid'
 * order (the idempotency / state guard). A reverted guard would let a refund
 * run twice and double-restore stock / double-reverse points.
 */

vi.mock('next/headers', () => ({
  cookies: () => ({ get: () => undefined }),
}))

const POINTS_PER_RUPEE = 1
const FIRST_ORDER_BONUS = 100

const CUSTOMER: CheckoutCustomer = {
  name: 'Refund Buyer',
  phone: '9992223333',
  line: '2 Test Rd',
  city: 'Chennai',
}

async function placeTestOrder(opts?: { price?: number; qty?: number; stock?: number }) {
  const price = opts?.price ?? 500
  const qty = opts?.qty ?? 3
  const stock = opts?.stock ?? 50
  const { variant } = await makeProduct({ price, stock })
  const token = `tok-${Math.random().toString(36).slice(2, 10)}`
  await cartWith(token, variant.id, qty)
  const result = await placeOrder('femi9', token, CUSTOMER)
  const order = await prisma.order.findUniqueOrThrow({ where: { orderNo: result.orderNo } })
  return { order, variant, qty, initialStock: stock }
}

function captureArgs(orderNo: string) {
  return {
    orderNo,
    razorpayPaymentId: 'pay_mock_1',
    razorpayOrderId: `mock_${orderNo}`,
    signatureVerified: false,
    method: 'upi',
  }
}

async function stockOf(variantId: string): Promise<number> {
  const v = await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } })
  return v.stock
}

async function pointsSum(userId: string): Promise<number> {
  const agg = await prisma.pointsLedger.aggregate({ where: { userId }, _sum: { delta: true } })
  return agg._sum.delta ?? 0
}

describe('refund', () => {
  beforeEach(async () => {
    await resetDb()
    await seedSettings()
  })

  it('refunds a paid order: status → refunded, stock restored, points reversed', async () => {
    const { order, variant, qty, initialStock } = await placeTestOrder()
    await markOrderPaid('femi9', captureArgs(order.orderNo))

    const expectedPoints = Math.round(order.total * POINTS_PER_RUPEE) + FIRST_ORDER_BONUS // 1600
    // Stock was decremented at checkout; points awarded at capture.
    const stockBeforeRefund = await stockOf(variant.id)
    expect(stockBeforeRefund).toBe(initialStock - qty)
    expect(await pointsSum(order.userId!)).toBe(expectedPoints)

    const detail = await refundOrder('femi9', order.id)
    expect(detail).not.toBeNull()
    expect(detail!.status).toBe('refunded')

    const refunded = await prisma.order.findUniqueOrThrow({ where: { id: order.id } })
    expect(refunded.status).toBe('refunded')

    // Stock restored (+qty), back to where it started.
    const stockAfter = await stockOf(variant.id)
    expect(stockAfter).toBe(stockBeforeRefund + qty)
    expect(stockAfter).toBe(initialStock)

    // Payment flipped to refunded.
    const payment = await prisma.payment.findFirstOrThrow({ where: { orderId: order.id } })
    expect(payment.status).toBe('refunded')

    // A negative ledger row reverses exactly the award; balance back to prior (0).
    const rows = await prisma.pointsLedger.findMany({
      where: { userId: order.userId! },
      orderBy: { createdAt: 'asc' },
    })
    expect(rows).toHaveLength(2)
    expect(rows[0].delta).toBe(expectedPoints)
    expect(rows[1].delta).toBe(-expectedPoints)
    expect(await pointsSum(order.userId!)).toBe(0)
  })

  it('refunding a non-paid (pending) order throws NotRefundableError and changes nothing', async () => {
    const { order, variant, initialStock, qty } = await placeTestOrder()
    expect(order.status).toBe('pending')

    await expect(refundOrder('femi9', order.id)).rejects.toBeInstanceOf(NotRefundableError)

    const after = await prisma.order.findUniqueOrThrow({ where: { id: order.id } })
    expect(after.status).toBe('pending')
    // Stock still reserved, no reversal ledger written.
    expect(await stockOf(variant.id)).toBe(initialStock - qty)
    expect(await prisma.pointsLedger.count()).toBe(0)
  })

  it('refunding twice throws NotRefundableError on the second call (no double reversal)', async () => {
    const { order, variant, initialStock } = await placeTestOrder()
    await markOrderPaid('femi9', captureArgs(order.orderNo))
    const expectedPoints = Math.round(order.total * POINTS_PER_RUPEE) + FIRST_ORDER_BONUS

    // First refund succeeds.
    await refundOrder('femi9', order.id)
    const stockAfterFirst = await stockOf(variant.id)
    expect(stockAfterFirst).toBe(initialStock)
    expect(await pointsSum(order.userId!)).toBe(0)

    // Second refund is rejected by the state guard.
    await expect(refundOrder('femi9', order.id)).rejects.toBeInstanceOf(NotRefundableError)

    // Nothing double-restored / double-reversed.
    expect(await stockOf(variant.id)).toBe(initialStock)
    expect(await pointsSum(order.userId!)).toBe(0)
    // Exactly the award + the single reversal, no extra rows.
    expect(await prisma.pointsLedger.count()).toBe(2)
    const reversals = await prisma.pointsLedger.count({ where: { delta: -expectedPoints } })
    expect(reversals).toBe(1)
  })
  /**
   * The interrupted-refund state, and why it must be RESUMED rather than
   * refused.
   *
   * The gateway call happens outside any transaction, so a crash (or a lost
   * reply) can land between "money returned" and "books reversed". That leaves
   * payment='refunded' while order='paid' — the resume marker. Refusing here
   * would strand the order forever: stock never given back, points never clawed
   * back, and an operator with no way forward except editing the database.
   *
   * Running the refund again must therefore complete the reversal, and must do
   * it exactly once. (The gateway half is what stops the money moving twice —
   * refundPayment adopts the existing refund; see the unit tests.)
   */
  it('resumes an interrupted refund (payment refunded, order still paid) without double-reversing', async () => {
    const { order, variant, qty, initialStock } = await placeTestOrder()
    await markOrderPaid('femi9', captureArgs(order.orderNo))
    const expectedPoints = Math.round(order.total * POINTS_PER_RUPEE) + FIRST_ORDER_BONUS

    const stockBefore = await stockOf(variant.id)
    expect(stockBefore).toBe(initialStock - qty)

    // Simulate the crash window: the claim was taken and the money went back,
    // then the process died before the books were reversed.
    await prisma.payment.updateMany({
      where: { orderId: order.id },
      data: { status: 'refunded' },
    })
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe('paid')

    const detail = await refundOrder('femi9', order.id)
    expect(detail!.status).toBe('refunded')

    // The reversal completed — exactly once.
    expect(await stockOf(variant.id)).toBe(initialStock)
    expect(await pointsSum(order.userId!)).toBe(0)
    expect(await prisma.pointsLedger.count()).toBe(2)
    const reversals = await prisma.pointsLedger.count({ where: { delta: -expectedPoints } })
    expect(reversals).toBe(1)

    // And it is now genuinely finished: a further attempt is refused.
    await expect(refundOrder('femi9', order.id)).rejects.toBeInstanceOf(NotRefundableError)
    expect(await stockOf(variant.id)).toBe(initialStock)
  })

  /**
   * Two operators clicking Refund at the same instant. Both can pass the status
   * guard (it is a read), so the once-only guarantee has to come from the two
   * compare-and-swaps — on the payment row before the money moves, and on the
   * order row before the books are touched. Neither caller may throw, and the
   * side effects must land exactly once.
   */
  it('is safe under concurrent refunds: stock and points reverse exactly once', async () => {
    const { order, variant, initialStock } = await placeTestOrder()
    await markOrderPaid('femi9', captureArgs(order.orderNo))
    const expectedPoints = Math.round(order.total * POINTS_PER_RUPEE) + FIRST_ORDER_BONUS

    const results = await Promise.allSettled([
      refundOrder('femi9', order.id),
      refundOrder('femi9', order.id),
    ])
    // Both settle without an unhandled failure; at least one refunds.
    const fulfilled = results.filter((r) => r.status === 'fulfilled')
    expect(fulfilled.length).toBeGreaterThanOrEqual(1)

    const after = await prisma.order.findUniqueOrThrow({ where: { id: order.id } })
    expect(after.status).toBe('refunded')

    // The whole point: one restore, one clawback.
    expect(await stockOf(variant.id)).toBe(initialStock)
    expect(await pointsSum(order.userId!)).toBe(0)
    expect(await prisma.pointsLedger.count({ where: { delta: -expectedPoints } })).toBe(1)
  })
})

/**
 * A PAID order that gets cancelled.
 *
 * Not a corner case: it is what the console produced every time an operator
 * picked "cancelled" from the status dropdown on an order that had been paid
 * for. The cancel restores stock and gives the coupon back, and touches neither
 * the gateway nor the payment row — so the money stayed with us, on an order
 * whose books already said the sale was reversed. `refundOrder`'s guard was
 * `status === 'paid'` and the console only drew the Refund button on a paid
 * order, so there was no way back through this system: it took a refund by hand
 * in the Razorpay dashboard plus a manual database correction, and nothing
 * anywhere said so.
 *
 * The rule these pin down is the one that is a STOCK bug when it is got wrong.
 * The cancel already gave the stock and the coupon back, so refunding from
 * `cancelled` must not do it a second time — while the loyalty points, which
 * the cancel never touched, must still be reversed.
 */
describe('refund after cancel', () => {
  beforeEach(async () => {
    await resetDb()
    await seedSettings()
  })

  it('cancelling a paid order gives the stock back and keeps the money', async () => {
    const { order, variant, initialStock } = await placeTestOrder()
    await markOrderPaid('femi9', captureArgs(order.orderNo))
    const expectedPoints = Math.round(order.total * POINTS_PER_RUPEE) + FIRST_ORDER_BONUS

    await updateOrderStatus('femi9', order.id, 'cancelled')

    const after = await prisma.order.findUniqueOrThrow({ where: { id: order.id } })
    expect(after.status).toBe('cancelled')
    // Stock came back...
    expect(await stockOf(variant.id)).toBe(initialStock)
    // ...and the money did not. That is the whole problem.
    const payments = await prisma.payment.findMany({ where: { orderId: order.id } })
    expect(payments.every((p) => p.status === 'captured')).toBe(true)
    // She is also still holding the points for a purchase that was undone.
    expect(await pointsSum(order.userId!)).toBe(expectedPoints)
  })

  it('refunds a cancelled order whose money was never returned', async () => {
    const { order, variant, initialStock } = await placeTestOrder()
    await markOrderPaid('femi9', captureArgs(order.orderNo))
    await updateOrderStatus('femi9', order.id, 'cancelled')

    const detail = await refundOrder('femi9', order.id)
    expect(detail).not.toBeNull()
    expect(detail!.status).toBe('refunded')

    const payments = await prisma.payment.findMany({ where: { orderId: order.id } })
    expect(payments.every((p) => p.status === 'refunded')).toBe(true)
    // The points the cancel left behind are reversed.
    expect(await pointsSum(order.userId!)).toBe(0)
    // And the stock is NOT restored twice — it came back at cancellation, and a
    // second increment would invent inventory that does not exist.
    expect(await stockOf(variant.id)).toBe(initialStock)
  })

  it('reports a cancelled order that still holds its money as refundable', async () => {
    const { order } = await placeTestOrder()
    await markOrderPaid('femi9', captureArgs(order.orderNo))
    await updateOrderStatus('femi9', order.id, 'cancelled')

    // What draws the console's Refund button. It used to be `status === 'paid'`
    // in the page, which is exactly why the button was missing here.
    const detail = await getOrder('femi9', order.id)
    expect(detail!.refundable).toBe(true)

    await refundOrder('femi9', order.id)
    const settled = await getOrder('femi9', order.id)
    expect(settled!.refundable).toBe(false)
  })

  it('refuses a cancelled order that was never paid for', async () => {
    // No captured payment, so there is nothing to give back and the Refund
    // button must not appear on it.
    const { order, variant, initialStock } = await placeTestOrder()
    await updateOrderStatus('femi9', order.id, 'cancelled')

    const detail = await getOrder('femi9', order.id)
    expect(detail!.refundable).toBe(false)
    await expect(refundOrder('femi9', order.id)).rejects.toBeInstanceOf(NotRefundableError)
    expect(await stockOf(variant.id)).toBe(initialStock)
  })

  it('resumes a cancelled-order refund that died after the money went back', async () => {
    // The money moves before the books are reversed, so a crash in between
    // leaves the payment `refunded` on an order that is still `cancelled`.
    // For a PAID order the retry works because the guard reads the order's
    // status, which the interruption did not touch. Guarding the cancelled case
    // on a `captured` payment alone would refuse this retry and strand the
    // order a second way — see refundableFrom.
    const { order, variant, initialStock } = await placeTestOrder()
    await markOrderPaid('femi9', captureArgs(order.orderNo))
    await updateOrderStatus('femi9', order.id, 'cancelled')
    await prisma.payment.updateMany({
      where: { orderId: order.id },
      data: { status: 'refunded' },
    })

    const detail = await getOrder('femi9', order.id)
    expect(detail!.refundable).toBe(true)

    const resumed = await refundOrder('femi9', order.id)
    expect(resumed!.status).toBe('refunded')
    expect(await pointsSum(order.userId!)).toBe(0)
    expect(await stockOf(variant.id)).toBe(initialStock)
  })

  it('refuses a second refund of a cancelled order', async () => {
    const { order, variant, initialStock } = await placeTestOrder()
    await markOrderPaid('femi9', captureArgs(order.orderNo))
    await updateOrderStatus('femi9', order.id, 'cancelled')

    await refundOrder('femi9', order.id)
    await expect(refundOrder('femi9', order.id)).rejects.toBeInstanceOf(NotRefundableError)
    expect(await stockOf(variant.id)).toBe(initialStock)
    expect(await pointsSum(order.userId!)).toBe(0)
  })
})

/**
 * A refund taken in the Razorpay DASHBOARD instead of in the console.
 *
 * Until `refund.processed` was handled, nothing in this database ever heard
 * about it: the order stayed paid, the payment row stayed captured, the customer
 * kept her points, the creator kept the commission, and every sales figure in
 * the console counted a sale that had been reversed. Nothing on any screen
 * looked wrong — the same shape as the unscheduled-cron failures.
 */
describe('recordGatewayRefund', () => {
  beforeEach(async () => {
    await resetDb()
    await seedSettings()
  })

  it('books a dashboard refund on a paid order exactly as the console would', async () => {
    const { order, variant, initialStock } = await placeTestOrder()
    await markOrderPaid('femi9', captureArgs(order.orderNo))

    await recordGatewayRefund('femi9', 'pay_mock_1')

    const after = await prisma.order.findUniqueOrThrow({ where: { id: order.id } })
    expect(after.status).toBe('refunded')
    expect(await stockOf(variant.id)).toBe(initialStock)
    expect(await pointsSum(order.userId!)).toBe(0)
  })

  it('is idempotent under Razorpay redelivery', async () => {
    const { order, variant, initialStock } = await placeTestOrder()
    await markOrderPaid('femi9', captureArgs(order.orderNo))

    // Razorpay redelivers until the event is acknowledged, and a partial refund
    // raises one event per refund against the same payment.
    await recordGatewayRefund('femi9', 'pay_mock_1')
    await recordGatewayRefund('femi9', 'pay_mock_1')
    await recordGatewayRefund('femi9', 'pay_mock_1')

    expect(await stockOf(variant.id)).toBe(initialStock)
    expect(await pointsSum(order.userId!)).toBe(0)
    // One award and exactly one reversal — never a second.
    expect(await prisma.pointsLedger.count()).toBe(2)
  })

  it('completes a cancelled order without restoring its stock again', async () => {
    const { order, variant, initialStock } = await placeTestOrder()
    await markOrderPaid('femi9', captureArgs(order.orderNo))
    await updateOrderStatus('femi9', order.id, 'cancelled')

    await recordGatewayRefund('femi9', 'pay_mock_1')

    const after = await prisma.order.findUniqueOrThrow({ where: { id: order.id } })
    expect(after.status).toBe('refunded')
    expect(await stockOf(variant.id)).toBe(initialStock)
    expect(await pointsSum(order.userId!)).toBe(0)
  })

  it('marks the payment but leaves a shipped order alone, for a human', async () => {
    // Whether the goods can come back depends on where the parcel physically is,
    // which no webhook payload knows. Guessing would be worse than an alert:
    // silently restoring stock for a box on a van is a phantom unit.
    const { order, variant, qty, initialStock } = await placeTestOrder()
    await markOrderPaid('femi9', captureArgs(order.orderNo))
    await updateOrderStatus('femi9', order.id, 'shipped')

    await recordGatewayRefund('femi9', 'pay_mock_1')

    const after = await prisma.order.findUniqueOrThrow({ where: { id: order.id } })
    expect(after.status).toBe('shipped')
    const payments = await prisma.payment.findMany({ where: { orderId: order.id } })
    expect(payments.every((p) => p.status === 'refunded')).toBe(true)
    expect(await stockOf(variant.id)).toBe(initialStock - qty)
  })

  it('ignores a refund for a payment this brand has never seen', async () => {
    // Both brands' webhooks call this and each only knows its own payments, so
    // on the wrong brand a miss is the normal answer, not an error.
    await expect(recordGatewayRefund('femi9', 'pay_not_ours')).resolves.toBeUndefined()
  })
})
