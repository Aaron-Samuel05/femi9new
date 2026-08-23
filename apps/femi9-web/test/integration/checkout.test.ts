import { describe, it, expect, beforeEach, vi } from 'vitest'
import { resetDb, seedSettings, makeProduct, cartWith, prisma } from '../helpers/db'
import * as razorpay from '@femi9/core/razorpay'

/**
 * placeOrder reads a referral cookie via next/headers `cookies()`, which throws
 * outside a request scope. Stub it to an empty cookie jar (no ref) so the money
 * path — subtotal/shipping/total, the atomic stock reservation and the deferred
 * points award — is what's under test, not request plumbing. Razorpay stays in
 * mock mode (no keys in the test env), so createOrder makes no network call.
 */
vi.mock('next/headers', () => ({
  cookies: () => ({ get: () => undefined }),
}))

import { placeOrder, OutOfStockError, type CheckoutCustomer } from '@femi9/core/services/checkout'

function customer(phone: string): CheckoutCustomer {
  return {
    name: 'Test Buyer',
    phone,
    email: `buyer-${phone}@example.com`,
    line: '12 MG Road',
    city: 'Chennai',
    state: 'TN',
    pincode: '600001',
  }
}

describe('checkout.placeOrder (integration)', () => {
  beforeEach(async () => {
    await resetDb()
    await seedSettings() // freeShipThreshold=999, pointsPerRupee=1, firstOrderBonus=100
  })

  it('creates a pending order with recomputed money + item snapshots and atomically decrements stock', async () => {
    // price 199, buy 2 → subtotal 398 (< 999 free-ship threshold) → +49 shipping.
    const { product, variant } = await makeProduct({ price: 199, stock: 50 })
    const token = await cartWith('guest-A', variant.id, 2)

    const result = await placeOrder('femi9', token, customer('9000000001'))
    expect(result.orderNo).toMatch(/^FM-\d{5}$/)

    const order = await prisma.order.findUnique({
      where: { orderNo: result.orderNo },
      include: { items: true },
    })
    expect(order).not.toBeNull()
    expect(order!.status).toBe('pending')
    // Money is recomputed server-side from the variant price, never trusted from a client.
    expect(order!.subtotal).toBe(398) // 199 * 2
    expect(order!.shipping).toBe(49) // below the 999 free-ship threshold
    expect(order!.total).toBe(447) // 398 + 49

    // Exactly one line, snapshotting name/label/price/qty at purchase time.
    expect(order!.items).toHaveLength(1)
    const line = order!.items[0]!
    expect(line.variantId).toBe(variant.id)
    expect(line.productName).toBe(product.name)
    expect(line.variantLabel).toBe('6 pcs')
    expect(line.unitPrice).toBe(199)
    expect(line.qty).toBe(2)
    expect(line.lineTotal).toBe(398)

    // Stock decremented by exactly the ordered qty.
    const after = await prisma.productVariant.findUniqueOrThrow({ where: { id: variant.id } })
    expect(after.stock).toBe(48) // 50 - 2

    // The guest cart is consumed so the token starts fresh.
    const cart = await prisma.cart.findUnique({ where: { guestToken: token } })
    expect(cart).toBeNull()
  })

  it('waives shipping when subtotal reaches the free-ship threshold', async () => {
    // price 500, buy 2 → subtotal 1000 (>= 999) → shipping 0.
    const { variant } = await makeProduct({ price: 500, stock: 10 })
    const token = await cartWith('guest-free', variant.id, 2)

    const { orderNo } = await placeOrder('femi9', token, customer('9000000009'))
    const order = await prisma.order.findUniqueOrThrow({ where: { orderNo } })
    expect(order.subtotal).toBe(1000)
    expect(order.shipping).toBe(0)
    expect(order.total).toBe(1000)
  })

  it('never oversells: two concurrent orders for the last unit → exactly one succeeds, stock ends at 0', async () => {
    // Only ONE unit in stock; two independent guest carts each want it.
    const { variant } = await makeProduct({ price: 199, stock: 1 })
    const tokenA = await cartWith('guest-oversell-A', variant.id, 1)
    const tokenB = await cartWith('guest-oversell-B', variant.id, 1)

    const results = await Promise.allSettled([
      placeOrder('femi9', tokenA, customer('9000000011')),
      placeOrder('femi9', tokenB, customer('9000000012')),
    ])

    const fulfilled = results.filter((r) => r.status === 'fulfilled')
    const rejected = results.filter((r) => r.status === 'rejected')
    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(1)
    // The loser fails with the domain error the route maps to a 409 — not a raw 500.
    const reason = (rejected[0] as PromiseRejectedResult).reason
    expect(reason).toBeInstanceOf(OutOfStockError)

    // The conditional atomic decrement is the sole guard: stock lands at 0, never negative.
    const after = await prisma.productVariant.findUniqueOrThrow({ where: { id: variant.id } })
    expect(after.stock).toBe(0)

    // The rolled-back attempt left no order behind — exactly one order persisted.
    expect(await prisma.order.count()).toBe(1)
    // ...and the winner's line reserved exactly one unit.
    expect(await prisma.orderItem.count()).toBe(1)
  })

  it('does NOT award loyalty points at placeOrder (order is only pending, points come on capture)', async () => {
    const { variant } = await makeProduct({ price: 199, stock: 5 })
    const token = await cartWith('guest-points', variant.id, 1)

    const { orderNo } = await placeOrder('femi9', token, customer('9000000021'))
    const order = await prisma.order.findUniqueOrThrow({ where: { orderNo } })
    expect(order.status).toBe('pending')

    // No PointsLedger rows and a zero balance for the (pending) buyer.
    const user = await prisma.user.findUniqueOrThrow({ where: { phone: '9000000021' } })
    const ledgerCount = await prisma.pointsLedger.count({ where: { userId: user.id } })
    expect(ledgerCount).toBe(0)
    const agg = await prisma.pointsLedger.aggregate({
      where: { userId: user.id },
      _sum: { delta: true },
    })
    expect(agg._sum.delta ?? 0).toBe(0)
  })

  it('assigns distinct sequential order numbers to back-to-back orders', async () => {
    const { variant } = await makeProduct({ price: 199, stock: 10 })

    const t1 = await cartWith('guest-seq-1', variant.id, 1)
    const first = await placeOrder('femi9', t1, customer('9000000031'))

    const t2 = await cartWith('guest-seq-2', variant.id, 1)
    const second = await placeOrder('femi9', t2, customer('9000000031')) // same repeat buyer

    expect(first.orderNo).not.toBe(second.orderNo)
    // Sequential allocation continues past the current max.
    expect(first.orderNo).toBe('FM-00001')
    expect(second.orderNo).toBe('FM-00002')
  })

  it('restores stock and preserves the cart when gateway order creation fails', async () => {
    const { variant } = await makeProduct({ price: 199, stock: 5 })
    const token = await cartWith('guest-gateway-down', variant.id, 2)
    const gateway = vi
      .spyOn(razorpay, 'createOrder')
      .mockRejectedValueOnce(new Error('simulated gateway outage'))

    await expect(placeOrder('femi9', token, customer('9000000041'))).rejects.toThrow(
      'simulated gateway outage',
    )

    // The committed reservation/order is compensated.
    expect(await prisma.order.count()).toBe(0)
    expect(await prisma.payment.count()).toBe(0)
    const after = await prisma.productVariant.findUniqueOrThrow({ where: { id: variant.id } })
    expect(after.stock).toBe(5)

    // The shopper's bag survives so retrying does not require rebuilding it.
    const cart = await prisma.cart.findUnique({
      where: { guestToken: token },
      include: { items: true },
    })
    expect(cart?.items).toHaveLength(1)
    expect(cart?.items[0]?.qty).toBe(2)

    gateway.mockRestore()
  })
})
