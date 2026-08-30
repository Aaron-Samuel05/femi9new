/**
 * Date-only arithmetic for a baby's age.
 *
 * Everything here works on `YYYY-MM-DD` strings and UTC-noon Date objects, and
 * that is deliberate. A `Date` built from a local timestamp shifts by an hour
 * across a DST boundary, which is enough to turn a 30-day span into 29 and move
 * a vaccine due date by a day. Anchoring at UTC noon puts every instant 12 hours
 * from a boundary, so no offset in the world can round it to the wrong day.
 */

export type IsoDate = string;

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

export function parseIsoDate(iso: IsoDate): { y: number; m: number; d: number } | null {
  const match = ISO.exec(iso ?? "");
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  // Round-trip through UTC to reject impossible days like 30 February.
  const probe = new Date(Date.UTC(y, m - 1, d, 12));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) {
    return null;
  }
  return { y, m, d };
}

/** UTC noon — see the module note on why not local midnight. */
function toUtcNoon(iso: IsoDate): Date | null {
  const parts = parseIsoDate(iso);
  if (!parts) return null;
  return new Date(Date.UTC(parts.y, parts.m - 1, parts.d, 12));
}

function toIso(date: Date): IsoDate {
  const y = String(date.getUTCFullYear()).padStart(4, "0");
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function ageInDays(dob: IsoDate, on: IsoDate): number {
  const a = toUtcNoon(dob);
  const b = toUtcNoon(on);
  if (!a || !b) return 0;
  return Math.round((b.getTime() - a.getTime()) / DAY_MS);
}

/** Completed months. A baby one day short of a month is still the month before. */
export function ageInMonths(dob: IsoDate, on: IsoDate): number {
  const a = parseIsoDate(dob);
  const b = parseIsoDate(on);
  if (!a || !b) return 0;
  let months = (b.y - a.y) * 12 + (b.m - a.m);
  if (b.d < a.d) months -= 1;
  return months;
}

const TERM_WEEKS = 37;
const CORRECTION_STOPS_AT_MONTHS = 24;

/**
 * Corrected age for prematurity, for GROWTH only.
 *
 * Immunisation must never use this — vaccine schedules run on chronological age
 * regardless of gestation, and correcting them would delay real doses.
 */
export function correctedAgeInMonths(
  dob: IsoDate,
  on: IsoDate,
  gestationalWeeks?: number,
): number {
  const chronological = ageInMonths(dob, on);
  if (
    gestationalWeeks === undefined ||
    gestationalWeeks >= TERM_WEEKS ||
    chronological >= CORRECTION_STOPS_AT_MONTHS
  ) {
    return Math.max(0, chronological);
  }
  const earlyDays = (TERM_WEEKS - gestationalWeeks) * 7;
  const shifted = toUtcNoon(dob);
  if (!shifted) return 0;
  // Walk the birth date forward by the prematurity, then measure normally, so
  // the result agrees with ageInMonths rather than drifting via a 30.44 divide.
  shifted.setUTCDate(shifted.getUTCDate() + earlyDays);
  return Math.max(0, ageInMonths(toIso(shifted), on));
}

export function addDays(iso: IsoDate, days: number): IsoDate {
  const date = toUtcNoon(iso);
  if (!date) return iso;
  date.setUTCDate(date.getUTCDate() + days);
  return toIso(date);
}

export function addWeeks(iso: IsoDate, weeks: number): IsoDate {
  return addDays(iso, weeks * 7);
}

/**
 * Calendar months, not 30.44-day approximations.
 *
 * A schedule that says "9 months" means the 9th of the birth month, not 274
 * days later, and the two differ by several days. Day-of-month is clamped to the
 * target month's length, so 31 January plus one month is 28 February rather
 * than spilling into March.
 */
export function addMonths(iso: IsoDate, months: number): IsoDate {
  const parts = parseIsoDate(iso);
  if (!parts) return iso;
  const total = parts.y * 12 + (parts.m - 1) + months;
  const year = Math.floor(total / 12);
  const month = ((total % 12) + 12) % 12;
  // Day 0 of the following month is the last day of this one.
  const lastDay = new Date(Date.UTC(year, month + 1, 0, 12)).getUTCDate();
  const day = Math.min(parts.d, lastDay);
  return toIso(new Date(Date.UTC(year, month, day, 12)));
}

export function addYears(iso: IsoDate, years: number): IsoDate {
  return addMonths(iso, years * 12);
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function formatMonthYear(iso: IsoDate): string {
  const parts = parseIsoDate(iso);
  if (!parts) return "";
  return `${MONTHS[parts.m - 1]} ${parts.y}`;
}
