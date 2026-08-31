import { addDays, ageInMonths, formatMonthYear, type IsoDate } from "@/lib/baby-age";
import type { BabySex } from "@/lib/baby-profile";
import type { SizeCode } from "@/lib/catalog";
import { lookupLms, Z_DISPLAY_LIMIT, zScore } from "@/lib/growth-standards";

/**
 * Numeric bounds behind the catalog's `WEIGHT_OPTIONS` labels. The catalog
 * stores those ranges as display strings ("4-8 kg"); parsing them at runtime
 * would let a copy edit silently change the maths, so they are stated once here
 * and must be kept in step with `WEIGHT_OPTIONS`.
 */
export const SIZE_BOUNDS: { size: SizeCode; minKg: number; maxKg: number }[] = [
  { size: "NB", minKg: 0, maxKg: 5 },
  { size: "S", minKg: 4, maxKg: 8 },
  { size: "M", minKg: 7, maxKg: 12 },
  { size: "L", minKg: 9, maxKg: 14 },
  { size: "XL", minKg: 12, maxKg: 17 },
];

/** The bands overlap by design; the first match is the smallest size that fits. */
export function sizeForWeight(weightKg: number): SizeCode | null {
  if (!Number.isFinite(weightKg) || weightKg <= 0) return null;
  const band = SIZE_BOUNDS.find((b) => weightKg > b.minKg && weightKg <= b.maxKg);
  return band ? band.size : null;
}

export function nextSize(size: SizeCode): SizeCode | null {
  const index = SIZE_BOUNDS.findIndex((b) => b.size === size);
  if (index < 0 || index === SIZE_BOUNDS.length - 1) return null;
  return SIZE_BOUNDS[index + 1].size;
}

const HORIZON_MONTHS = 6;

/**
 * When will this baby need the next size?
 *
 * Holds the child's OWN weight-for-age z-score constant and walks the WHO table
 * forward, rather than applying the population median velocity. That distinction
 * matters for exactly the children this is most useful for: a baby on the 90th
 * centile leaves a size sooner than the median, one on the 10th later.
 *
 * Capped at six months and reported as a month, never a date - precision beyond
 * that is invented.
 */
export function projectSizeUp(input: {
  dob: IsoDate;
  sex: BabySex;
  weightKg: number;
  today: IsoDate;
}):
  | { current: SizeCode; next: SizeCode; whenMonth: string }
  | { unavailable: "out-of-range" | "beyond-horizon" | "largest-size" } {
  const current = sizeForWeight(input.weightKg);
  if (!current) return { unavailable: "out-of-range" };

  const upcoming = nextSize(current);
  if (!upcoming) return { unavailable: "largest-size" };

  const bound = SIZE_BOUNDS.find((b) => b.size === current);
  if (!bound) return { unavailable: "out-of-range" };

  const ageNow = ageInMonths(input.dob, input.today);
  const rowNow = lookupLms("weight-for-age", input.sex, ageNow);
  if (!rowNow) return { unavailable: "out-of-range" };

  const z = zScore(input.weightKg, rowNow);
  if (!Number.isFinite(z) || Math.abs(z) > Z_DISPLAY_LIMIT) return { unavailable: "out-of-range" };

  // A fortnight at a time: finer than the data's monthly resolution, coarse
  // enough that the loop is trivially bounded.
  for (let days = 14; days <= HORIZON_MONTHS * 31; days += 14) {
    const when = addDays(input.today, days);
    const age = ageInMonths(input.dob, when);
    const row = lookupLms("weight-for-age", input.sex, age);
    if (!row) break;
    // Invert the LMS transform at the held z to get the projected weight.
    const projected =
      row.l === 0 ? row.m * Math.exp(z * row.s) : row.m * Math.pow(1 + row.l * row.s * z, 1 / row.l);
    if (Number.isFinite(projected) && projected > bound.maxKg) {
      return { current, next: upcoming, whenMonth: formatMonthYear(when) };
    }
  }
  return { unavailable: "beyond-horizon" };
}
