import { describe, expect, it } from "vitest";
import {
  CHART_PERCENTILES,
  normalCdf,
  percentileCurve,
  valueForZ,
  zScore,
} from "./growth-standards";
import { WEIGHT_FOR_AGE_BOYS, HEIGHT_FOR_AGE_GIRLS } from "./growth-standards.data";

describe("valueForZ", () => {
  it("returns the median M at z = 0", () => {
    // The whole point of L/M/S: M *is* the 50th centile, so this is exact and
    // not an approximation that happens to be close.
    for (const row of WEIGHT_FOR_AGE_BOYS) {
      expect(valueForZ(0, row)).toBeCloseTo(row.m, 10);
    }
  });

  it("inverts zScore exactly", () => {
    const row = WEIGHT_FOR_AGE_BOYS[6];
    for (const v of [4.5, 6, 7.9389, 9, 12]) {
      expect(valueForZ(zScore(v, row), row)).toBeCloseTo(v, 9);
    }
  });

  it("inverts zScore for the L = 1 height tables too", () => {
    const row = HEIGHT_FOR_AGE_GIRLS[12];
    for (const v of [68, 74.0, 80]) {
      expect(valueForZ(zScore(v, row), row)).toBeCloseTo(v, 9);
    }
  });

  it("is monotonic in z", () => {
    const row = WEIGHT_FOR_AGE_BOYS[3];
    const ladder = [-2, -1, 0, 1, 2].map((z) => valueForZ(z, row));
    for (let i = 1; i < ladder.length; i++) expect(ladder[i]).toBeGreaterThan(ladder[i - 1]);
  });
});

describe("CHART_PERCENTILES", () => {
  it("carries the z for the percentile it claims", () => {
    // Guards the hardcoded constants against a typo: each z must round-trip
    // through the normal CDF to its own label.
    for (const { percentile, z } of CHART_PERCENTILES) {
      expect(normalCdf(z) * 100).toBeCloseTo(percentile, 1);
    }
  });
});

describe("percentileCurve", () => {
  it("samples one point per month up to the requested age", () => {
    const c = percentileCurve({ indicator: "weight-for-age", sex: "male", z: 0, toMonth: 6 });
    expect(c.map((p) => p.month)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(c[0].value).toBeCloseTo(WEIGHT_FOR_AGE_BOYS[0].m, 10);
  });

  it("stops at the end of the WHO table rather than extrapolating", () => {
    // The standards run birth to five years. Asking for ten must not invent one.
    const c = percentileCurve({ indicator: "weight-for-age", sex: "male", z: 0, toMonth: 120 });
    expect(c[c.length - 1].month).toBe(60);
  });

  it("orders the five reference curves without crossing", () => {
    const curves = CHART_PERCENTILES.map((p) =>
      percentileCurve({ indicator: "weight-for-age", sex: "female", z: p.z, toMonth: 24 }),
    );
    for (let m = 0; m <= 24; m++) {
      for (let i = 1; i < curves.length; i++) {
        expect(curves[i][m].value).toBeGreaterThan(curves[i - 1][m].value);
      }
    }
  });
});
