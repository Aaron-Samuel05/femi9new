import { describe, it, expect } from "vitest";
import { shippingFor, shippingForWeight } from "@femi9/core/services/checkout";

/**
 * Diaper parcels are priced by what they weigh, not a flat per-order fee —
 * the courier's own rate card is a weight slab, and a Lumi9 basket now carries
 * enough weight data (`ProductVariant.weightKg`, seeded from
 * `SIZES[].packs[].shipWeight` in `src/lib/catalog.ts`) to be charged against
 * it. Femi9's pads carry no such weight, so `shippingFor` falls back to the
 * flat `SHIPPING_FEE` exactly as it always has — see the last describe block.
 */

describe("courier weight slabs", () => {
  it("charges the lightest slab for anything up to 500g", () => {
    expect(shippingForWeight(0.04)).toBe(30); // an NB 3-pack, on its own
    expect(shippingForWeight(0.5)).toBe(30);
  });

  it("steps up at each slab boundary", () => {
    expect(shippingForWeight(0.51)).toBe(50);
    expect(shippingForWeight(1)).toBe(50);
    expect(shippingForWeight(1.01)).toBe(70);
    expect(shippingForWeight(2)).toBe(70);
    expect(shippingForWeight(2.01)).toBe(100);
    expect(shippingForWeight(3)).toBe(100);
  });

  it("caps at the top slab rather than inventing a rate past it", () => {
    // Two XL 54-packs alone are 3.7kg; nothing in the rate card says what a
    // heavier parcel costs, so it is billed at the heaviest slab we do know.
    expect(shippingForWeight(3.7)).toBe(100);
    expect(shippingForWeight(10)).toBe(100);
  });
});

describe("shippingFor — the free-shipping threshold still wins", () => {
  it("is free once the subtotal clears the threshold, regardless of weight", () => {
    expect(shippingFor(1200, 999, 3.7)).toBe(0);
  });

  it("prices a weighed basket off the slab table below the threshold", () => {
    expect(shippingFor(500, 999, 0.7)).toBe(50);
  });

  it("falls back to the flat fee for a basket with no weight data", () => {
    // Femi9's pads carry no `weightKg`, and neither does a Lumi9 row seeded
    // before the column existed — `null` means "cannot be weighed", not "free".
    expect(shippingFor(500, 999, null)).toBe(49);
  });
});
