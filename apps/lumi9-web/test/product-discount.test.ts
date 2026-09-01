import { describe, it, expect } from "vitest";
import { packDiscountPct } from "@/lib/catalog";
import { chargedPrice } from "@femi9/core/services/admin/products";

/**
 * A discount an admin gives has to be the discount the gateway applies.
 *
 * This is the same defect the launch audit called CRITICAL, approached from the
 * other side. The home page led every pack card with a price about 10% below
 * the real one, struck the real price through beside it, and stamped "10% off"
 * on the difference — all three from `LAUNCH_OFFER`, a constant in content.ts
 * that no server code had ever read. The card said ₹404, Razorpay took ₹449, on
 * all five products. Nothing failed: both numbers on the card came from one
 * constant, so they agreed with each other perfectly and neither agreed with
 * the charge.
 *
 * The fix is structural rather than careful. There is now ONE number an admin
 * states (`mrp`), ONE percentage (`discountPct`), and the charged price is
 * COMPUTED from them by `chargedPrice` on the server, in the transaction that
 * saves them. The badge the shopper sees is computed back out of the charged
 * price and the MRP by `packDiscountPct`. So the badge cannot drift from the
 * charge — they are two views of one subtraction.
 *
 * These tests own that round trip. If someone reintroduces a discount that is
 * stated separately from the price, the last case here fails.
 */

describe("what the admin types becomes what the cart charges", () => {
  it("takes the percentage off the MRP", () => {
    expect(chargedPrice(449, 50)).toBe(225); // 224.5, rounded
    expect(chargedPrice(1000, 25)).toBe(750);
    expect(chargedPrice(949, 0)).toBe(949);
  });

  it("clamps a percentage nobody meant to type", () => {
    // 90 is the ceiling. A 100% line is a free order — not something anybody
    // decides by typing into a price field — and it is below the gateway's
    // minimum charge anyway.
    expect(chargedPrice(1000, 100)).toBe(chargedPrice(1000, 90));
    expect(chargedPrice(1000, -20)).toBe(1000);
  });

  it("never returns a fractional rupee", () => {
    // Every price in this schema is an integer. A half-rupee line total is a
    // number the gateway will not agree with.
    for (const mrp of [449, 949, 99, 1049, 333]) {
      for (const pct of [0, 5, 33, 50, 67, 90]) {
        expect(Number.isInteger(chargedPrice(mrp, pct))).toBe(true);
      }
    }
  });
});

describe("what the shopper sees", () => {
  it("shows no offer when the product is sold at MRP", () => {
    expect(packDiscountPct({ price: 449, mrp: 449 })).toBe(0);
  });

  it("shows no offer on a row written before the column existed", () => {
    // `mrp` is nullable in the schema and the payload fills it from `price`,
    // but a caller that passes nothing must get "no offer" rather than NaN%.
    expect(packDiscountPct({ price: 449 })).toBe(0);
    expect(packDiscountPct({ price: 449, mrp: 0 })).toBe(0);
  });

  it("refuses to advertise a NEGATIVE discount", () => {
    // An MRP below the charged price is a data error — a zone override, a
    // half-finished edit. "0% off" is the safe way to be wrong; "-11% off" on a
    // product card is not.
    expect(packDiscountPct({ price: 500, mrp: 449 })).toBe(0);
  });

  it("AGREES WITH THE CHARGE — the badge is the same subtraction", () => {
    // The one that matters. For every price an admin could plausibly set, the
    // percentage shown on the card is the percentage actually coming off the
    // number Razorpay will take. Rounding to whole rupees makes an exact match
    // impossible on some pairs, so the tolerance is one percentage point — the
    // ₹404-vs-₹449 defect was eleven.
    for (const mrp of [99, 349, 449, 749, 949, 1049, 1149]) {
      for (const pct of [5, 10, 15, 20, 25, 33, 40, 50, 60, 75, 90]) {
        const price = chargedPrice(mrp, pct);
        expect(Math.abs(packDiscountPct({ price, mrp }) - pct)).toBeLessThanOrEqual(1);
      }
    }
  });
});
