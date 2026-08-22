import { describe, it, expect, beforeEach, vi } from 'vitest'
import { prisma, resetDb, seedSettings, makeProduct, cartWith } from '../helpers/db'
import {
  placeOrder,
  markOrderPaid,
  PaymentAmountMismatchError,
  PaymentIntentMissingError,
  OrderNotPayableError,
  pendingPaymentIntent,
  type CheckoutCustomer,
} from '@femi9/core/services/checkout'

/**
 * Payment capture integration tests.
 *
 * These lock in the security-critical invariants of the checkout money path:
 *  - a Payment intent is opened for exactly the server-computed total,
 *  - loyalty points are granted ON CAPTURE (markOrderPaid), never at checkout,
 *    and exactly once (a re-delivered webhook / double-submit is idempotent),
 *  - and a capture is REFUSED unless a matching Payment intent exists whose
 *    amount equals the order total (the amount/intent guard). A reverted guard
 *    would let a tampered or intent-less capture flip an order to paid.
 */

// placeOrder reads the referral cookie from the Next request scope. Outside a
// request there is none — stub it so no ref is attributed.
vi.mock('next/headers', () => ({
  cookies: () => ({ get: () => undefined }),
}))

// Mirrors seedSettings(): points = round(total * rate) + a one-time first-order bonus.
const POINTS_PER_RUPEE = 1
const FIRST_ORDER_BONUS = 100

const CUSTOMER: CheckoutCustomer = {
  name: 'Test Buyer',
  phone: '9990001111',
  line: '1 Test St',
  city: 'Chennai',
}

/** Build a fresh product+cart and place an order. price*qty=1500 ≥ free-ship → total 1500. */
async function placeTestOrder(opts?: { price?: number; qty?: number; stock?: number }) {
  const price = opts?.price ?? 500
  const qty = opts?.qty ?? 3
  const stock = opts?.stock ?? 50
  const { variant } = await makeProduct({ price, stock })
  const token = `tok-${Math.random().toString(36).slice(2, 10)}`
  await cartWith(token, variant.id, qty)
  const result = await placeOrder(token, CUSTOMER)
  const order = await prisma.order.findUniqueOrThrow({ where: { orderNo: result.orderNo } })
  return { result, order, variant, qty }
}

/** Faithful mock-path capture args (matches the intent's gateway order id). */
function captureArgs(orderNo: string, razorpayPaymentId = 'pay_mock_1') {
  return {
    orderNo,
    razorpayPaymentId,
    razorpayOrderId: `mock_${orderNo}`,
    signatureVerified: false,
    method: 'upi',
  }
}

async function pointsSum(userId: string): Promise<number> {
  const agg = await prisma.pointsLedger.aggregate({ where: { userId }, _sum: { delta: true } })
  return agg._sum.delta ?? 0
}

