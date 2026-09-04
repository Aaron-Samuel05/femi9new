import { describe, it, expect, beforeEach, vi } from 'vitest'
import { prisma, resetDb, seedSettings, makeProduct, cartWith } from '../helpers/db'
import {
  placeOrder,
  markOrderPaid,
  ZeroTotalOrderError,
  PaymentAmountMismatchError,
  type CheckoutCustomer,
} from '@femi9/core/services/checkout'

/**
 * The two guards standing between a discount and a broken checkout.
 *
 * Both cover failures that used to happen LATE and opaquely — one at the
 * gateway, after the order row and the stock reservation were already
 * committed, and one not at all.
 */

vi.mock('next/headers', () => ({
  cookies: () => ({ get: () => undefined }),
}))

const CUSTOMER: CheckoutCustomer = {
  name: 'Guard Buyer',
  phone: '9992224444',
  line: '3 Test Rd',
  city: 'Chennai',
}

async function basket(opts: { price: number; qty: number; stock?: number; couponCode?: string }) {
  const stock = opts.stock ?? 50
  const { variant } = await makeProduct({ price: opts.price, stock })
  const token = `tok-${Math.random().toString(36).slice(2, 10)}`
  await cartWith(token, variant.id, opts.qty)
  return { token, variant, stock, customer: { ...CUSTOMER, couponCode: opts.couponCode } }
}

async function coupon(code: string, type: 'pct' | 'flat', value: number) {
  return prisma.coupon.create({
    data: { code, type, value, minOrder: 0, maxUses: null, usedCount: 0, active: true },
  })
}

async function stockOf(variantId: string): Promise<number> {
  const v = await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } })
  return v.stock
}

/**
 * A basket discounted to nothing.
 *
 * `freeShipThreshold` is 999 in the test settings, and `shippingFor` reads the
 * PRE-discount subtotal — so a fully-discounted basket over that threshold has
 * nothing left to charge. Razorpay's minimum is ₹1, so the Orders API refused
 * the order and the shopper saw an opaque gateway failure at the last step of
 * checkout, with nothing pointing at her discount code as the cause.
 */
describe('a basket discounted to zero', () => {
  beforeEach(async () => {
    await resetDb()
    await seedSettings()
  })

  it('is refused, rather than failing at the gateway', async () => {
    await coupon('ALLFREE', 'pct', 100)
    const { token, customer } = await basket({ price: 500, qty: 3, couponCode: 'ALLFREE' })

    await expect(placeOrder('femi9', token, customer)).rejects.toBeInstanceOf(ZeroTotalOrderError)
  })

  it('commits nothing at all — no order, no stock, no coupon use', async () => {
    // The guard sits at the last line before anything is written, so the throw
    // rolls the whole transaction back. If it ever moves below the order row,
    // this is the test that notices.
    const code = await coupon('ALLFREE2', 'pct', 100)
    const { token, variant, stock, customer } = await basket({
      price: 500,
      qty: 3,
      couponCode: 'ALLFREE2',
    })

    await expect(placeOrder('femi9', token, customer)).rejects.toBeInstanceOf(ZeroTotalOrderError)

    expect(await prisma.order.count()).toBe(0)
    expect(await stockOf(variant.id)).toBe(stock)
    const after = await prisma.coupon.findUniqueOrThrow({ where: { id: code.id } })
    expect(after.usedCount).toBe(0)
  })

  it('catches a FLAT coupon worth the whole basket too, not just a 100% one', async () => {
    // couponDiscountFor caps a flat coupon at the subtotal, so an over-large
    // flat value reaches zero by the same route a percent one does.
    await coupon('BIGFLAT', 'flat', 99999)
    const { token, customer } = await basket({ price: 500, qty: 3, couponCode: 'BIGFLAT' })

    await expect(placeOrder('femi9', token, customer)).rejects.toBeInstanceOf(ZeroTotalOrderError)
  })

  it('still places a fully-discounted basket that has shipping left to pay', async () => {
    // Below the free-shipping threshold the courier fee survives the discount,
    // so there is a real amount to charge and the order is legitimate. The
    // guard must not refuse this one.
    await coupon('ALLFREE3', 'pct', 100)
    const { token, customer } = await basket({ price: 100, qty: 1, couponCode: 'ALLFREE3' })

    const result = await placeOrder('femi9', token, customer)
    const order = await prisma.order.findUniqueOrThrow({ where: { orderNo: result.orderNo } })
    expect(order.total).toBeGreaterThan(0)
    expect(order.discount).toBe(100)
  })
})

/**
 * What the GATEWAY says it captured.
 *
 * Everything else `markOrderPaid` checks is our own data: the payment row was
 * written by our own checkout and compared against our own order total, which
 * catches a stale intent but not a short capture. Razorpay's own rule that a
 * payment settles its order in full is an ACCOUNT SETTING, not something this
 * code enforced.
 */
describe('the captured amount is checked against the gateway', () => {
  beforeEach(async () => {
    await resetDb()
    await seedSettings()
  })

  async function pendingOrder() {
    const { token, customer } = await basket({ price: 500, qty: 2 })
    const result = await placeOrder('femi9', token, customer)
    const order = await prisma.order.findUniqueOrThrow({ where: { orderNo: result.orderNo } })
    return order
  }

  function captureArgs(orderNo: string, capturedAmountPaise?: number) {
    return {
      orderNo,
      razorpayPaymentId: `pay_${orderNo}`,
      razorpayOrderId: `mock_${orderNo}`,
      signatureVerified: true,
      ...(capturedAmountPaise != null ? { capturedAmountPaise } : {}),
    }
  }

  it('accepts a capture for exactly the order total', async () => {
    const order = await pendingOrder()
    const res = await markOrderPaid('femi9', captureArgs(order.orderNo, order.total * 100))
    expect(res.status).toBe('paid')
  })

  it('refuses a SHORT capture and leaves the order pending', async () => {
    const order = await pendingOrder()
    await expect(
      markOrderPaid('femi9', captureArgs(order.orderNo, (order.total - 1) * 100)),
    ).rejects.toBeInstanceOf(PaymentAmountMismatchError)

    const after = await prisma.order.findUniqueOrThrow({ where: { id: order.id } })
    expect(after.status).toBe('pending')
  })

  it('refuses an OVER capture just as firmly', async () => {
    // Not a windfall — it means our total and the gateway's disagree, and
    // marking it paid would record a sale for a number nobody can reconcile.
    const order = await pendingOrder()
    await expect(
      markOrderPaid('femi9', captureArgs(order.orderNo, (order.total + 50) * 100)),
    ).rejects.toBeInstanceOf(PaymentAmountMismatchError)
  })

  it('skips the check when the caller has no amount', async () => {
    // The synchronous verify path genuinely does not get one: Razorpay Checkout
    // hands the browser an order id, a payment id and a signature, no amount.
    // It must keep working — the webhook carries the check.
    const order = await pendingOrder()
    const res = await markOrderPaid('femi9', captureArgs(order.orderNo))
    expect(res.status).toBe('paid')
  })
})
