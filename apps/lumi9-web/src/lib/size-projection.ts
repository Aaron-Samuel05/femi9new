import { addDays, ageInMonths, formatMonthYear, type IsoDate } from "@/lib/baby-age";
import type { BabySex } from "@/lib/baby-profile";
import type { SizeCode } from "@/lib/catalog";
import { lookupLms, Z_DISPLAY_LIMIT, zScore } from "@/lib/growth-standards";

export type SizeBound = { size: SizeCode; minKg: number; maxKg: number };

/**
 * The FALLBACK bands, and the fixture this module's tests run against.
 *
 * It used to be the only copy, with a header conceding it "must be kept in step
 * with `WEIGHT_OPTIONS`" by hand. It was not: the catalogue moved into the
 * database, an admin could rename a range in the console, and that moved the
 * words a parent READ while these numbers went on deciding what the projector
 * CALCULATED. Nothing anywhere reported the divergence.
 *
 * `Product.minWeightKg` / `maxWeightKg` are the source now, and
 * `boundsFromCatalog()` derives this shape from them - the same relationship
 * `scheduleFor(input, doses)` has to its dose table. These values survive as
 * the default so every existing call site and every test keeps working, and so
 * a catalogue that predates the migration still projects rather than going
 * blank.
 *
 * Parsing the display string ("4-8 kg") was the other option and is worse: it
 * lets a copy edit silently change the maths.
 */
export const SIZE_BOUNDS: SizeBound[] = [
  { size: "NB", minKg: 0, maxKg: 5 },
  { size: "S", minKg: 4, maxKg: 8 },
  { size: "M", minKg: 7, maxKg: 12 },
  { size: "L", minKg: 9, maxKg: 14 },
  { size: "XL", minKg: 12, maxKg: 17 },
];

/**
 * The catalogue's bands, in run order.
 *
 * A size whose row has no bounds is DROPPED rather than defaulted: guessing a
 * band for a product nobody measured would put a baby in a nappy on the
 * strength of a fallback. Returns `SIZE_BOUNDS` when that leaves nothing at
 * all, so a catalogue seeded before the migration still projects.
 */
export function boundsFromCatalog(
  sizes: { size: string; minWeightKg: number | null; maxWeightKg: number | null }[],
): SizeBound[] {
  const bounds = sizes
    .filter((s) => s.minWeightKg !== null && s.maxWeightKg !== null)
    .map((s) => ({
      size: s.size as SizeCode,
      minKg: s.minWeightKg as number,
      maxKg: s.maxWeightKg as number,
    }));
  return bounds.length > 0 ? bounds : SIZE_BOUNDS;
}

/** The bands overlap by design; the first match is the smallest size that fits. */
export function sizeForWeight(
  weightKg: number,
  bounds: SizeBound[] = SIZE_BOUNDS,
): SizeCode | null {
  if (!Number.isFinite(weightKg) || weightKg <= 0) return null;
  const band = bounds.find((b) => weightKg > b.minKg && weightKg <= b.maxKg);
  return band ? band.size : null;
}

export function nextSize(size: SizeCode, bounds: SizeBound[] = SIZE_BOUNDS): SizeCode | null {
  const index = bounds.findIndex((b) => b.size === size);
  if (index < 0 || index === bounds.length - 1) return null;
  return bounds[index + 1].size;
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
export function projectSizeUp(
  input: {
    dob: IsoDate;
    sex: BabySex;
    weightKg: number;
    today: IsoDate;
  },
  bounds: SizeBound[] = SIZE_BOUNDS,
):
  | { current: SizeCode; next: SizeCode; whenMonth: string }
  | { unavailable: "out-of-range" | "beyond-horizon" | "largest-size" } {
  const current = sizeForWeight(input.weightKg, bounds);
  if (!current) return { unavailable: "out-of-range" };

  const upcoming = nextSize(current, bounds);
  if (!upcoming) return { unavailable: "largest-size" };

  const bound = bounds.find((b) => b.size === current);
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
