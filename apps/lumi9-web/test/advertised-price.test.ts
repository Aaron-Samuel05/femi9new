import { describe, it, expect } from "vitest";
import { LAUNCH_OFFER } from "@/lib/content";
import { planDiapers } from "@/lib/diaper-planning";

/**
 * A price a shopper is SHOWN must be the price she is CHARGED.
 *
 * `LAUNCH_OFFER` was `{ percent: 10, label: "Launch offer" }` and no server code
 * has ever read it. `getCart` and `placeOrder` both price a line from the
 * variant's own price, so the home page's pack cards led with a number ~10%
 * below what Razorpay took, struck the real price through beside it, and put a
 * "10% off" badge on the gap. All five products, on the site's main buying
 * surface.
 *
 * Nothing failed. Both numbers on the card were derived from one constant, so
 * they agreed with each other perfectly — and neither agreed with the gateway.
 * That is exactly the shape a test has to catch, because reading the card tells
 * you nothing is wrong with it.
 *
 * This is deliberately a blunt assertion rather than a clever one. Re-enabling
 * the badge is a one-word edit, and the person making it should be stopped here
 * and sent to the note on the constant, which says where a real discount has to
 * live (a console price change, or a coupon) for the number on the card to be
 * true.
 */
describe("advertised prices", () => {
  it("does not advertise a discount no server applies", () => {
    // If you are here because you turned the launch offer back on: the discount
    // must be applied by `quoteCart`/`placeOrder` and carried to the client on
    // `CatalogPayload`, the way `subscribeSavePct` is. Then replace this with an
    // assertion that the badge's percentage came from that payload.
    expect(LAUNCH_OFFER).toBeNull();
  });

  it("quotes the parenting planner's monthly cost at the charged price", () => {
    // `planDiapers` ran `pack.price` through the same fake discount, so the one
    // page whose whole job is answering "what will this cost me a month"
    // answered ~10% low.
    const product = { packs: [{ count: 24, price: 449 }, { count: 54, price: 949 }] };
    const plan = planDiapers({ product, perDay: 8 });
    expect(plan).not.toBeNull();
    expect(plan!.monthlyCost).toBe(plan!.packsPerMonth * plan!.pack.price);
  });
});
