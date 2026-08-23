import { describe, it, expect, beforeEach, vi } from 'vitest'
import { prisma, resetDb, seedSettings, makeProduct, cartWith } from '../helpers/db'
import { placeOrder, markOrderPaid, type CheckoutCustomer } from '@femi9/core/services/checkout'
import { refundOrder, NotRefundableError } from '@femi9/core/services/admin/orders'

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
  const result = await placeOrder(token, CUSTOMER)
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
    await markOrderPaid(captureArgs(order.orderNo))

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
    await markOrderPaid(captureArgs(order.orderNo))
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
})
