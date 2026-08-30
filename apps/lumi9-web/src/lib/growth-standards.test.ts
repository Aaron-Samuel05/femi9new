import { describe, expect, it } from "vitest";
import {
  HEIGHT_FOR_AGE_BOYS,
  HEIGHT_FOR_AGE_GIRLS,
  WEIGHT_FOR_AGE_BOYS,
  WEIGHT_FOR_AGE_GIRLS,
} from "./growth-standards.data";
import { normalCdf, percentileFor, zScore } from "./growth-standards";

describe("the generated WHO tables", () => {
  const tables = {
    WEIGHT_FOR_AGE_BOYS,
    WEIGHT_FOR_AGE_GIRLS,
    HEIGHT_FOR_AGE_BOYS,
    HEIGHT_FOR_AGE_GIRLS,
  };
  for (const [name, rows] of Object.entries(tables)) {
    it(`${name} covers months 0-60 exactly once, in order`, () => {
      expect(rows).toHaveLength(61);
      expect(rows.map((r) => r.month)).toEqual([...Array(61).keys()]);
    });
    it(`${name} has plausible, non-zero M and S`, () => {
      for (const row of rows) {
        expect(row.m).toBeGreaterThan(0);
        expect(row.s).toBeGreaterThan(0);
        expect(Number.isFinite(row.l)).toBe(true);
      }
    });
    it(`${name} increases monotonically in M`, () => {
      // Babies do not shrink on the median curve. This catches a transposed or
      // mis-generated row, which is the realistic failure for generated data.
      for (let i = 1; i < rows.length; i++) {
        expect(rows[i].m).toBeGreaterThan(rows[i - 1].m);
      }
    });
  }
});

describe("normalCdf", () => {
  it("matches known values of the standard normal", () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6);
    expect(normalCdf(1)).toBeCloseTo(0.8413447, 5);
    expect(normalCdf(-1)).toBeCloseTo(0.1586553, 5);
    expect(normalCdf(1.959964)).toBeCloseTo(0.975, 5);
    expect(normalCdf(-2.575829)).toBeCloseTo(0.005, 5);
  });
  it("is symmetric", () => {
    for (const z of [0.25, 1.1, 2.4, 3.9]) {
      expect(normalCdf(z) + normalCdf(-z)).toBeCloseTo(1, 6);
    }
  });
});

describe("zScore", () => {
  it("returns 0 when the value equals the median", () => {
    expect(zScore(3.3464, { month: 0, l: 0.3487, m: 3.3464, s: 0.14602 })).toBeCloseTo(0, 9);
  });
  it("uses the log branch when L is 0", () => {
    const row = { month: 0, l: 0, m: 10, s: 0.1 };
    expect(zScore(10, row)).toBeCloseTo(0, 9);
    expect(zScore(12, row)).toBeCloseTo(Math.log(1.2) / 0.1, 9);
  });
  it("is positive above the median and negative below", () => {
    const row = { month: 0, l: 0.3487, m: 3.3464, s: 0.14602 };
    expect(zScore(4.2, row)).toBeGreaterThan(0);
    expect(zScore(2.6, row)).toBeLessThan(0);
  });
});

describe("percentileFor", () => {
  it("puts a median baby at the 50th percentile at every age", () => {
    for (const month of [0, 6, 24, 60]) {
      const row = WEIGHT_FOR_AGE_BOYS[month];
      const result = percentileFor({
        indicator: "weight-for-age",
        sex: "male",
        ageMonths: month,
        value: row.m,
      });
      expect("percentile" in result && result.percentile).toBeCloseTo(50, 1);
    }
  });
  it("declines an age above 60 months", () => {
    expect(
      percentileFor({ indicator: "weight-for-age", sex: "male", ageMonths: 61, value: 20 }),
    ).toEqual({ outOfRange: "age" });
  });
  it("declines a value beyond 5 SD rather than returning a number", () => {
    expect(
      percentileFor({ indicator: "weight-for-age", sex: "female", ageMonths: 0, value: 0.4 }),
    ).toEqual({ outOfRange: "extreme" });
  });
  it("interpolates between whole months", () => {
    const a = percentileFor({ indicator: "weight-for-age", sex: "male", ageMonths: 6, value: 8 });
    const b = percentileFor({ indicator: "weight-for-age", sex: "male", ageMonths: 7, value: 8 });
    if ("percentile" in a && "percentile" in b) {
      // The same weight is a lower percentile at an older age.
      expect(b.percentile).toBeLessThan(a.percentile);
    } else {
      throw new Error("expected both to be in range");
    }
  });
  it("agrees with the WHO published SD3neg column", () => {
    // WHO's own table gives -3 SD for a newborn boy as 2.08 kg. Our maths must
    // put that value at z = -3, which is the end-to-end check that the L/M/S
    // transcription and the formula agree with the source.
    const result = percentileFor({
      indicator: "weight-for-age",
      sex: "male",
      ageMonths: 0,
      value: 2.08,
    });
    expect("z" in result && result.z).toBeCloseTo(-3, 2);
  });
});
