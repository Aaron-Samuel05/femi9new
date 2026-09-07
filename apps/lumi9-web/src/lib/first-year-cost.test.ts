import { describe, expect, it } from "vitest";
import { bestUnitPrice, formatRupees, planFirstYear, type CostSize } from "./first-year-cost";
import type { SizeBound } from "./size-projection";

const SIZES: CostSize[] = [
  { size: "NB", packs: [{ count: 24, price: 360 }, { count: 54, price: 700 }] },
  { size: "S", packs: [{ count: 24, price: 384 }, { count: 54, price: 756 }] },
  { size: "M", packs: [{ count: 24, price: 408 }, { count: 54, price: 810 }] },
  { size: "L", packs: [{ count: 24, price: 432 }, { count: 54, price: 864 }] },
  { size: "XL", packs: [{ count: 24, price: 456 }, { count: 54, price: 918 }] },
];

const BOUNDS: SizeBound[] = [
  { size: "NB", minKg: 0, maxKg: 5 },
  { size: "S", minKg: 4, maxKg: 8 },
  { size: "M", minKg: 7, maxKg: 12 },
  { size: "L", minKg: 11, maxKg: 16 },
  { size: "XL", minKg: 15, maxKg: 25 },
];

describe("bestUnitPrice", () => {
  it("takes the cheapest per-diaper price, not the default pack", () => {
    // 700/54 = 12.96 beats 360/24 = 15. A parent buying a year buys the value pack.
    expect(bestUnitPrice(SIZES, "NB")).toBeCloseTo(700 / 54, 6);
  });

  it("returns null for a size the catalogue does not carry", () => {
    expect(bestUnitPrice([], "M")).toBeNull();
    expect(bestUnitPrice([{ size: "M", packs: [] }], "M")).toBeNull();
  });

  it("ignores a zero-priced or zero-count pack rather than dividing by it", () => {
    expect(bestUnitPrice([{ size: "M", packs: [{ count: 0, price: 100 }] }], "M")).toBeNull();
  });
});

describe("planFirstYear", () => {
  const base = { sex: "female" as const, sizes: SIZES, sizeBounds: BOUNDS };

  it("covers twelve months", () => {
    const r = planFirstYear(base);
    expect(r.months).toHaveLength(12);
    expect(r.months[0].month).toBe(0);
    expect(r.months[11].month).toBe(11);
  });

  it("grows the size through the year instead of quoting one size", () => {
    const r = planFirstYear(base);
    const sizes = r.months.map((m) => m.size);
    expect(new Set(sizes).size).toBeGreaterThan(1);
    // Never shrinks: weight is monotonic along a centile, so the size must be too.
    const order = ["NB", "S", "M", "L", "XL"];
    for (let i = 1; i < sizes.length; i++) {
      expect(order.indexOf(sizes[i])).toBeGreaterThanOrEqual(order.indexOf(sizes[i - 1]));
    }
  });

  it("uses fewer diapers a day as the baby gets older", () => {
    const r = planFirstYear(base);
    expect(r.months[0].perDay).toBeGreaterThan(r.months[11].perDay);
  });

  it("totals what the months add up to", () => {
    const r = planFirstYear(base);
    expect(r.totalCost).toBe(r.months.reduce((n, m) => n + m.cost, 0));
    expect(r.totalDiapers).toBe(r.months.reduce((n, m) => n + m.diapers, 0));
    expect(r.bySize.reduce((n, s) => n + s.cost, 0)).toBe(r.totalCost);
  });

  it("projects a heavier baby along their own centile, not the median", () => {
    const median = planFirstYear(base);
    // 7.5 kg at 3 months is a real, big baby (~97th), not a typo.
    const heavy = planFirstYear({ ...base, currentWeightKg: 7.5, currentAgeMonths: 3 });
    expect(heavy.months[6].weightKg).toBeGreaterThan(median.months[6].weightKg);
  });

  it("ignores an implausible weight rather than buying XL for a year", () => {
    const median = planFirstYear(base);
    const typo = planFirstYear({ ...base, currentWeightKg: 70, currentAgeMonths: 3 });
    expect(typo.months[6].weightKg).toBeCloseTo(median.months[6].weightKg, 6);
  });

  it("honours a parent's own daily rate", () => {
    const r = planFirstYear({ ...base, perDayOverride: 4 });
    expect(r.months.every((m) => m.perDay === 4)).toBe(true);
    expect(r.totalCost).toBeLessThan(planFirstYear(base).totalCost);
  });

  it("starts partway through the year when a baby is already born", () => {
    const r = planFirstYear({ ...base, fromMonth: 6 });
    expect(r.months).toHaveLength(6);
    expect(r.months[0].month).toBe(6);
  });

  it("costs nothing for a size the catalogue does not carry, rather than crashing", () => {
    const r = planFirstYear({ ...base, sizes: [] });
    expect(r.totalCost).toBe(0);
    expect(r.months).toHaveLength(12);
  });
});

describe("formatRupees", () => {
  it("groups in the Indian system", () => {
    expect(formatRupees(1234567)).toBe("₹12,34,567");
    expect(formatRupees(12480)).toBe("₹12,480");
  });
});