describe('payment capture', () => {
  beforeEach(async () => {
    await resetDb()
    await seedSettings()
  })

  it('opens a "created" Payment for exactly the order total, and awards NO points yet', async () => {
    const { result, order } = await placeTestOrder()

    const payment = await prisma.payment.findFirstOrThrow({ where: { orderId: order.id } })
    expect(payment.status).toBe('created')
    expect(payment.amount).toBe(order.total)
    expect(payment.razorpayPaymentId).toBeNull()

    // Points are granted on capture, not at checkout — the ledger must be empty here.
    expect(order.status).toBe('pending')
    expect(await pointsSum(order.userId!)).toBe(0)
    expect(await prisma.pointsLedger.count()).toBe(0)
    // Sanity: total was recomputed server-side (1500, free shipping applied).
    expect(order.total).toBe(1500)
    expect(result.payment.amount).toBe(order.total)
  })

  it('reuses the pending gateway intent for a safe payment retry', async () => {
    const { result, order } = await placeTestOrder()
    await expect(pendingPaymentIntent(order.orderNo)).resolves.toEqual(result.payment)

    await markOrderPaid(captureArgs(order.orderNo))
    await expect(pendingPaymentIntent(order.orderNo)).rejects.toBeInstanceOf(OrderNotPayableError)
  })

  it('markOrderPaid flips the order to paid and awards points exactly once (idempotent)', async () => {
    const { order } = await placeTestOrder()
    const expectedPoints = Math.round(order.total * POINTS_PER_RUPEE) + FIRST_ORDER_BONUS // 1500 + 100

    const first = await markOrderPaid(captureArgs(order.orderNo))
    expect(first).toMatchObject({ ok: true, status: 'paid', alreadyPaid: false })

    const paid = await prisma.order.findUniqueOrThrow({ where: { id: order.id } })
    expect(paid.status).toBe('paid')

    const captured = await prisma.payment.findFirstOrThrow({ where: { orderId: order.id } })
    expect(captured.status).toBe('captured')
    expect(captured.razorpayPaymentId).toBe('pay_mock_1')
    expect(captured.amount).toBe(order.total)

    const sumAfterFirst = await pointsSum(order.userId!)
    expect(sumAfterFirst).toBeGreaterThan(0)
    expect(sumAfterFirst).toBe(expectedPoints)
    expect(await prisma.pointsLedger.count()).toBe(1)

    // Re-delivered webhook / double submit: same order, already paid → no re-write.
    const second = await markOrderPaid(captureArgs(order.orderNo))
    expect(second).toMatchObject({ ok: true, status: 'paid', alreadyPaid: true })

    const stillPaid = await prisma.order.findUniqueOrThrow({ where: { id: order.id } })
    expect(stillPaid.status).toBe('paid')
    // Points NOT awarded twice — one ledger row, same sum.
    expect(await prisma.pointsLedger.count()).toBe(1)
    expect(await pointsSum(order.userId!)).toBe(expectedPoints)
  })

  it('handles concurrent sync/webhook capture without awarding points twice', async () => {
    const { order } = await placeTestOrder()
    const expectedPoints = Math.round(order.total * POINTS_PER_RUPEE) + FIRST_ORDER_BONUS

    const results = await Promise.all([
      markOrderPaid(captureArgs(order.orderNo)),
      markOrderPaid(captureArgs(order.orderNo)),
    ])

    expect(results.filter((result) => result.alreadyPaid === false)).toHaveLength(1)
    expect(results.filter((result) => result.alreadyPaid === true)).toHaveLength(1)
    expect(await prisma.pointsLedger.count()).toBe(1)
    expect(await pointsSum(order.userId!)).toBe(expectedPoints)

    const payment = await prisma.payment.findFirstOrThrow({ where: { orderId: order.id } })
    expect(payment.status).toBe('captured')
  })

  it('refuses a capture whose Payment amount != order total (amount mismatch); order stays pending', async () => {
    const { order } = await placeTestOrder()

    // Tamper the intent so its amount no longer matches what we charged.
    const payment = await prisma.payment.findFirstOrThrow({ where: { orderId: order.id } })
    await prisma.payment.update({ where: { id: payment.id }, data: { amount: order.total + 1 } })

    await expect(markOrderPaid(captureArgs(order.orderNo))).rejects.toBeInstanceOf(
      PaymentAmountMismatchError,
    )

    const after = await prisma.order.findUniqueOrThrow({ where: { id: order.id } })
    expect(after.status).toBe('pending')
    // No capture, no points.
    const untouched = await prisma.payment.findFirstOrThrow({ where: { orderId: order.id } })
    expect(untouched.status).toBe('created')
    expect(untouched.razorpayPaymentId).toBeNull()
    expect(await prisma.pointsLedger.count()).toBe(0)
  })

  it('refuses a capture with no Payment intent row (intent missing); order stays pending', async () => {
    const { order } = await placeTestOrder()

    // Remove the intent entirely — a capture must never fabricate one.
    await prisma.payment.deleteMany({ where: { orderId: order.id } })

    await expect(markOrderPaid(captureArgs(order.orderNo))).rejects.toBeInstanceOf(
      PaymentIntentMissingError,
    )

    const after = await prisma.order.findUniqueOrThrow({ where: { id: order.id } })
    expect(after.status).toBe('pending')
    expect(await prisma.pointsLedger.count()).toBe(0)
  })
})
