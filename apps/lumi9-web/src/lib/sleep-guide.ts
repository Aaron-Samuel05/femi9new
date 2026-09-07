import type { IsoDate } from "@/lib/baby-age";

/**
 * Age-banded sleep norms, and the arithmetic that turns them into a day.
 *
 * Two different kinds of thing live here and the UI keeps them apart on purpose.
 * The BANDS are reference data - published ranges for how long a baby of a given
 * age can comfortably stay awake, how many naps that implies and how much sleep
 * a day totals. The SCHEDULE is arithmetic on top of them, and it is a starting
 * point rather than a prescription: it assumes every nap runs its typical length
 * and that nothing interrupts, which is true of no actual day.
 *
 * Sources: wake windows and nap counts follow the ranges paediatric sleep
 * references publish for each band; total sleep is the AASM/AAP consensus
 * (12-16h at 4-12 months, 11-14h at 1-2 years, 10-13h at 3-5 years), with the
 * National Sleep Foundation's 14-17h for the newborn months the consensus
 * statement does not cover.
 *
 * Ranges are given as ranges, never averaged into a single number. "Your baby
 * should be awake for 97 minutes" is a false precision that makes a parent feel
 * they are failing a test; "somewhere between 75 minutes and 2 hours" is what
 * the evidence actually supports.
 */
export type SleepBand = {
  /** Inclusive lower bound in months. */
  fromMonth: number;
  label: string;
  /** Comfortable awake stretch between sleeps, in minutes. */
  wakeWindowMin: number;
  wakeWindowMax: number;
  /** Daytime naps. */
  napsMin: number;
  napsMax: number;
  /** Typical length of one nap, in minutes — what the schedule chains on. */
  napLength: number;
  /** Total sleep across 24 hours, in hours. */
  totalMin: number;
  totalMax: number;
  note: string;
};

export const SLEEP_BANDS: SleepBand[] = [
  {
    fromMonth: 0,
    label: "Newborn",
    wakeWindowMin: 45,
    wakeWindowMax: 60,
    napsMin: 4,
    napsMax: 6,
    napLength: 60,
    totalMin: 14,
    totalMax: 17,
    note: "There is no schedule at this age and there is not meant to be. Feed on demand, and treat the wake window as the outer limit rather than a target.",
  },
  {
    fromMonth: 2,
    label: "2-3 months",
    wakeWindowMin: 60,
    wakeWindowMax: 90,
    napsMin: 4,
    napsMax: 5,
    napLength: 60,
    totalMin: 14,
    totalMax: 17,
    note: "Day and night are starting to separate. A longer stretch at night usually appears before naps get any tidier.",
  },
  {
    fromMonth: 4,
    label: "4-5 months",
    wakeWindowMin: 75,
    wakeWindowMax: 120,
    napsMin: 3,
    napsMax: 4,
    napLength: 60,
    totalMin: 12,
    totalMax: 16,
    note: "Sleep often gets worse around now, not better - it is a real developmental change and it passes.",
  },
  {
    fromMonth: 6,
    label: "6-8 months",
    wakeWindowMin: 120,
    wakeWindowMax: 165,
    napsMin: 2,
    napsMax: 3,
    napLength: 75,
    totalMin: 12,
    totalMax: 16,
    note: "Most babies settle into three naps here, then drop to two towards the end of it.",
  },
  {
    fromMonth: 9,
    label: "9-12 months",
    wakeWindowMin: 150,
    wakeWindowMax: 210,
    napsMin: 2,
    napsMax: 2,
    napLength: 75,
    totalMin: 12,
    totalMax: 16,
    note: "Two naps, morning and early afternoon. The third one goes for good somewhere in here.",
  },
  {
    fromMonth: 13,
    label: "13-18 months",
    wakeWindowMin: 210,
    wakeWindowMax: 270,
    napsMin: 1,
    napsMax: 2,
    napLength: 90,
    totalMin: 11,
    totalMax: 14,
    note: "The drop to one nap is bumpy and often takes weeks. Some days will still need two.",
  },
  {
    fromMonth: 19,
    label: "19-24 months",
    wakeWindowMin: 270,
    wakeWindowMax: 330,
    napsMin: 1,
    napsMax: 1,
    napLength: 105,
    totalMin: 11,
    totalMax: 14,
    note: "One long afternoon nap, and an earlier bedtime on days it is short.",
  },
  {
    fromMonth: 25,
    label: "2-3 years",
    wakeWindowMin: 300,
    wakeWindowMax: 360,
    napsMin: 0,
    napsMax: 1,
    napLength: 105,
    totalMin: 10,
    totalMax: 13,
    note: "The nap starts to disappear. Quiet time in its place protects the bedtime.",
  },
];

/** The band an age falls in. Ages past the last band get the last band. */
export function bandForAge(ageMonths: number): SleepBand {
  let found = SLEEP_BANDS[0];
  for (const band of SLEEP_BANDS) {
    if (ageMonths >= band.fromMonth) found = band;
  }
  return found;
}

export type SleepEvent = {
  kind: "nap" | "bedtime";
  /** Minutes from midnight. */
  at: number;
  label: string;
};

/**
 * A day, chained from a wake-up time.
 *
 * Chained on the MIDDLE of the wake window, not on its two ends.
 *
 * Carrying the range through was the honest-looking version and it produced
 * unusable output: the uncertainty compounds, so by the fifth nap the window
 * was two and a half hours wide and bedtime's overlapped the nap before it —
 * "bedtime, 5:30pm to 8:30pm" tells a parent nothing, and a nap that starts
 * after the bedtime it precedes reads as a broken calculator. The band's real
 * range is still shown, once, where it means something: as the wake window
 * itself. Here each sleep is one time, and the copy says "around".
 *
 * Bedtime is whatever follows the last nap and is NOT clamped to a plausible
 * hour: a baby who woke at 4am genuinely needs an earlier night, and quietly
 * moving it to 7pm would be the calculator protecting its own credibility.
 */
export function planDay(input: { wakeAtMinutes: number; band: SleepBand }): SleepEvent[] {
  const { band } = input;
  const wakeWindow = Math.round((band.wakeWindowMin + band.wakeWindowMax) / 2);
  const naps = band.napsMax;
  const out: SleepEvent[] = [];

  let at = input.wakeAtMinutes;
  for (let i = 0; i < naps; i++) {
    at += wakeWindow;
    if (at >= 24 * 60) return out;
    out.push({ kind: "nap", at, label: naps === 1 ? "Nap" : `Nap ${i + 1}` });
    at += band.napLength;
  }

  at += wakeWindow;
  if (at < 24 * 60) out.push({ kind: "bedtime", at, label: "Bedtime" });
  return out;
}

/** "6:30 am" — the 12-hour clock everything else in India is spoken in. */
export function formatClock(minutes: number): string {
  const m = ((minutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const h24 = Math.floor(m / 60);
  const mm = m % 60;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(mm).padStart(2, "0")} ${h24 < 12 ? "am" : "pm"}`;
}

/** "1 hr 15 min" from a minute count. */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} hr`;
  return `${h} hr ${m} min`;
}

/** "06:30" from an <input type="time">, as minutes. Null if unparseable. */
export function parseClock(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

export type { IsoDate };
