import type { BabySex } from "@/lib/baby-profile";
import {
  HEIGHT_FOR_AGE_BOYS,
  HEIGHT_FOR_AGE_GIRLS,
  WEIGHT_FOR_AGE_BOYS,
  WEIGHT_FOR_AGE_GIRLS,
} from "./growth-standards.data";

export type GrowthIndicator = "weight-for-age" | "height-for-age";
export type LmsRow = { month: number; l: number; m: number; s: number };

/** Beyond this the number stops meaning anything useful to a parent. */
export const Z_DISPLAY_LIMIT = 5;
const MAX_MONTH = 60;

/**
 * Abramowitz & Stegun 7.1.26. Maximum error ~1.5e-7 — orders of magnitude
 * finer than a displayed percentile needs.
 *
 * Spelled out because JavaScript has no erf and no normal CDF, and this is
 * exactly the gap that otherwise gets filled with a rough guess.
 */
export function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t +
      0.254829592) *
      t *
      Math.exp(-ax * ax);
  return sign * y;
}

export function normalCdf(z: number): number {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

/**
 * The LMS transformation.
 *
 * The L = 0 branch never fires for the four tables we ship — height-for-age is
 * L = 1 throughout, weight-for-age runs -0.3531 to 0.3809. It is here because
 * the general formula divides by zero at L = 0, and that is a real case for
 * other WHO indicators.
 */
export function zScore(value: number, row: LmsRow): number {
  if (row.l === 0) return Math.log(value / row.m) / row.s;
  return (Math.pow(value / row.m, row.l) - 1) / (row.l * row.s);
}

function tableFor(indicator: GrowthIndicator, sex: BabySex): LmsRow[] {
  if (indicator === "weight-for-age") {
    return sex === "male" ? WEIGHT_FOR_AGE_BOYS : WEIGHT_FOR_AGE_GIRLS;
  }
  return sex === "male" ? HEIGHT_FOR_AGE_BOYS : HEIGHT_FOR_AGE_GIRLS;
}

/** Linear interpolation between whole-month rows. */
export function lookupLms(
  indicator: GrowthIndicator,
  sex: BabySex,
  month: number,
): LmsRow | null {
  if (!Number.isFinite(month) || month < 0 || month > MAX_MONTH) return null;
  const rows = tableFor(indicator, sex);
  const lower = Math.floor(month);
  const upper = Math.ceil(month);
  if (lower === upper) return rows[lower] ?? null;
  const a = rows[lower];
  const b = rows[upper];
  if (!a || !b) return null;
  const t = month - lower;
  return {
    month,
    l: a.l + (b.l - a.l) * t,
    m: a.m + (b.m - a.m) * t,
    s: a.s + (b.s - a.s) * t,
  };
}

export function percentileFor(input: {
  indicator: GrowthIndicator;
  sex: BabySex;
  ageMonths: number;
  value: number;
}): { z: number; percentile: number } | { outOfRange: "age" | "extreme" } {
  const row = lookupLms(input.indicator, input.sex, input.ageMonths);
  if (!row) return { outOfRange: "age" };
  if (!Number.isFinite(input.value) || input.value <= 0) return { outOfRange: "extreme" };

  const z = zScore(input.value, row);
  if (!Number.isFinite(z) || Math.abs(z) > Z_DISPLAY_LIMIT) return { outOfRange: "extreme" };
  return { z, percentile: normalCdf(z) * 100 };
}
