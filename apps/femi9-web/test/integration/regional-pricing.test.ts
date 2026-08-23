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

import { placeOrder, type CheckoutCustomer } from '@femi9/core/services/checkout'
import { getCart } from '@femi9/core/services/cart'
import { resolveZone } from '@femi9/core/services/pricing'
import { updateZone, CannotUnsetDefaultError } from '@femi9/core/services/admin/pricing'

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

    const result = await placeOrder('femi9', token, customer('Tamil Nadu'))
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
    const zone = await resolveZone('femi9', { state: 'Tamil Nadu' })
    expect(zone?.id).toBe(tn.id)
    const cart = await getCart('femi9', token, zone)

    // ...and what placing that same order actually costs.
    const result = await placeOrder('femi9', token, customer('Tamil Nadu'))
    const order = await prisma.order.findUnique({ where: { orderNo: result.orderNo } })

    expect(cart.subtotal).toBe(order!.subtotal)
    // The standard price is still carried, so the summary can show what was saved.
    expect(cart.baseSubtotal).toBe(398)
    expect(cart.zone).toEqual({ name: 'Tamil Nadu', discountPct: 10, custom: false })
    expect(cart.items[0]).toMatchObject({ unitPrice: 179, baseUnitPrice: 199 })
  })

  it('leaves an unmapped state at the standard price, in cart and order alike', async () => {
    await seedZones()
    const { variant } = await makeProduct({ price: 199, stock: 50 })
    const token = await cartWith('guest-ka', variant.id, 2)

    const zone = await resolveZone('femi9', { state: 'Karnataka' }) // → Default, 0%
    const cart = await getCart('femi9', token, zone)
    expect(cart.subtotal).toBe(398)
    expect(cart.baseSubtotal).toBe(398)
    // Nothing to announce when the price did not move.
    expect(cart.zone).toBeNull()

    const result = await placeOrder('femi9', token, customer('Karnataka'))
    const order = await prisma.order.findUnique({ where: { orderNo: result.orderNo } })
    expect(order!.subtotal).toBe(398)
  })

  it('prices at the standard rate when no zones are configured at all', async () => {
    // No seedZones() — this is the state staging was in: resolveZone finds
    // neither a region match nor a default, and returns null.
    const { variant } = await makeProduct({ price: 225, stock: 10 })
    const token = await cartWith('guest-nozones', variant.id, 1)

    expect(await resolveZone('femi9', { state: 'Tamil Nadu' })).toBeNull()
    const cart = await getCart('femi9', token, null)
    expect(cart.subtotal).toBe(225)

    const result = await placeOrder('femi9', token, customer('Tamil Nadu'))
    const order = await prisma.order.findUnique({ where: { orderNo: result.orderNo } })
    expect(order!.subtotal).toBe(225)
  })
})

/**
 * The custom price setter: an exact price typed for one variant in one zone.
 *
 * The percentage and the typed price are two different mechanisms and the typed
 * one wins, so these tests pin the properties the discount tests cannot: that a
 * custom price reaches the CHARGE (not just the display), that it is used even
 * when the zone's percentage is 0, and that a zone with no custom price for an
 * item still discounts it as before.
 */
