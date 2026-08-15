import { describe, it, expect } from 'vitest'
import {
  NO_OVERRIDES,
  applyZonePrice,
  zoneCustomPrice,
  type ResolvedZone,
} from '@/lib/services/pricing'

/**
 * The rule that decides every price a shopper sees: a zone's CUSTOM price for an
 * item beats its percentage discount, and a product's custom price never leaks
 * onto that product's variants.
 *
 * This lives in a unit test on purpose. `applyZonePrice` is called from the
 * catalogue, the cart, checkout and subscription renewals; the integration
 * suites prove it reaches each of those, but the resolution rule itself is pure
 * and deserves to fail here — in milliseconds, with no database — when someone
 * reorders the two branches.
 */

/** A zone at `discountPct` off, with whatever overrides the case needs. */
function zone(discountPct: number, overrides = NO_OVERRIDES): ResolvedZone {
  return { id: 'z1', name: 'Tamil Nadu', discountPct, isDefault: false, overrides }
}

describe('applyZonePrice', () => {
  it('takes the percentage off when the item has no custom price', () => {
    // 199 − 10% = 179.1 → 179.
    expect(applyZonePrice(199, zone(10), { variantId: 'v1' })).toBe(179)
    expect(applyZonePrice(225, zone(10), { variantId: 'v1' })).toBe(203)
  })

  it('charges the custom price instead of the percentage', () => {
    const z = zone(10, { products: {}, variants: { v1: 149 } })
    expect(applyZonePrice(199, z, { variantId: 'v1' })).toBe(149)
    // A different variant in the same zone still follows the discount.
    expect(applyZonePrice(199, z, { variantId: 'v2' })).toBe(179)
  })

  it('honours a custom price in a zone whose percentage is 0', () => {
    // The whole point of the custom price setter: a zone can price by hand
    // without being a "discount zone" at all.
    const z = zone(0, { products: {}, variants: { v1: 149 } })
    expect(applyZonePrice(199, z, { variantId: 'v1' })).toBe(149)
  })

  it('allows a custom price ABOVE the standard price', () => {
    // A typed price is not a discount. Nothing clamps it to the base — the
    // display layer is what must not call the difference a "saving".
    const z = zone(10, { products: {}, variants: { v1: 249 } })
    expect(applyZonePrice(199, z, { variantId: 'v1' })).toBe(249)
  })

  it('never applies a PRODUCT custom price to that product’s variants', () => {
    // ₹180 "for this product" cannot also be the price of its 18-pack, so a
    // product override prices only the card; the variants keep the discount.
    const z = zone(10, { products: { p1: 180 }, variants: {} })
    expect(applyZonePrice(199, z, { productId: 'p1' })).toBe(180)
    expect(applyZonePrice(349, z, { variantId: 'v-18pack' })).toBe(314)
  })

  it('falls back to the percentage when the caller names no target', () => {
    const z = zone(10, { products: { p1: 180 }, variants: { v1: 149 } })
    expect(applyZonePrice(199, z)).toBe(179)
  })

  it('leaves the price untouched with no zone at all', () => {
    // resolveZone returns null when the store has no zones configured.
    expect(applyZonePrice(225, null, { variantId: 'v1' })).toBe(225)
  })
})

describe('zoneCustomPrice', () => {
  it('reports whether an item is priced by hand, so the UI can stop naming a percentage', () => {
    const z = zone(10, { products: {}, variants: { v1: 149 } })
    expect(zoneCustomPrice(z, { variantId: 'v1' })).toBe(149)
    expect(zoneCustomPrice(z, { variantId: 'v2' })).toBeNull()
    expect(zoneCustomPrice(null, { variantId: 'v1' })).toBeNull()
    expect(zoneCustomPrice(z)).toBeNull()
  })
})
