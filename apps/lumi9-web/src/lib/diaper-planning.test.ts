import { describe, expect, it } from "vitest";
import { defaultPerDay, planDiapers } from "./diaper-planning";

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
    const plan = planDiapers({ size: "M", perDay: 7 });
    expect(plan).not.toBeNull();
    expect(plan!.perMonth).toBe(214); // ceil(7 * 30.44) = ceil(213.08)
  });
  it("picks the largest pack that does not overshoot a month", () => {
    expect(planDiapers({ size: "M", perDay: 7 })!.pack.count).toBe(54);
  });
  it("reports how long one pack lasts", () => {
    expect(planDiapers({ size: "M", perDay: 6 })!.packLastsDays).toBe(9); // 54 / 6
  });
  it("costs a month at launch pricing", () => {
    const plan = planDiapers({ size: "NB", perDay: 10 })!;
    // 10/day -> 305/month -> 54-packs -> 6 packs at 749 less 10% = 674
    expect(plan.packsPerMonth).toBe(6);
    expect(plan.monthlyCost).toBe(6 * 674);
    expect(Number.isInteger(plan.monthlyCost)).toBe(true);
  });
  it("falls back to the smallest pack when even that overshoots a month", () => {
    // M has no 3-pack, so one diaper a day (31/month) still fits a 24.
    expect(planDiapers({ size: "M", perDay: 1 })!.pack.count).toBe(24);
  });
  it("rejects a nonsense rate rather than returning a plan", () => {
    expect(planDiapers({ size: "M", perDay: 0 })).toBeNull();
    expect(planDiapers({ size: "M", perDay: -3 })).toBeNull();
    expect(planDiapers({ size: "M", perDay: 60 })).toBeNull();
  });
  it("rejects an unknown size", () => {
    expect(planDiapers({ size: "XXL" as never, perDay: 6 })).toBeNull();
  });
});