describe('per-zone custom prices', () => {
  beforeEach(async () => {
    await resetDb()
    await seedSettings()
  })

  it('charges the typed price instead of the zone percentage, and shows the same number', async () => {
    const { tn } = await seedZones() // Tamil Nadu, −10%
    const { variant } = await makeProduct({ price: 199, stock: 50 })
    // 10% off 199 would be 179; the admin has typed 149 for this variant.
    await prisma.zoneVariantPrice.create({
      data: { zoneId: tn.id, variantId: variant.id, price: 149 },
    })
    const token = await cartWith('guest-custom-tn', variant.id, 2)

    const zone = await resolveZone('femi9', { state: 'Tamil Nadu' })
    const cart = await getCart('femi9', token, zone)
    expect(cart.items[0]).toMatchObject({ unitPrice: 149, baseUnitPrice: 199 })
    expect(cart.subtotal).toBe(298)
    // The percentage is no longer what priced this cart, and the summary is told
    // so — printing "−10%" next to a ₹100 saving would be a lie.
    expect(cart.zone).toEqual({ name: 'Tamil Nadu', discountPct: 10, custom: true })

    const result = await placeOrder('femi9', token, customer('Tamil Nadu'))
    const order = await prisma.order.findUnique({
      where: { orderNo: result.orderNo },
      include: { items: true },
    })
    expect(order!.items[0]!.unitPrice).toBe(149)
    expect(order!.subtotal).toBe(298)
  })

  it('prices by hand in a zone whose percentage is 0', async () => {
    const { def } = await seedZones() // Default, 0% — the location-unknown fallback
    const { variant } = await makeProduct({ price: 225, stock: 10 })
    await prisma.zoneVariantPrice.create({
      data: { zoneId: def.id, variantId: variant.id, price: 199 },
    })
    const token = await cartWith('guest-custom-default', variant.id, 1)

    const zone = await resolveZone('femi9', { state: 'Karnataka' }) // → Default
    const cart = await getCart('femi9', token, zone)
    expect(cart.subtotal).toBe(199)
    expect(cart.baseSubtotal).toBe(225)
    // A 0% zone still moved the price, so the cart must not stay silent about it.
    expect(cart.zone).toEqual({ name: 'Default', discountPct: 0, custom: true })

    const result = await placeOrder('femi9', token, customer('Karnataka'))
    const order = await prisma.order.findUnique({ where: { orderNo: result.orderNo } })
    expect(order!.subtotal).toBe(199)
  })

  it('leaves a variant with no custom price on the zone percentage', async () => {
    const { tn } = await seedZones()
    const priced = await makeProduct({ slug: 'priced-by-hand', price: 199, stock: 10 })
    const other = await makeProduct({ slug: 'follows-discount', price: 199, stock: 10 })
    await prisma.zoneVariantPrice.create({
      data: { zoneId: tn.id, variantId: priced.variant.id, price: 149 },
    })

    const token = await cartWith('guest-mixed', priced.variant.id, 1)
    await cartWith(token, other.variant.id, 1)

    const cart = await getCart('femi9', token, await resolveZone('femi9', { state: 'Tamil Nadu' }))
    const byVariant = Object.fromEntries(cart.items.map((i) => [i.variantId, i.unitPrice]))
    expect(byVariant[priced.variant.id]).toBe(149) // typed
    expect(byVariant[other.variant.id]).toBe(179) // 199 − 10%
  })

  it('a custom price ABOVE the standard price is charged as typed, with nothing struck through', async () => {
    // A typed price is not a discount: it can be higher. The cart must still be
    // internally consistent rather than reporting a negative saving.
    const { tn } = await seedZones()
    const { variant } = await makeProduct({ price: 199, stock: 10 })
    await prisma.zoneVariantPrice.create({
      data: { zoneId: tn.id, variantId: variant.id, price: 249 },
    })
    const token = await cartWith('guest-above', variant.id, 1)

    const cart = await getCart('femi9', token, await resolveZone('femi9', { state: 'Tamil Nadu' }))
    expect(cart.subtotal).toBe(249)
    expect(cart.baseSubtotal).toBe(199)
    // The checkout summary only strikes through when baseSubtotal > subtotal.
    expect(cart.baseSubtotal - cart.subtotal).toBeLessThan(0)

    const result = await placeOrder('femi9', token, customer('Tamil Nadu'))
    const order = await prisma.order.findUnique({ where: { orderNo: result.orderNo } })
    expect(order!.subtotal).toBe(249)
  })

  it('deleting a zone takes its custom prices with it', async () => {
    const { tn } = await seedZones()
    const { variant } = await makeProduct({ price: 199, stock: 10 })
    await prisma.zoneVariantPrice.create({
      data: { zoneId: tn.id, variantId: variant.id, price: 149 },
    })

    await prisma.priceZone.delete({ where: { id: tn.id } })
    expect(await prisma.zoneVariantPrice.count({ where: { zoneId: tn.id } })).toBe(0)
  })
})

describe('the default zone cannot be left orphaned', () => {
  beforeEach(async () => {
    await resetDb()
  })

  it('refuses to clear isDefault on the only default zone', async () => {
    const { def } = await seedZones()

    await expect(updateZone('femi9', def.id, { isDefault: false })).rejects.toBeInstanceOf(
      CannotUnsetDefaultError,
    )
    const after = await prisma.priceZone.findUnique({ where: { id: def.id } })
    expect(after!.isDefault).toBe(true)
  })

  it('allows moving the default by promoting another zone', async () => {
    const { def, tn } = await seedZones()

    await updateZone('femi9', tn.id, { isDefault: true })

    expect((await prisma.priceZone.findUnique({ where: { id: tn.id } }))!.isDefault).toBe(true)
    expect((await prisma.priceZone.findUnique({ where: { id: def.id } }))!.isDefault).toBe(false)
    // Still exactly one default — never zero, never two.
    expect(await prisma.priceZone.count({ where: { isDefault: true } })).toBe(1)
  })
})
