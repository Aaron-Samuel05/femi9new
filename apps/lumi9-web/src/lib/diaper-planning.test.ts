import { describe, expect, it } from "vitest";
import { defaultPerDay, planDiapers } from "./diaper-planning";
import { getSize } from "./catalog";

// SIZES is the seed's input, which makes it a legitimate FIXTURE for a unit
// test of the arithmetic - but no longer what the page plans against: the
// planner takes the product now, and the page hands it the database's.
const product = (code: string) => getSize(code);

describe("defaultPerDay", () => {
  it("returns the band for each age", () => {
    expect(defaultPerDay(0)).toBe(10);
    expect(defaultPerDay(3)).toBe(8);
    expect(defaultPerDay(8)).toBe(7);
    expect(defaultPerDay(18)).toBe(6);
    expect(defaultPerDay(40)).toBe(5);
  });
  it("clamps above the last band rather than returning undefined", () => {
    expect(defaultPerDay(120)).toBe(5);
  });
  it("treats a negative age as newborn", () => {
    expect(defaultPerDay(-1)).toBe(10);
  });
});

describe("planDiapers", () => {
  it("computes a month from a daily rate", () => {
    const plan = planDiapers({ product: product("M"), perDay: 7 });
    expect(plan).not.toBeNull();
    expect(plan!.perMonth).toBe(214); // ceil(7 * 30.44) = ceil(213.08)
  });
  it("picks the largest pack that does not overshoot a month", () => {
    expect(planDiapers({ product: product("M"), perDay: 7 })!.pack.count).toBe(54);
  });
  it("reports how long one pack lasts", () => {
    expect(planDiapers({ product: product("M"), perDay: 6 })!.packLastsDays).toBe(9); // 54 / 6
  });
  it("costs a month at the price the server charges", () => {
    const plan = planDiapers({ product: product("NB"), perDay: 10 })!;
    // 10/day -> 305/month -> 54-packs -> 6 packs at the pack's own price.
    //
    // This used to assert `6 * 674` - the pack price less a hardcoded 10%
    // "launch offer" that no server ever applied. So the one page whose whole
    // job is answering "what will this cost me a month" answered 10% low, and
    // this test held the wrong answer in place. The offer is off (see
    // LAUNCH_OFFER in content.ts); the cost is the price.
    expect(plan.packsPerMonth).toBe(6);
    expect(plan.monthlyCost).toBe(6 * plan.pack.price);
    expect(Number.isInteger(plan.monthlyCost)).toBe(true);
  });
  it("falls back to the smallest pack when even that overshoots a month", () => {
    // M has no 3-pack, so one diaper a day (31/month) still fits a 24.
    expect(planDiapers({ product: product("M"), perDay: 1 })!.pack.count).toBe(24);
  });
  it("rejects a nonsense rate rather than returning a plan", () => {
    expect(planDiapers({ product: product("M"), perDay: 0 })).toBeNull();
    expect(planDiapers({ product: product("M"), perDay: -3 })).toBeNull();
    expect(planDiapers({ product: product("M"), perDay: 60 })).toBeNull();
  });
  it("rejects an unknown size", () => {
    // `getSize` returns undefined, which is what the page passes when the
    // shopper's stored size is one the catalogue no longer sells.
    expect(planDiapers({ product: product("XXL"), perDay: 6 })).toBeNull();
  });
  it("rejects a product with no purchasable pack", () => {
    expect(planDiapers({ product: { packs: [] }, perDay: 6 })).toBeNull();
  });
  it("prices from the product it is given, not from a module", () => {
    // The whole point of the signature change: swap the packs, the cost moves.
    const plan = planDiapers({ product: { packs: [{ count: 30, price: 1000 }] }, perDay: 1 })!;
    expect(plan.pack.price).toBe(1000);
    // 1/day -> ceil(30.44) = 31 a month -> two 30-packs at 1000 each.
    expect(plan.packsPerMonth).toBe(2);
    expect(plan.monthlyCost).toBe(2000);
  });
});
