import { describe, it, expect, beforeEach, vi } from 'vitest'
import { resetDb, seedSettings, makeProduct, cartWith, prisma } from '../helpers/db'

/**
 * Regional pricing on the MONEY PATH.
 *
 * `test/integration/pricing.test.ts` covers the resolver in isolation — which
 * zone a location maps to, and what `applyZonePrice` computes. It could pass in
 * full while the feature did nothing, and for a while it did: `applyZonePrice`
 * was called in exactly one place (`placeOrder`), so the catalogue, the cart and
 * the checkout summary all quoted the standard price and only the charge was
 * discounted. Nothing failed when display and charge disagreed.
 *
 * These tests pin the two properties that actually matter to a shopper:
 *   1. the order is CHARGED at the zone price, and
 *   2. the cart SHOWS the same number the order charges.
 *
 * `next/headers` is stubbed the way checkout.test.ts stubs it: `cookies()`
 * returns an empty jar and `headers` is absent, so the ambient (edge-geo)
 * resolver degrades to "location unknown" and each test states its own signal.
 */
vi.mock('next/headers', () => ({
  cookies: () => ({ get: () => undefined }),
}))

import { placeOrder, type CheckoutCustomer } from '@/lib/services/checkout'
import { getCart } from '@/lib/services/cart'
import { resolveZone } from '@/lib/services/pricing'
import { updateZone, CannotUnsetDefaultError } from '@/lib/services/admin/pricing'

/** Default (0% off) + a Tamil Nadu zone at 10% off, as the admin would set up. */
async function seedZones() {
  const def = await prisma.priceZone.create({
    data: { name: 'Default', discountPct: 0, isDefault: true, active: true, position: 0 },
  })
  const tn = await prisma.priceZone.create({
    data: {
      name: 'Tamil Nadu',
      discountPct: 10,
      isDefault: false,
      active: true,
      position: 1,
      regions: { create: { kind: 'state', value: 'Tamil Nadu' } },
    },
  })
  return { def, tn }
}

function customer(state: string): CheckoutCustomer {
  return {
    name: 'Test Buyer',
    phone: '9000000042',
    email: 'buyer-42@example.com',
    line: '12 MG Road',
    city: 'Chennai',
    state,
    pincode: '600001',
  }
}

describe('regional pricing reaches the money path', () => {
  beforeEach(async () => {
    await resetDb()
    await seedSettings() // freeShipThreshold = 999
  })

  it('charges the zone price on a placed order', async () => {
    await seedZones()
    const { variant } = await makeProduct({ price: 199, stock: 50 })
    const token = await cartWith('guest-zone-tn', variant.id, 2)

    const result = await placeOrder(token, customer('Tamil Nadu'))
    const order = await prisma.order.findUnique({
      where: { orderNo: result.orderNo },
      include: { items: true },
    })

    // 199 − 10% = 179.1 → 179 a unit, not the 199 on the catalogue row.
    expect(order!.items[0]!.unitPrice).toBe(179)
    expect(order!.subtotal).toBe(358) // 179 × 2
    expect(order!.shipping).toBe(49) // still under the 999 free-ship threshold
    expect(order!.total).toBe(407)
  })

  it('shows the shopper the same number it charges her', async () => {
    const { tn } = await seedZones()
    const { variant } = await makeProduct({ price: 199, stock: 50 })
    const token = await cartWith('guest-agree', variant.id, 2)

    // What checkout renders for a Tamil Nadu delivery address...
    const zone = await resolveZone({ state: 'Tamil Nadu' })
    expect(zone?.id).toBe(tn.id)
    const cart = await getCart(token, zone)

    // ...and what placing that same order actually costs.
    const result = await placeOrder(token, customer('Tamil Nadu'))
    const order = await prisma.order.findUnique({ where: { orderNo: result.orderNo } })

    expect(cart.subtotal).toBe(order!.subtotal)
    // The standard price is still carried, so the summary can show what was saved.
    expect(cart.baseSubtotal).toBe(398)
    expect(cart.zone).toEqual({ name: 'Tamil Nadu', discountPct: 10 })
    expect(cart.items[0]).toMatchObject({ unitPrice: 179, baseUnitPrice: 199 })
  })

  it('leaves an unmapped state at the standard price, in cart and order alike', async () => {
    await seedZones()
    const { variant } = await makeProduct({ price: 199, stock: 50 })
    const token = await cartWith('guest-ka', variant.id, 2)

    const zone = await resolveZone({ state: 'Karnataka' }) // → Default, 0%
    const cart = await getCart(token, zone)
    expect(cart.subtotal).toBe(398)
    expect(cart.baseSubtotal).toBe(398)
    // Nothing to announce when the price did not move.
    expect(cart.zone).toBeNull()

    const result = await placeOrder(token, customer('Karnataka'))
    const order = await prisma.order.findUnique({ where: { orderNo: result.orderNo } })
    expect(order!.subtotal).toBe(398)
  })

  it('prices at the standard rate when no zones are configured at all', async () => {
    // No seedZones() — this is the state staging was in: resolveZone finds
    // neither a region match nor a default, and returns null.
    const { variant } = await makeProduct({ price: 225, stock: 10 })
    const token = await cartWith('guest-nozones', variant.id, 1)

    expect(await resolveZone({ state: 'Tamil Nadu' })).toBeNull()
    const cart = await getCart(token, null)
    expect(cart.subtotal).toBe(225)

    const result = await placeOrder(token, customer('Tamil Nadu'))
    const order = await prisma.order.findUnique({ where: { orderNo: result.orderNo } })
    expect(order!.subtotal).toBe(225)
  })
})

describe('the default zone cannot be left orphaned', () => {
  beforeEach(async () => {
    await resetDb()
  })

  it('refuses to clear isDefault on the only default zone', async () => {
    const { def } = await seedZones()

    await expect(updateZone(def.id, { isDefault: false })).rejects.toBeInstanceOf(
      CannotUnsetDefaultError,
    )
    const after = await prisma.priceZone.findUnique({ where: { id: def.id } })
    expect(after!.isDefault).toBe(true)
  })

  it('allows moving the default by promoting another zone', async () => {
    const { def, tn } = await seedZones()

    await updateZone(tn.id, { isDefault: true })

    expect((await prisma.priceZone.findUnique({ where: { id: tn.id } }))!.isDefault).toBe(true)
    expect((await prisma.priceZone.findUnique({ where: { id: def.id } }))!.isDefault).toBe(false)
    // Still exactly one default — never zero, never two.
    expect(await prisma.priceZone.count({ where: { isDefault: true } })).toBe(1)
  })
})
