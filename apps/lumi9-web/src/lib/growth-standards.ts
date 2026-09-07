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
 * Abramowitz & Stegun 7.1.26. Maximum error ~1.5e-7 - orders of magnitude
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
 * The L = 0 branch never fires for the four tables we ship - height-for-age is
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

/**
 * The LMS transformation, inverted: the measurement that sits at a given z.
 *
 * `zScore` answers "where does this reading fall"; a CHART needs the opposite
 * question asked once per month — "what does a P50 baby weigh at 4 months" — so
 * that the five reference curves can be drawn. Same formula solved for `value`,
 * including the same defensive L = 0 branch, so the two cannot drift apart.
 */
export function valueForZ(z: number, row: LmsRow): number {
  if (row.l === 0) return row.m * Math.exp(row.s * z);
  return row.m * Math.pow(1 + row.l * row.s * z, 1 / row.l);
}

/**
 * The five reference lines WHO's own percentile charts print.
 *
 * Fixed constants rather than an inverse-normal function: there are exactly five
 * of them, these values are exact to more places than a chart can draw, and a
 * probit approximation would be a second numerical method to justify and test
 * for no gain. (`erf` above exists because the percentile READOUT genuinely
 * needs a continuous CDF; this does not.)
 */
export const CHART_PERCENTILES = [
  { percentile: 3, z: -1.88079 },
  { percentile: 15, z: -1.03643 },
  { percentile: 50, z: 0 },
  { percentile: 85, z: 1.03643 },
  { percentile: 97, z: 1.88079 },
] as const;

/**
 * One reference curve, sampled monthly.
 *
 * Months past the end of the WHO table are dropped rather than extrapolated —
 * `lookupLms` returns null there, and inventing a curve beyond five years would
 * be drawing a standard that does not exist.
 */
export function percentileCurve(input: {
  indicator: GrowthIndicator;
  sex: BabySex;
  z: number;
  toMonth: number;
}): { month: number; value: number }[] {
  const out: { month: number; value: number }[] = [];
  const last = Math.min(Math.ceil(input.toMonth), MAX_MONTH);
  for (let month = 0; month <= last; month++) {
    const row = lookupLms(input.indicator, input.sex, month);
    if (!row) continue;
    out.push({ month, value: valueForZ(input.z, row) });
  }
  return out;
}
