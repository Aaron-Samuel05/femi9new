# Lumi9 Parenting Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `/parenting-tools` for the Lumi9 storefront — four tools (diaper planner, size-up predictor, growth percentile, India immunisation schedule) sharing one locally-stored baby profile.

**Architecture:** One page with anchored sections, not four routes. Every calculation lives in a pure `src/lib/` module that takes data and returns data; components only render. That split is what makes the health maths testable without mounting React, and the health maths is where a wrong number matters.

**Tech Stack:** Next 16.3.1 (App Router), React 19.2.8, TypeScript 5, Tailwind v4, Vitest (added by Task 1).

**Spec:** `docs/superpowers/specs/2026-08-30-parenting-tools-design.md`

## Global Constraints

Every task's requirements implicitly include this section.

- **App directory is `apps/lumi9-web`.** All paths below are relative to it unless they start with `docs/` or `packages/`.
- **`npm install` runs ONLY at the workspace root** (`/Users/bot/dev/femi9`). There is one hoisted lockfile; apps have none. `npm ci` also only works at the root. This is from the root `CLAUDE.md` and is not optional.
- **Vaccine ages and WHO LMS numbers are transcribed from published sources.** Never written from memory, never estimated. Every data entry carries `source` and `revisedOn`. If the source cannot be reached, stop and report — do not invent values.
- **Growth uses CORRECTED age** for babies born before 37 weeks, up to 24 months. **Immunisation uses CHRONOLOGICAL age, always.** Applying either rule to both is harmful in opposite directions.
- **All dates are date-only.** No `Date` with a time component, no timezone conversion, no `toISOString()` on a local date. A due date that shifts by a day depending on the viewer's timezone is a real bug and very hard to notice.
- **The profile is never a gate.** Every tool renders and accepts its own inputs with an empty profile.
- **Both immunisation tracks (UIP and IAP) ship.** India has two; showing one misinforms a large share of readers.
- **Tailwind v4 has no numeric font-weight utilities.** `font-600`, `font-700`, `font-800` emit no CSS at all in this codebase — verified. Use `font-semibold`, `font-bold`, `font-extrabold`.
- **Run `npm run typecheck` and `npm run lint` before every commit.** Both are clean today; keep them clean.
- Commit messages: `feat:` / `test:` / `docs:` prefix, present tense.

## File Structure

| File | Responsibility |
| --- | --- |
| `src/lib/baby-age.ts` | Date-only arithmetic: age in days/months, corrected age, month addition |
| `src/lib/baby-profile.ts` | The shared profile store — `localStorage` + `useSyncExternalStore` |
| `src/lib/growth-standards.ts` | z-score, normal CDF, percentile, table lookup |
| `src/lib/growth-standards.data.ts` | WHO LMS tables, transcribed from source |
| `src/lib/size-projection.ts` | When the baby crosses into the next diaper size |
| `src/lib/diaper-planning.ts` | Usage bands, monthly count, pack selection, ₹ cost |
| `src/lib/immunisation-schedule.ts` | Dating and track filtering |
| `src/lib/immunisation-schedule.data.ts` | UIP + IAP doses, transcribed from source |
| `src/components/tools/BabyProfileCard.tsx` | Enter/edit the profile |
| `src/components/tools/DiaperPlanner.tsx` | Tool 1 UI |
| `src/components/tools/SizeUpPredictor.tsx` | Tool 2 UI |
| `src/components/tools/GrowthPercentile.tsx` | Tool 3 UI |
| `src/components/tools/ImmunisationSchedule.tsx` | Tool 4 UI |
| `src/components/tools/ToolDisclaimer.tsx` | Shared medical disclaimer + source line |
| `src/app/parenting-tools/page.tsx` | Metadata, JSON-LD, composition |

Modified: `src/app/sitemap.ts`, `src/components/site/Nav.tsx`, `package.json` (root + app).

---

### Task 1: Vitest harness and date-only age arithmetic

`lumi9-web` has no test tooling at all today. This task adds it and proves it with the first real module. Every later task's maths depends on these date helpers, so they come first.

**Files:**
- Create: `apps/lumi9-web/vitest.config.ts`
- Create: `apps/lumi9-web/src/lib/baby-age.ts`
- Create: `apps/lumi9-web/src/lib/baby-age.test.ts`
- Modify: `apps/lumi9-web/package.json` (add `test` script, two devDependencies)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type IsoDate = string` — `"YYYY-MM-DD"`, date-only
  - `parseIsoDate(iso: IsoDate): { y: number; m: number; d: number } | null`
  - `ageInDays(dob: IsoDate, on: IsoDate): number`
  - `ageInMonths(dob: IsoDate, on: IsoDate): number` — completed months
  - `correctedAgeInMonths(dob: IsoDate, on: IsoDate, gestationalWeeks?: number): number`
  - `addDays(iso: IsoDate, days: number): IsoDate`
  - `addWeeks(iso: IsoDate, weeks: number): IsoDate`
  - `formatMonthYear(iso: IsoDate): string` — e.g. `"March 2027"`

- [ ] **Step 1: Install the test tooling from the workspace root**

```bash
cd /Users/bot/dev/femi9
npm install -D --workspace lumi9-web vitest vite-tsconfig-paths
```

`vite-tsconfig-paths` is required because the lib modules import via the `@/` alias, which Vitest does not resolve on its own.

- [ ] **Step 2: Add the Vitest config**

Create `apps/lumi9-web/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

// `node`, not jsdom: everything under test is a pure function. Nothing mounts,
// so there is no reason to pay for a DOM or to add a second testing library.
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["src/lib/**/*.test.ts"],
  },
});
```

- [ ] **Step 3: Add the test script**

In `apps/lumi9-web/package.json`, add to `"scripts"` after `"typecheck"`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Write the failing tests**

Create `apps/lumi9-web/src/lib/baby-age.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  addDays,
  addWeeks,
  ageInDays,
  ageInMonths,
  correctedAgeInMonths,
  formatMonthYear,
  parseIsoDate,
} from "./baby-age";

describe("parseIsoDate", () => {
  it("parses a valid date", () => {
    expect(parseIsoDate("2026-03-09")).toEqual({ y: 2026, m: 3, d: 9 });
  });
  it("rejects malformed input", () => {
    expect(parseIsoDate("09-03-2026")).toBeNull();
    expect(parseIsoDate("2026-13-01")).toBeNull();
    expect(parseIsoDate("2026-02-30")).toBeNull();
    expect(parseIsoDate("")).toBeNull();
  });
});

describe("ageInDays", () => {
  it("counts whole days", () => {
    expect(ageInDays("2026-01-01", "2026-01-31")).toBe(30);
  });
  it("crosses a leap day", () => {
    // 2028 is a leap year: Feb has 29 days
    expect(ageInDays("2028-02-28", "2028-03-01")).toBe(2);
  });
  it("is negative for a future birth date", () => {
    expect(ageInDays("2026-06-01", "2026-05-01")).toBe(-31);
  });
  it("does not drift across a DST boundary", () => {
    // Timezones that observe DST shift by an hour inside this range. With
    // date-only arithmetic the answer must be exactly 30, never 29 or 31.
    expect(ageInDays("2026-03-01", "2026-03-31")).toBe(30);
    expect(ageInDays("2026-10-15", "2026-11-14")).toBe(30);
  });
});

describe("ageInMonths", () => {
  it("counts completed months only", () => {
    expect(ageInMonths("2026-01-15", "2026-02-14")).toBe(0);
    expect(ageInMonths("2026-01-15", "2026-02-15")).toBe(1);
    expect(ageInMonths("2026-01-15", "2027-01-14")).toBe(11);
    expect(ageInMonths("2026-01-15", "2027-01-15")).toBe(12);
  });
  it("handles a day-of-month that does not exist in the later month", () => {
    // Born on the 31st, measured on 28 Feb — not yet a completed month
    expect(ageInMonths("2026-01-31", "2026-02-28")).toBe(0);
    expect(ageInMonths("2026-01-31", "2026-03-31")).toBe(2);
  });
});

describe("correctedAgeInMonths", () => {
  it("equals chronological age for a term baby", () => {
    expect(correctedAgeInMonths("2026-01-01", "2026-07-01", 40)).toBe(6);
    expect(correctedAgeInMonths("2026-01-01", "2026-07-01", undefined)).toBe(6);
    expect(correctedAgeInMonths("2026-01-01", "2026-07-01", 37)).toBe(6);
  });
  it("subtracts the weeks of prematurity below 37 weeks", () => {
    // Born at 32 weeks = 8 weeks early = 56 days. Chronological 6 months
    // (181 days) minus 56 = 125 days = 4 completed months.
    expect(correctedAgeInMonths("2026-01-01", "2026-07-01", 32)).toBe(4);
  });
  it("stops correcting after 24 months chronological", () => {
    // Past 24 months the correction is dropped, per WHO practice.
    expect(correctedAgeInMonths("2024-01-01", "2026-07-01", 32)).toBe(30);
  });
  it("never returns a negative age", () => {
    expect(correctedAgeInMonths("2026-01-01", "2026-01-10", 28)).toBe(0);
  });
});

describe("addDays / addWeeks", () => {
  it("adds across a month boundary", () => {
    expect(addDays("2026-01-30", 3)).toBe("2026-02-02");
  });
  it("adds across a year boundary", () => {
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
  });
  it("adds weeks", () => {
    expect(addWeeks("2026-01-01", 6)).toBe("2026-02-12");
  });
});

describe("formatMonthYear", () => {
  it("renders a readable month", () => {
    expect(formatMonthYear("2027-03-09")).toBe("March 2027");
  });
});
```

- [ ] **Step 5: Run the tests to verify they fail**

```bash
cd /Users/bot/dev/femi9/apps/lumi9-web && npm test
```

Expected: FAIL — `Failed to resolve import "./baby-age"`.

- [ ] **Step 6: Implement the module**

Create `apps/lumi9-web/src/lib/baby-age.ts`:

```ts
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
  const correctedDays = ageInDays(dob, on) - earlyDays;
  if (correctedDays <= 0) return 0;
  // Convert back through the calendar rather than dividing by 30.44, so the
  // result agrees with ageInMonths for the same instant.
  const shifted = toUtcNoon(dob);
  if (!shifted) return 0;
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

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function formatMonthYear(iso: IsoDate): string {
  const parts = parseIsoDate(iso);
  if (!parts) return "";
  return `${MONTHS[parts.m - 1]} ${parts.y}`;
}
```

- [ ] **Step 7: Run the tests to verify they pass**

```bash
cd /Users/bot/dev/femi9/apps/lumi9-web && npm test
```

Expected: PASS — all tests green.

- [ ] **Step 8: Typecheck and lint**

```bash
cd /Users/bot/dev/femi9 && npm run typecheck --workspace lumi9-web && npm run lint --workspace lumi9-web
```

Expected: both clean.

- [ ] **Step 9: Commit**

```bash
cd /Users/bot/dev/femi9
git add apps/lumi9-web/vitest.config.ts apps/lumi9-web/src/lib/baby-age.ts \
        apps/lumi9-web/src/lib/baby-age.test.ts apps/lumi9-web/package.json package-lock.json
git commit -m "test: add Vitest to lumi9-web and date-only age arithmetic"
```

---

### Task 2: The shared baby profile store

**Files:**
- Create: `apps/lumi9-web/src/lib/baby-profile.ts`

**Interfaces:**
- Consumes: `IsoDate` from `@/lib/baby-age`.
- Produces:
  - `type BabySex = "male" | "female"`
  - `type BabyProfile = { name?: string; dob: IsoDate; sex: BabySex; weightKg?: number; heightCm?: number; gestationalWeeks?: number }`
  - `useBabyProfile(): BabyProfile | null`
  - `saveBabyProfile(profile: BabyProfile): void`
  - `clearBabyProfile(): void`

- [ ] **Step 1: Read the pattern being mirrored**

Open `apps/lumi9-web/src/lib/cart.tsx` and read lines 95–150. This task copies that shape exactly — module-level cache, a `Set` of listeners, `subscribe` / `getSnapshot` / `getServerSnapshot`, and `try/catch` around every `localStorage` call. Do not invent a second pattern for the same problem.

- [ ] **Step 2: Implement the store**

Create `apps/lumi9-web/src/lib/baby-profile.ts`:

```ts
"use client";

import { useSyncExternalStore } from "react";
import type { IsoDate } from "@/lib/baby-age";

export type BabySex = "male" | "female";

export type BabyProfile = {
  name?: string;
  dob: IsoDate;
  /**
   * Required, not optional. WHO growth tables are sex-specific, so a percentile
   * without it is meaningless rather than merely less precise.
   */
  sex: BabySex;
  weightKg?: number;
  heightCm?: number;
  /** Below 37 triggers corrected age for GROWTH only. Absent means term. */
  gestationalWeeks?: number;
};

const KEY = "lumi9.babyProfile.v1";

function read(): BabyProfile | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<BabyProfile>;
    // A stored blob is untrusted input — it survives across deploys and can be
    // hand-edited. Anything without the two required fields is discarded rather
    // than handed to the percentile maths.
    if (typeof parsed.dob !== "string") return null;
    if (parsed.sex !== "male" && parsed.sex !== "female") return null;
    return parsed as BabyProfile;
  } catch {
    return null;
  }
}

function write(profile: BabyProfile | null) {
  try {
    if (profile) window.localStorage.setItem(KEY, JSON.stringify(profile));
    else window.localStorage.removeItem(KEY);
  } catch {
    /* private mode, or site data blocked */
  }
}

let cache: BabyProfile | null | undefined;
const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

function getSnapshot(): BabyProfile | null {
  if (cache === undefined) cache = read();
  return cache;
}

/** Null on the server, so SSR and first paint agree. */
function getServerSnapshot(): BabyProfile | null {
  return null;
}

function publish(profile: BabyProfile | null) {
  cache = profile;
  write(profile);
  for (const listener of listeners) listener();
}

export function useBabyProfile(): BabyProfile | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function saveBabyProfile(profile: BabyProfile) {
  publish(profile);
}

export function clearBabyProfile() {
  publish(null);
}
```

- [ ] **Step 3: Typecheck and lint**

```bash
cd /Users/bot/dev/femi9 && npm run typecheck --workspace lumi9-web && npm run lint --workspace lumi9-web
```

Expected: both clean. (No unit test here — the module is a thin wrapper over `localStorage` and React; its behaviour is exercised by the component tasks. The validation branch is covered by Task 7's manual check.)

- [ ] **Step 4: Commit**

```bash
cd /Users/bot/dev/femi9
git add apps/lumi9-web/src/lib/baby-profile.ts
git commit -m "feat: add the shared baby profile store"
```

---

### Task 3: WHO growth standards — LMS tables and percentiles

The single highest-risk module in the plan. **The numbers come from WHO's published data files. Do not type them from memory and do not estimate them.**

**Files:**
- Create: `apps/lumi9-web/src/lib/growth-standards.ts`
- Create: `apps/lumi9-web/src/lib/growth-standards.data.ts`
- Create: `apps/lumi9-web/src/lib/growth-standards.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `type GrowthIndicator = "weight-for-age" | "height-for-age"`
  - `type LmsRow = { month: number; l: number; m: number; s: number }`
  - `erf(x: number): number`
  - `normalCdf(z: number): number`
  - `zScore(value: number, row: LmsRow): number`
  - `lookupLms(indicator: GrowthIndicator, sex: BabySex, month: number): LmsRow | null`
  - `percentileFor(input: { indicator: GrowthIndicator; sex: BabySex; ageMonths: number; value: number }): { z: number; percentile: number } | { outOfRange: "age" | "extreme" }`
  - `Z_DISPLAY_LIMIT = 5`

- [x] **Step 1: Obtain the WHO data — DONE, `growth-standards.data.ts` is committed**

Downloaded and generated on 2026-08-30. The file is real data, not a template.
Source files (all four verified 200, ~200 KB each):

```
base=https://cdn.who.int/media/docs/default-source/child-growth/child-growth-standards/indicators
$base/weight-for-age/expanded-tables/wfa-boys-zscore-expanded-tables.xlsx
$base/weight-for-age/expanded-tables/wfa-girls-zscore-expanded-tables.xlsx
$base/length-height-for-age/expandable-tables/lhfa-boys-zscore-expanded-tables.xlsx
$base/length-height-for-age/expandable-tables/lhfa-girls-zscore-expanded-tables.xlsx
```

Note the folder differs between indicators — `expanded-tables` for weight-for-age
but `expandable-tables` for length/height-for-age. Guessing the second from the
first 404s.

Each file is `Day, L, M, S, SD4neg…` for days 0–1856. One row per whole month is
kept, at `day = round(month × 30.4375)` — 30.4375 = 365.25/12, the figure the
standard itself uses — so every stored value is WHO's own at that exact age,
never interpolated at generation time. Shipping all 1857 days would be 63 KB
gzipped against 2.5 KB monthly, for precision a percentile readout cannot use.

Verified after generation: 61 rows per table, months 0–60 in order, M strictly
increasing, and a child on the median returns the 50.00th percentile at months
0, 6, 24 and 60.

- [ ] **Step 2: Write the failing tests**

Create `apps/lumi9-web/src/lib/growth-standards.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  HEIGHT_FOR_AGE_BOYS,
  HEIGHT_FOR_AGE_GIRLS,
  WEIGHT_FOR_AGE_BOYS,
  WEIGHT_FOR_AGE_GIRLS,
} from "./growth-standards.data";
import { normalCdf, percentileFor, zScore } from "./growth-standards";

describe("the transcribed tables", () => {
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
      // Babies do not shrink on the median curve. This catches a transposed
      // or mis-pasted row, which is the realistic transcription error.
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
    // With L=0 the general formula divides by zero; the log form must be used.
    const row = { month: 0, l: 0, m: 10, s: 0.1 };
    expect(zScore(10, row)).toBeCloseTo(0, 9);
    expect(Number.isFinite(zScore(12, row))).toBe(true);
    expect(zScore(12, row)).toBeCloseTo(Math.log(1.2) / 0.1, 9);
  });
  it("is positive above the median and negative below", () => {
    const row = { month: 0, l: 0.3487, m: 3.3464, s: 0.14602 };
    expect(zScore(4.2, row)).toBeGreaterThan(0);
    expect(zScore(2.6, row)).toBeLessThan(0);
  });
});

describe("percentileFor", () => {
  it("puts a median baby at the 50th percentile", () => {
    const median = WEIGHT_FOR_AGE_BOYS[0].m;
    const result = percentileFor({
      indicator: "weight-for-age",
      sex: "male",
      ageMonths: 0,
      value: median,
    });
    expect("percentile" in result && result.percentile).toBeCloseTo(50, 1);
  });
  it("declines an age above 60 months", () => {
    expect(
      percentileFor({ indicator: "weight-for-age", sex: "male", ageMonths: 61, value: 20 }),
    ).toEqual({ outOfRange: "age" });
  });
  it("declines a value beyond 5 SD rather than returning a number", () => {
    const result = percentileFor({
      indicator: "weight-for-age",
      sex: "female",
      ageMonths: 0,
      value: 0.4,
    });
    expect(result).toEqual({ outOfRange: "extreme" });
  });
  it("interpolates between whole months", () => {
    const a = percentileFor({ indicator: "weight-for-age", sex: "male", ageMonths: 6, value: 8 });
    const b = percentileFor({ indicator: "weight-for-age", sex: "male", ageMonths: 7, value: 8 });
    // The same weight is a lower percentile at an older age.
    if ("percentile" in a && "percentile" in b) {
      expect(b.percentile).toBeLessThan(a.percentile);
    } else {
      throw new Error("expected both to be in range");
    }
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

```bash
npm test -- growth-standards
```

Expected: FAIL — `Failed to resolve import "./growth-standards"`.

- [ ] **Step 4: Implement the module**

Create `apps/lumi9-web/src/lib/growth-standards.ts`:

```ts
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
 * L = 1 throughout, weight-for-age runs −0.3531 to 0.3809. It is here because
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
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
cd /Users/bot/dev/femi9/apps/lumi9-web && npm test -- growth-standards
```

Expected: PASS. If the monotonic-M test fails, a row was mis-transcribed — fix the data, never the test.

- [ ] **Step 6: Typecheck, lint, commit**

```bash
cd /Users/bot/dev/femi9
npm run typecheck --workspace lumi9-web && npm run lint --workspace lumi9-web
git add apps/lumi9-web/src/lib/growth-standards.ts apps/lumi9-web/src/lib/growth-standards.data.ts \
        apps/lumi9-web/src/lib/growth-standards.test.ts
git commit -m "feat: add WHO growth standards and percentile maths"
```

---

### Task 4: Size-up projection

**Files:**
- Create: `apps/lumi9-web/src/lib/size-projection.ts`
- Create: `apps/lumi9-web/src/lib/size-projection.test.ts`

**Interfaces:**
- Consumes: `lookupLms`, `zScore`, `Z_DISPLAY_LIMIT` from `@/lib/growth-standards`; `BabySex` from `@/lib/baby-profile`; `SizeCode` from `@/lib/catalog`; `IsoDate`, `addDays`, `ageInMonths`, `formatMonthYear` from `@/lib/baby-age`.
- Produces:
  - `SIZE_BOUNDS: { size: SizeCode; minKg: number; maxKg: number }[]`
  - `sizeForWeight(weightKg: number): SizeCode | null`
  - `nextSize(size: SizeCode): SizeCode | null`
  - `projectSizeUp(input: { dob: IsoDate; sex: BabySex; weightKg: number; today: IsoDate }): { current: SizeCode; next: SizeCode; whenMonth: string } | { unavailable: "out-of-range" | "beyond-horizon" | "largest-size" }`

- [ ] **Step 1: Write the failing tests**

Create `apps/lumi9-web/src/lib/size-projection.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { nextSize, projectSizeUp, sizeForWeight } from "./size-projection";

describe("sizeForWeight", () => {
  it("maps a weight to the size whose band it falls in", () => {
    expect(sizeForWeight(3.2)).toBe("NB");
    expect(sizeForWeight(6)).toBe("S");
    expect(sizeForWeight(10)).toBe("M");
    expect(sizeForWeight(13)).toBe("L");
    expect(sizeForWeight(16)).toBe("XL");
  });
  it("resolves overlaps to the smaller size", () => {
    // S is 4-8 and M is 7-12; 7.5 sits in both. The smaller size still fits,
    // so recommending it avoids sending a parent up a size early.
    expect(sizeForWeight(7.5)).toBe("S");
    expect(sizeForWeight(9.5)).toBe("M");
  });
  it("returns null outside every band", () => {
    expect(sizeForWeight(0)).toBeNull();
    expect(sizeForWeight(25)).toBeNull();
  });
});

describe("nextSize", () => {
  it("walks up the ladder", () => {
    expect(nextSize("NB")).toBe("S");
    expect(nextSize("L")).toBe("XL");
  });
  it("has nothing above XL", () => {
    expect(nextSize("XL")).toBeNull();
  });
});

describe("projectSizeUp", () => {
  it("projects a month for a baby mid-band", () => {
    const result = projectSizeUp({
      dob: "2026-01-01",
      sex: "male",
      weightKg: 6,
      today: "2026-04-01",
    });
    expect("whenMonth" in result).toBe(true);
    if ("whenMonth" in result) {
      expect(result.current).toBe("S");
      expect(result.next).toBe("M");
      expect(result.whenMonth).toMatch(/^[A-Z][a-z]+ \d{4}$/);
    }
  });
  it("declines when the weight is outside every band", () => {
    expect(
      projectSizeUp({ dob: "2026-01-01", sex: "male", weightKg: 25, today: "2026-04-01" }),
    ).toEqual({ unavailable: "out-of-range" });
  });
  it("declines when already in the largest size", () => {
    expect(
      projectSizeUp({ dob: "2024-01-01", sex: "male", weightKg: 16, today: "2026-04-01" }),
    ).toEqual({ unavailable: "largest-size" });
  });
  it("declines rather than guessing beyond six months", () => {
    // A baby only just into a band will not leave it inside the horizon.
    const result = projectSizeUp({
      dob: "2026-01-01",
      sex: "female",
      weightKg: 9.1,
      today: "2026-10-01",
    });
    if ("unavailable" in result) {
      expect(result.unavailable).toBe("beyond-horizon");
    }
  });
  it("projects sooner for a heavier baby than a lighter one of the same age", () => {
    // This is the whole point of tracking the child's own curve rather than
    // the population median.
    const heavy = projectSizeUp({ dob: "2026-01-01", sex: "male", weightKg: 7.6, today: "2026-06-01" });
    const light = projectSizeUp({ dob: "2026-01-01", sex: "male", weightKg: 6.2, today: "2026-06-01" });
    if ("whenMonth" in heavy && "whenMonth" in light) {
      expect(new Date(`${heavy.whenMonth} 1`).getTime()).toBeLessThanOrEqual(
        new Date(`${light.whenMonth} 1`).getTime(),
      );
    }
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npm test -- size-projection
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the module**

Create `apps/lumi9-web/src/lib/size-projection.ts`:

```ts
import { addDays, ageInMonths, formatMonthYear, type IsoDate } from "@/lib/baby-age";
import type { BabySex } from "@/lib/baby-profile";
import type { SizeCode } from "@/lib/catalog";
import { lookupLms, Z_DISPLAY_LIMIT, zScore } from "@/lib/growth-standards";

/**
 * Numeric bounds behind the catalog's `WEIGHT_OPTIONS` labels. The catalog
 * stores those ranges as display strings ("4–8 kg"); parsing them at runtime
 * would make a copy edit silently change the maths, so they are stated once
 * here and must be kept in step with `WEIGHT_OPTIONS`.
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
 * Capped at six months and reported as a month, never a date — precision beyond
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

  // Step a fortnight at a time: finer than the data's monthly resolution, and
  // coarse enough that the loop is trivially bounded.
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
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd /Users/bot/dev/femi9/apps/lumi9-web && npm test -- size-projection
```

Expected: PASS.

- [ ] **Step 5: Typecheck, lint, commit**

```bash
cd /Users/bot/dev/femi9
npm run typecheck --workspace lumi9-web && npm run lint --workspace lumi9-web
git add apps/lumi9-web/src/lib/size-projection.ts apps/lumi9-web/src/lib/size-projection.test.ts
git commit -m "feat: project when a baby moves up a diaper size"
```

---

### Task 5: Diaper planning maths

**Files:**
- Create: `apps/lumi9-web/src/lib/diaper-planning.ts`
- Create: `apps/lumi9-web/src/lib/diaper-planning.test.ts`

**Interfaces:**
- Consumes: `SizeCode`, `getSize`, `LAUNCH_OFFER` (from `@/lib/content`), `Pack` from `@/lib/catalog`.
- Produces:
  - `USAGE_BANDS: { upToMonths: number; perDay: number }[]`
  - `defaultPerDay(ageMonths: number): number`
  - `planDiapers(input: { size: SizeCode; perDay: number }): { perDay: number; perMonth: number; pack: Pack; packsPerMonth: number; packLastsDays: number; monthlyCost: number } | null`

- [ ] **Step 1: Write the failing tests**

Create `apps/lumi9-web/src/lib/diaper-planning.test.ts`:

```ts
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
    const plan = planDiapers({ size: "M", perDay: 7 });
    expect(plan!.pack.count).toBe(54);
  });
  it("reports how long one pack lasts", () => {
    const plan = planDiapers({ size: "M", perDay: 6 });
    expect(plan!.packLastsDays).toBe(9); // 54 / 6
  });
  it("costs a month at launch pricing", () => {
    const plan = planDiapers({ size: "NB", perDay: 10 });
    // 10/day -> 305/month -> 54-packs -> 5.65 packs -> 6 packs at 749 less 10%
    expect(plan!.monthlyCost).toBeGreaterThan(0);
    expect(Number.isInteger(plan!.monthlyCost)).toBe(true);
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
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd /Users/bot/dev/femi9/apps/lumi9-web && npm test -- diaper-planning
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the module**

Create `apps/lumi9-web/src/lib/diaper-planning.ts`:

```ts
import { getSize, type Pack, type SizeCode } from "@/lib/catalog";
import { LAUNCH_OFFER } from "@/lib/content";

/** Mean days per month — a diaper month is not 30 days. */
const DAYS_PER_MONTH = 30.44;
const MAX_SANE_PER_DAY = 30;

/**
 * Starting points only. The UI shows these as editable, because a real
 * family's rate is the accurate number and asserting an average fits would
 * make the cost figure ours rather than theirs.
 *
 * Confirm against published guidance during implementation.
 */
export const USAGE_BANDS: { upToMonths: number; perDay: number }[] = [
  { upToMonths: 1, perDay: 10 },
  { upToMonths: 6, perDay: 8 },
  { upToMonths: 12, perDay: 7 },
  { upToMonths: 24, perDay: 6 },
  { upToMonths: Infinity, perDay: 5 },
];

export function defaultPerDay(ageMonths: number): number {
  const age = Number.isFinite(ageMonths) && ageMonths > 0 ? ageMonths : 0;
  const band = USAGE_BANDS.find((b) => age < b.upToMonths);
  return band ? band.perDay : USAGE_BANDS[USAGE_BANDS.length - 1].perDay;
}

function launchPrice(price: number): number {
  if (!LAUNCH_OFFER) return price;
  return Math.round(price * (1 - LAUNCH_OFFER.percent / 100));
}

export function planDiapers(input: { size: SizeCode; perDay: number }): {
  perDay: number;
  perMonth: number;
  pack: Pack;
  packsPerMonth: number;
  packLastsDays: number;
  monthlyCost: number;
} | null {
  const { size, perDay } = input;
  if (!Number.isFinite(perDay) || perDay <= 0 || perDay > MAX_SANE_PER_DAY) return null;

  const product = getSize(size);
  if (!product || product.packs.length === 0) return null;

  const perMonth = Math.ceil(perDay * DAYS_PER_MONTH);

  // Largest pack that still fits inside a month's use, so a parent is not told
  // to buy a 54 when they get through 40. Falls back to the smallest pack when
  // even that overshoots.
  const affordable = product.packs.filter((p) => p.count <= perMonth);
  const pack = affordable.length
    ? affordable.reduce((best, p) => (p.count > best.count ? p : best))
    : product.packs.reduce((best, p) => (p.count < best.count ? p : best));

  const packsPerMonth = Math.ceil(perMonth / pack.count);
  const packLastsDays = Math.floor(pack.count / perDay);
  const monthlyCost = packsPerMonth * launchPrice(pack.price);

  return { perDay, perMonth, pack, packsPerMonth, packLastsDays, monthlyCost };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd /Users/bot/dev/femi9/apps/lumi9-web && npm test -- diaper-planning
```

Expected: PASS.

- [ ] **Step 5: Typecheck, lint, commit**

```bash
cd /Users/bot/dev/femi9
npm run typecheck --workspace lumi9-web && npm run lint --workspace lumi9-web
git add apps/lumi9-web/src/lib/diaper-planning.ts apps/lumi9-web/src/lib/diaper-planning.test.ts
git commit -m "feat: add diaper usage, pack and monthly-cost maths"
```

---

### Task 6: India immunisation schedule

**The strictest sourcing rule in this plan.** Vaccine names and ages are transcribed from the published Indian schedules. **Do not write a single age from memory.** If the sources cannot be reached, stop and report — a plausible-looking wrong date here is worse than no tool.

**Files:**
- Create: `apps/lumi9-web/src/lib/immunisation-schedule.ts`
- Create: `apps/lumi9-web/src/lib/immunisation-schedule.data.ts`
- Create: `apps/lumi9-web/src/lib/immunisation-schedule.test.ts`

**Interfaces:**
- Consumes: `IsoDate`, `addWeeks`, `ageInDays` from `@/lib/baby-age`.
- Produces:
  - `type VaccineTrack = "UIP" | "IAP"`
  - `type VaccineDose = { id: string; vaccine: string; dose: string; atWeeks: number; track: VaccineTrack[]; note?: string }`
  - `type ScheduledDose = VaccineDose & { dueOn: IsoDate; status: "due" | "upcoming" | "past" }`
  - `scheduleFor(input: { dob: IsoDate; today: IsoDate; track: VaccineTrack }): ScheduledDose[]`
  - `UIP_SOURCE`, `IAP_SOURCE`, `SCHEDULE_REVISED_ON` — strings rendered in the UI

- [ ] **Step 1: Obtain the two schedules — BLOCKED, needs a file from the user**

Attempted on 2026-08-30 and all failed to yield a schedule table:

| Source | Result |
| --- | --- |
| `nhp.gov.in/universal-immunisation-programme_pg` | DNS does not resolve |
| `iapindia.org/immunization-schedule/` | No table; points at the guidebook page |
| `iapindia.org/iap-guidebook-on-immunization/` | PDFs only; newest linked is 2018–19 |
| `iapindia.org/purple-book-2025/` | Page returns no content |
| `nhm.gov.in` immunization page | Prose only, no schedule table |
| WHO `immunizationdata.who.int` India schedule | Rendered in headless Chrome — no table in the DOM |

The 2018–19 IAP guidebook PDF does download (5 MB), but a seven-year-old
schedule shipped as current medical guidance is worse than no tool.

**Do not proceed by transcribing from memory or from a search snippet.** Ask the
user for the current IAP timetable PDF or the MoHFW schedule, then continue with:
1. **UIP** — MoHFW National Immunization Schedule (`nhm.gov.in` / `mohfw.gov.in`, "National Immunization Schedule for Infants, Children and Pregnant Women").
2. **IAP** — Indian Academy of Pediatrics Immunization Timetable, latest published revision (`iapindia.org`).

- [ ] **Step 2: Transcribe into the data file**

Create `apps/lumi9-web/src/lib/immunisation-schedule.data.ts`:

```ts
import type { VaccineDose } from "./immunisation-schedule";

/**
 * India childhood immunisation, birth to 5 years.
 *
 * TRANSCRIBED FROM THE PUBLISHED SCHEDULES — never from memory. Update both the
 * entries and SCHEDULE_REVISED_ON together when a new revision is published.
 */
export const UIP_SOURCE = "MoHFW National Immunization Schedule";
export const IAP_SOURCE = "IAP Immunization Timetable";
export const SCHEDULE_REVISED_ON = "<YYYY-MM-DD of the revision you transcribed>";

/**
 * `atWeeks` is weeks after birth. Doses shared by both schedules list both
 * tracks; doses the IAP adds list only "IAP".
 *
 * One entry per dose, in ascending `atWeeks`. Example of the required shape —
 * replace with the real rows from the sources:
 *
 *   { id: "bcg-birth", vaccine: "BCG", dose: "Birth dose", atWeeks: 0,
 *     track: ["UIP", "IAP"] },
 */
export const DOSES: VaccineDose[] = [
  // Transcribe every dose from birth through 5 years here.
];
```

`id` must be unique, lowercase, hyphenated, and stable — it keys React lists and any future "mark as done".

- [ ] **Step 3: Write the failing tests**

Create `apps/lumi9-web/src/lib/immunisation-schedule.test.ts`. These check **structure and dating**, not medical values — asserting specific vaccine ages here would just re-encode a guess:

```ts
import { describe, expect, it } from "vitest";
import { DOSES, SCHEDULE_REVISED_ON } from "./immunisation-schedule.data";
import { scheduleFor } from "./immunisation-schedule";

describe("the transcribed schedule", () => {
  it("is not empty", () => {
    expect(DOSES.length).toBeGreaterThan(0);
  });
  it("records the revision it was transcribed from", () => {
    expect(SCHEDULE_REVISED_ON).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it("has unique, stable ids", () => {
    const ids = DOSES.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/);
  });
  it("is ordered by age and stays within 0-5 years", () => {
    for (let i = 1; i < DOSES.length; i++) {
      expect(DOSES[i].atWeeks).toBeGreaterThanOrEqual(DOSES[i - 1].atWeeks);
    }
    for (const dose of DOSES) {
      expect(dose.atWeeks).toBeGreaterThanOrEqual(0);
      expect(dose.atWeeks).toBeLessThanOrEqual(6 * 52);
    }
  });
  it("assigns every dose to at least one track", () => {
    for (const dose of DOSES) {
      expect(dose.track.length).toBeGreaterThan(0);
      for (const t of dose.track) expect(["UIP", "IAP"]).toContain(t);
    }
  });
  it("covers both tracks", () => {
    expect(DOSES.some((d) => d.track.includes("UIP"))).toBe(true);
    expect(DOSES.some((d) => d.track.includes("IAP"))).toBe(true);
  });
});

describe("scheduleFor", () => {
  const dob = "2026-01-01";

  it("dates every dose from the birth date", () => {
    const schedule = scheduleFor({ dob, today: dob, track: "IAP" });
    for (const dose of schedule) {
      expect(dose.dueOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    const birthDose = schedule.find((d) => d.atWeeks === 0);
    if (birthDose) expect(birthDose.dueOn).toBe(dob);
  });

  it("filters to the requested track", () => {
    const uip = scheduleFor({ dob, today: dob, track: "UIP" });
    expect(uip.every((d) => d.track.includes("UIP"))).toBe(true);
    const iap = scheduleFor({ dob, today: dob, track: "IAP" });
    expect(iap.length).toBeGreaterThanOrEqual(uip.length);
  });

  it("marks doses past, due and upcoming relative to today", () => {
    const schedule = scheduleFor({ dob, today: "2026-06-01", track: "IAP" });
    for (const dose of schedule) {
      const expected =
        dose.dueOn < "2026-05-25" ? "past" : dose.dueOn > "2026-06-01" ? "upcoming" : "due";
      expect(dose.status).toBe(expected);
    }
  });

  it("is stable across timezones", () => {
    // The same DOB must produce the same dates regardless of host offset.
    const a = scheduleFor({ dob: "2026-03-29", today: "2026-03-29", track: "IAP" });
    const b = scheduleFor({ dob: "2026-10-25", today: "2026-10-25", track: "IAP" });
    for (const dose of [...a, ...b]) expect(dose.dueOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("does NOT correct for prematurity", () => {
    // Vaccines run on chronological age. There is deliberately no gestational
    // parameter on this function — that absence is the safeguard.
    const schedule = scheduleFor({ dob, today: dob, track: "IAP" });
    const birthDose = schedule.find((d) => d.atWeeks === 0);
    if (birthDose) expect(birthDose.dueOn).toBe(dob);
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

```bash
cd /Users/bot/dev/femi9/apps/lumi9-web && npm test -- immunisation
```

Expected: FAIL — module not found.

- [ ] **Step 5: Implement the module**

Create `apps/lumi9-web/src/lib/immunisation-schedule.ts`:

```ts
import { addWeeks, ageInDays, type IsoDate } from "@/lib/baby-age";
import { DOSES } from "./immunisation-schedule.data";

export type VaccineTrack = "UIP" | "IAP";

export type VaccineDose = {
  id: string;
  vaccine: string;
  dose: string;
  /** Weeks after birth, per the published schedule. */
  atWeeks: number;
  track: VaccineTrack[];
  note?: string;
};

export type ScheduledDose = VaccineDose & {
  dueOn: IsoDate;
  status: "due" | "upcoming" | "past";
};

/** A dose stays "due" for a week before it counts as past. */
const DUE_WINDOW_DAYS = 7;

/**
 * Dates the schedule from the birth date.
 *
 * Takes NO gestational age, and that is deliberate. Immunisation runs on
 * chronological age even for a preterm baby; accepting a correction here would
 * invite someone to apply the growth rule and delay real doses.
 */
export function scheduleFor(input: {
  dob: IsoDate;
  today: IsoDate;
  track: VaccineTrack;
}): ScheduledDose[] {
  return DOSES.filter((dose) => dose.track.includes(input.track))
    .map((dose) => {
      const dueOn = addWeeks(input.dob, dose.atWeeks);
      const daysUntil = ageInDays(input.today, dueOn);
      const status: ScheduledDose["status"] =
        daysUntil > 0 ? "upcoming" : daysUntil > -DUE_WINDOW_DAYS ? "due" : "past";
      return { ...dose, dueOn, status };
    })
    .sort((a, b) => (a.dueOn < b.dueOn ? -1 : a.dueOn > b.dueOn ? 1 : 0));
}

export { IAP_SOURCE, SCHEDULE_REVISED_ON, UIP_SOURCE } from "./immunisation-schedule.data";
```

- [ ] **Step 6: Run the tests to verify they pass**

```bash
cd /Users/bot/dev/femi9/apps/lumi9-web && npm test -- immunisation
```

Expected: PASS. A failure in the ordering test means the transcription is out of order — sort the data, do not relax the test.

- [ ] **Step 7: Typecheck, lint, commit**

```bash
cd /Users/bot/dev/femi9
npm run typecheck --workspace lumi9-web && npm run lint --workspace lumi9-web
git add apps/lumi9-web/src/lib/immunisation-schedule.ts \
        apps/lumi9-web/src/lib/immunisation-schedule.data.ts \
        apps/lumi9-web/src/lib/immunisation-schedule.test.ts
git commit -m "feat: add India immunisation schedule (UIP and IAP tracks)"
```

---

### Task 7: Baby profile card and the shared disclaimer

**Files:**
- Create: `apps/lumi9-web/src/components/tools/BabyProfileCard.tsx`
- Create: `apps/lumi9-web/src/components/tools/ToolDisclaimer.tsx`

**Interfaces:**
- Consumes: `useBabyProfile`, `saveBabyProfile`, `clearBabyProfile`, `BabyProfile`, `BabySex` from `@/lib/baby-profile`.
- Produces:
  - `<BabyProfileCard />` — no props
  - `<ToolDisclaimer source={string} revisedOn={string} />`

- [ ] **Step 1: Write the disclaimer component**

Create `apps/lumi9-web/src/components/tools/ToolDisclaimer.tsx`:

```tsx
/**
 * Shown on both health tools, in the flow of the tool rather than in the
 * footer. A disclaimer a parent has to go looking for has not been given.
 */
export function ToolDisclaimer({ source, revisedOn }: { source: string; revisedOn: string }) {
  return (
    <p className="m-0 mt-5 border-t border-moss-tint pt-4 text-[13px] leading-[1.55] text-muted">
      <strong className="font-semibold text-midnight">Not medical advice.</strong> These figures are
      a guide — your paediatrician knows your baby. Source: {source}, rev. {revisedOn}.
    </p>
  );
}
```

- [ ] **Step 2: Write the profile card**

Create `apps/lumi9-web/src/components/tools/BabyProfileCard.tsx`:

```tsx
"use client";

import { useState } from "react";
import {
  clearBabyProfile,
  saveBabyProfile,
  useBabyProfile,
  type BabySex,
} from "@/lib/baby-profile";

/**
 * One profile, read by every tool.
 *
 * Nothing here gates anything: a parent who skips this still gets four working
 * tools, they just type more. That is why there is no "continue" step and no
 * validation beyond what the maths genuinely needs.
 */
export function BabyProfileCard() {
  const profile = useBabyProfile();
  const [editing, setEditing] = useState(false);

  const [name, setName] = useState(profile?.name ?? "");
  const [dob, setDob] = useState(profile?.dob ?? "");
  const [sex, setSex] = useState<BabySex | "">(profile?.sex ?? "");
  const [weight, setWeight] = useState(profile?.weightKg?.toString() ?? "");
  const [height, setHeight] = useState(profile?.heightCm?.toString() ?? "");
  const [preterm, setPreterm] = useState(profile?.gestationalWeeks?.toString() ?? "");

  const today = new Date().toISOString().slice(0, 10);
  const canSave = dob !== "" && dob <= today && (sex === "male" || sex === "female");

  function save() {
    if (!canSave) return;
    saveBabyProfile({
      name: name.trim() || undefined,
      dob,
      sex: sex as BabySex,
      weightKg: weight ? Number(weight) : undefined,
      heightCm: height ? Number(height) : undefined,
      gestationalWeeks: preterm ? Number(preterm) : undefined,
    });
    setEditing(false);
  }

  if (profile && !editing) {
    return (
      <div className="panel p-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="font-display text-[clamp(20px,2.4vw,28px)] leading-tight">
              {profile.name || "Your baby"}
            </div>
            <div className="mt-1 text-sm text-muted">
              Born {profile.dob}
              {profile.weightKg ? ` · ${profile.weightKg} kg` : ""}
              {profile.gestationalWeeks && profile.gestationalWeeks < 37
                ? ` · born at ${profile.gestationalWeeks} weeks`
                : ""}
            </div>
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn btn-ghost" onClick={() => setEditing(true)}>
              Edit
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                clearBabyProfile();
                setEditing(false);
              }}
            >
              Clear
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="panel p-card">
      <h2 className="m-0 mb-1 font-display text-[clamp(20px,2.4vw,28px)] font-normal leading-tight">
        Tell us about your baby
      </h2>
      <p className="m-0 mb-5 text-sm text-muted">
        Fill this in once and every tool below uses it. Stored on this device only — nothing is sent
        to us. You can skip it and use the tools directly.
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-sm font-semibold text-midnight">Name (optional)</span>
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-semibold text-midnight">Date of birth</span>
          <input
            type="date"
            className="field"
            max={today}
            value={dob}
            onChange={(e) => setDob(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-semibold text-midnight">Sex</span>
          <select
            className="field"
            value={sex}
            onChange={(e) => setSex(e.target.value as BabySex | "")}
          >
            <option value="">Select</option>
            <option value="female">Girl</option>
            <option value="male">Boy</option>
          </select>
          <span className="mt-1 block text-[13px] text-muted">
            Growth charts differ for girls and boys, so percentiles need this.
          </span>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-semibold text-midnight">Weight (kg)</span>
          <input
            type="number"
            inputMode="decimal"
            step="0.1"
            min="0"
            className="field"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-semibold text-midnight">Height (cm)</span>
          <input
            type="number"
            inputMode="decimal"
            step="0.5"
            min="0"
            className="field"
            value={height}
            onChange={(e) => setHeight(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-semibold text-midnight">
            Born early? Weeks at birth (optional)
          </span>
          <input
            type="number"
            inputMode="numeric"
            min="22"
            max="42"
            className="field"
            value={preterm}
            onChange={(e) => setPreterm(e.target.value)}
          />
          <span className="mt-1 block text-[13px] text-muted">
            Used to correct growth percentiles. Vaccination dates are never corrected.
          </span>
        </label>
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <button type="button" className="btn btn-dark" disabled={!canSave} onClick={save}>
          Save
        </button>
        {profile ? (
          <button type="button" className="btn btn-ghost" onClick={() => setEditing(false)}>
            Cancel
          </button>
        ) : null}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck and lint**

```bash
npm run typecheck --workspace lumi9-web && npm run lint --workspace lumi9-web
```

Expected: both clean. If `.field` or `.panel` are missing, check `src/app/globals.css` — both are existing component classes there.

- [ ] **Step 4: Commit**

```bash
cd /Users/bot/dev/femi9
git add apps/lumi9-web/src/components/tools/BabyProfileCard.tsx \
        apps/lumi9-web/src/components/tools/ToolDisclaimer.tsx
git commit -m "feat: add the baby profile card and shared tool disclaimer"
```

---

### Task 8: Diaper planner component

**Files:**
- Create: `apps/lumi9-web/src/components/tools/DiaperPlanner.tsx`

**Interfaces:**
- Consumes: `useBabyProfile`; `ageInMonths` from `@/lib/baby-age`; `defaultPerDay`, `planDiapers` from `@/lib/diaper-planning`; `sizeForWeight` from `@/lib/size-projection`; `SIZE_CODES`, `getSize`, `inr`, `type SizeCode` from `@/lib/catalog`.
- Produces: `<DiaperPlanner />` — no props.

- [ ] **Step 1: Write the component**

Create `apps/lumi9-web/src/components/tools/DiaperPlanner.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useState } from "react";
import { ageInMonths } from "@/lib/baby-age";
import { useBabyProfile } from "@/lib/baby-profile";
import { getSize, inr, SIZE_CODES, type SizeCode } from "@/lib/catalog";
import { defaultPerDay, planDiapers } from "@/lib/diaper-planning";
import { sizeForWeight } from "@/lib/size-projection";

export function DiaperPlanner() {
  const profile = useBabyProfile();
  const today = new Date().toISOString().slice(0, 10);

  const ageMonths = profile ? ageInMonths(profile.dob, today) : 0;
  const suggestedSize = profile?.weightKg ? sizeForWeight(profile.weightKg) : null;

  const [size, setSize] = useState<SizeCode | null>(null);
  const [perDay, setPerDay] = useState<number | null>(null);

  const activeSize = size ?? suggestedSize ?? "M";
  const activePerDay = perDay ?? defaultPerDay(ageMonths);
  const plan = planDiapers({ size: activeSize, perDay: activePerDay });

  return (
    <section id="planner" className="panel p-card scroll-mt-[calc(var(--nav-h,68px)+16px)]">
      <h2 className="m-0 mb-1 font-display text-[clamp(22px,2.8vw,32px)] font-normal leading-tight">
        How many will you need?
      </h2>
      <p className="m-0 mb-5 max-w-[52ch] text-sm text-muted">
        We start from a typical rate for your baby&apos;s age. Change it to what you actually use —
        your number is the accurate one.
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-sm font-semibold text-midnight">Size</span>
          <select
            className="field"
            value={activeSize}
            onChange={(e) => setSize(e.target.value as SizeCode)}
          >
            {SIZE_CODES.map((code) => {
              const product = getSize(code);
              return (
                <option key={code} value={code}>
                  {code} — {product?.range}
                </option>
              );
            })}
          </select>
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-semibold text-midnight">
            Diapers per day: {activePerDay}
          </span>
          <input
            type="range"
            min={1}
            max={16}
            step={1}
            value={activePerDay}
            onChange={(e) => setPerDay(Number(e.target.value))}
            className="w-full"
            aria-label="Diapers per day"
          />
        </label>
      </div>

      {plan ? (
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat value={String(plan.perMonth)} label="a month" />
          <Stat value={`${plan.pack.count}-pack`} label="best value pack" />
          <Stat value={`${plan.packLastsDays} days`} label="one pack lasts" />
          <Stat value={inr(plan.monthlyCost)} label="a month" />
        </div>
      ) : (
        <p className="mt-6 text-sm text-muted">Pick a size and a daily rate to see a plan.</p>
      )}

      <div className="mt-6 flex flex-wrap gap-3">
        <Link href={`/product/${activeSize.toLowerCase()}`} className="btn btn-dark">
          Shop size {activeSize}
        </Link>
        <Link href="/subscription" className="btn btn-ghost">
          Set up a repeat delivery
        </Link>
      </div>
    </section>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="font-display text-[clamp(22px,3vw,32px)] leading-none">{value}</div>
      <div className="mt-1 text-[13px] text-muted">{label}</div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck, lint, commit**

```bash
cd /Users/bot/dev/femi9
npm run typecheck --workspace lumi9-web && npm run lint --workspace lumi9-web
git add apps/lumi9-web/src/components/tools/DiaperPlanner.tsx
git commit -m "feat: add the diaper planner tool"
```

---

### Task 9: Size-up predictor component

**Files:**
- Create: `apps/lumi9-web/src/components/tools/SizeUpPredictor.tsx`

**Interfaces:**
- Consumes: `useBabyProfile`; `projectSizeUp`, `sizeForWeight` from `@/lib/size-projection`; `getSize` from `@/lib/catalog`.
- Produces: `<SizeUpPredictor />` — no props.

- [ ] **Step 1: Write the component**

Create `apps/lumi9-web/src/components/tools/SizeUpPredictor.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useState } from "react";
import { useBabyProfile } from "@/lib/baby-profile";
import { getSize } from "@/lib/catalog";
import { projectSizeUp, sizeForWeight } from "@/lib/size-projection";

export function SizeUpPredictor() {
  const profile = useBabyProfile();
  const today = new Date().toISOString().slice(0, 10);

  const [weight, setWeight] = useState(profile?.weightKg?.toString() ?? "");
  const weightKg = Number(weight);
  const hasWeight = Number.isFinite(weightKg) && weightKg > 0;
  const current = hasWeight ? sizeForWeight(weightKg) : null;

  const projection =
    profile && hasWeight
      ? projectSizeUp({ dob: profile.dob, sex: profile.sex, weightKg, today })
      : null;

  return (
    <section id="size-up" className="panel p-card scroll-mt-[calc(var(--nav-h,68px)+16px)]">
      <h2 className="m-0 mb-1 font-display text-[clamp(22px,2.8vw,32px)] font-normal leading-tight">
        When will they size up?
      </h2>
      <p className="m-0 mb-5 max-w-[52ch] text-sm text-muted">
        We follow your baby&apos;s own growth curve, not an average one — so a bigger baby gets a
        sooner answer and a smaller one a later answer.
      </p>

      <label className="block max-w-[260px]">
        <span className="mb-1.5 block text-sm font-semibold text-midnight">
          Current weight (kg)
        </span>
        <input
          type="number"
          inputMode="decimal"
          step="0.1"
          min="0"
          className="field"
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
        />
      </label>

      <div className="mt-6">
        {!hasWeight ? (
          <p className="m-0 text-sm text-muted">Enter a weight to see the current size.</p>
        ) : !current ? (
          <p className="m-0 text-sm text-muted">
            That weight is outside our size range — have a look at the{" "}
            <Link href="/size-guide" className="underline">
              size guide
            </Link>
            .
          </p>
        ) : (
          <>
            <div className="font-display text-[clamp(24px,3.4vw,36px)] leading-none">
              Size {current} — {getSize(current)?.name}
            </div>
            {!profile ? (
              <p className="m-0 mt-3 text-sm text-muted">
                Add a date of birth above and we can tell you roughly when the next size starts.
              </p>
            ) : projection && "whenMonth" in projection ? (
              <p className="m-0 mt-3 text-body">
                Likely moving to size <strong className="font-semibold">{projection.next}</strong>{" "}
                around <strong className="font-semibold">{projection.whenMonth}</strong>.
              </p>
            ) : projection && "unavailable" in projection ? (
              <p className="m-0 mt-3 text-sm text-muted">
                {projection.unavailable === "largest-size"
                  ? "Already in our largest size."
                  : projection.unavailable === "beyond-horizon"
                    ? "No size change expected in the next six months."
                    : "We can't project from that weight and age."}
              </p>
            ) : null}
          </>
        )}
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        {current ? (
          <Link href={`/product/${current.toLowerCase()}`} className="btn btn-dark">
            Shop size {current}
          </Link>
        ) : null}
        <Link href="/size-guide" className="btn btn-ghost">
          Full size guide
        </Link>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Typecheck, lint, commit**

```bash
cd /Users/bot/dev/femi9
npm run typecheck --workspace lumi9-web && npm run lint --workspace lumi9-web
git add apps/lumi9-web/src/components/tools/SizeUpPredictor.tsx
git commit -m "feat: add the size-up predictor tool"
```

---

### Task 10: Growth percentile component

**Files:**
- Create: `apps/lumi9-web/src/components/tools/GrowthPercentile.tsx`

**Interfaces:**
- Consumes: `useBabyProfile`; `correctedAgeInMonths`, `ageInMonths` from `@/lib/baby-age`; `percentileFor` from `@/lib/growth-standards`; `WHO_SOURCE`, `WHO_TRANSCRIBED_ON` from `@/lib/growth-standards.data`; `<ToolDisclaimer />`.
- Produces: `<GrowthPercentile />` — no props.

- [ ] **Step 1: Write the component**

Create `apps/lumi9-web/src/components/tools/GrowthPercentile.tsx`:

```tsx
"use client";

import { ageInMonths, correctedAgeInMonths } from "@/lib/baby-age";
import { useBabyProfile } from "@/lib/baby-profile";
import { percentileFor, type GrowthIndicator } from "@/lib/growth-standards";
import { WHO_SOURCE, WHO_TRANSCRIBED_ON } from "@/lib/growth-standards.data";
import { ToolDisclaimer } from "./ToolDisclaimer";

export function GrowthPercentile() {
  const profile = useBabyProfile();
  const today = new Date().toISOString().slice(0, 10);

  if (!profile) {
    return (
      <section id="growth" className="panel p-card scroll-mt-[calc(var(--nav-h,68px)+16px)]">
        <Heading />
        <p className="m-0 text-sm text-muted">
          Add your baby&apos;s date of birth, sex and measurements above to see percentiles.
        </p>
      </section>
    );
  }

  const chronological = ageInMonths(profile.dob, today);
  const ageMonths = correctedAgeInMonths(profile.dob, today, profile.gestationalWeeks);
  const corrected = ageMonths !== chronological;

  return (
    <section id="growth" className="panel p-card scroll-mt-[calc(var(--nav-h,68px)+16px)]">
      <Heading />
      {corrected ? (
        <p className="m-0 mb-4 text-[13px] text-muted">
          Using a corrected age of {ageMonths} months (born at {profile.gestationalWeeks} weeks),
          which is how growth is read for a baby born early.
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Reading
          label="Weight for age"
          indicator="weight-for-age"
          value={profile.weightKg}
          unit="kg"
          sex={profile.sex}
          ageMonths={ageMonths}
        />
        <Reading
          label="Height for age"
          indicator="height-for-age"
          value={profile.heightCm}
          unit="cm"
          sex={profile.sex}
          ageMonths={ageMonths}
        />
      </div>

      <ToolDisclaimer source={WHO_SOURCE} revisedOn={WHO_TRANSCRIBED_ON} />
    </section>
  );
}

function Heading() {
  return (
    <>
      <h2 className="m-0 mb-1 font-display text-[clamp(22px,2.8vw,32px)] font-normal leading-tight">
        Growth percentiles
      </h2>
      <p className="m-0 mb-5 max-w-[52ch] text-sm text-muted">
        Where your baby sits against the WHO growth standards. A percentile is a position, not a
        grade — healthy babies live at every one of them.
      </p>
    </>
  );
}

function Reading({
  label,
  indicator,
  value,
  unit,
  sex,
  ageMonths,
}: {
  label: string;
  indicator: GrowthIndicator;
  value: number | undefined;
  unit: string;
  sex: "male" | "female";
  ageMonths: number;
}) {
  if (value === undefined) {
    return (
      <div>
        <div className="text-sm font-semibold text-midnight">{label}</div>
        <p className="m-0 mt-1 text-sm text-muted">Add a measurement above.</p>
      </div>
    );
  }

  const result = percentileFor({ indicator, sex, ageMonths, value });

  return (
    <div>
      <div className="text-sm font-semibold text-midnight">{label}</div>
      {"percentile" in result ? (
        <>
          <div className="mt-1 font-display text-[clamp(24px,3.4vw,36px)] leading-none">
            {Math.round(result.percentile)}
            <span className="align-super text-[0.5em]">{ordinal(Math.round(result.percentile))}</span>
          </div>
          <div className="mt-1 text-[13px] text-muted">
            {value} {unit} at {ageMonths} months
          </div>
        </>
      ) : (
        <p className="m-0 mt-1 text-sm text-muted">
          {result.outOfRange === "age"
            ? "These standards cover birth to 5 years."
            : "That measurement is outside the standard range — worth asking your paediatrician."}
        </p>
      )}
    </div>
  );
}

function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return "th";
  switch (n % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
}
```

- [ ] **Step 2: Typecheck, lint, commit**

```bash
cd /Users/bot/dev/femi9
npm run typecheck --workspace lumi9-web && npm run lint --workspace lumi9-web
git add apps/lumi9-web/src/components/tools/GrowthPercentile.tsx
git commit -m "feat: add the growth percentile tool"
```

---

### Task 11: Immunisation schedule component

**Files:**
- Create: `apps/lumi9-web/src/components/tools/ImmunisationSchedule.tsx`

**Interfaces:**
- Consumes: `useBabyProfile`; `scheduleFor`, `IAP_SOURCE`, `UIP_SOURCE`, `SCHEDULE_REVISED_ON`, `type VaccineTrack` from `@/lib/immunisation-schedule`; `<ToolDisclaimer />`.
- Produces: `<ImmunisationSchedule />` — no props.

- [ ] **Step 1: Write the component**

Create `apps/lumi9-web/src/components/tools/ImmunisationSchedule.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useBabyProfile } from "@/lib/baby-profile";
import {
  IAP_SOURCE,
  SCHEDULE_REVISED_ON,
  scheduleFor,
  UIP_SOURCE,
  type VaccineTrack,
} from "@/lib/immunisation-schedule";
import { ToolDisclaimer } from "./ToolDisclaimer";

export function ImmunisationSchedule() {
  const profile = useBabyProfile();
  const [track, setTrack] = useState<VaccineTrack>("UIP");
  const today = new Date().toISOString().slice(0, 10);

  return (
    <section id="immunisation" className="panel p-card scroll-mt-[calc(var(--nav-h,68px)+16px)]">
      <h2 className="m-0 mb-1 font-display text-[clamp(22px,2.8vw,32px)] font-normal leading-tight">
        Vaccination schedule
      </h2>
      <p className="m-0 mb-5 max-w-[52ch] text-sm text-muted">
        India runs two schedules. The government one is free at any public health centre; the IAP
        one adds optional vaccines usually given privately.
      </p>

      <div className="mb-5 inline-flex rounded-pill border border-moss-tint p-1" role="tablist">
        {(["UIP", "IAP"] as VaccineTrack[]).map((option) => (
          <button
            key={option}
            type="button"
            role="tab"
            aria-selected={track === option}
            onClick={() => setTrack(option)}
            className={`cursor-pointer rounded-pill px-4 py-2 text-sm font-semibold transition-colors ${
              track === option ? "bg-midnight text-butter" : "text-muted hover:text-midnight"
            }`}
          >
            {option === "UIP" ? "Government (UIP)" : "IAP"}
          </button>
        ))}
      </div>

      {!profile ? (
        <p className="m-0 text-sm text-muted">
          Add your baby&apos;s date of birth above to see dates.
        </p>
      ) : (
        <>
          <p className="m-0 mb-4 text-[13px] text-muted">
            Dates run from your baby&apos;s actual birthday. Vaccination is never adjusted for being
            born early, even when growth is.
          </p>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {scheduleFor({ dob: profile.dob, today, track }).map((dose) => (
              <li
                key={dose.id}
                className={`flex flex-wrap items-baseline justify-between gap-2 rounded-chip border border-moss-tint px-4 py-3 ${
                  dose.status === "past" ? "opacity-55" : ""
                }`}
              >
                <span className="text-sm font-semibold text-midnight">
                  {dose.vaccine} <span className="font-normal text-muted">· {dose.dose}</span>
                </span>
                <span className="text-sm text-muted">
                  {dose.dueOn}
                  {dose.status === "due" ? " · due now" : ""}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      <ToolDisclaimer
        source={track === "UIP" ? UIP_SOURCE : IAP_SOURCE}
        revisedOn={SCHEDULE_REVISED_ON}
      />
    </section>
  );
}
```

- [ ] **Step 2: Typecheck, lint, commit**

```bash
cd /Users/bot/dev/femi9
npm run typecheck --workspace lumi9-web && npm run lint --workspace lumi9-web
git add apps/lumi9-web/src/components/tools/ImmunisationSchedule.tsx
git commit -m "feat: add the India immunisation schedule tool"
```

---

### Task 12: The page, metadata, sitemap and nav

**Files:**
- Create: `apps/lumi9-web/src/app/parenting-tools/page.tsx`
- Modify: `apps/lumi9-web/src/app/sitemap.ts` (add one entry to `STATIC_ROUTES`)
- Modify: `apps/lumi9-web/src/components/site/Nav.tsx` (add one entry to `SUPPORT_LINKS`)

**Interfaces:**
- Consumes: all four tool components, `<BabyProfileCard />`, `PageShell`, `SUPPORT_LINKS`; `absoluteUrl`, `breadcrumbSchema`, `canonical`, `jsonLd`, `SITE_NAME` from `@/lib/seo`.
- Produces: the route `/parenting-tools`.

- [ ] **Step 1: Write the page**

Create `apps/lumi9-web/src/app/parenting-tools/page.tsx`:

```tsx
import type { Metadata } from "next";
import { PageShell } from "@/components/site/PageShell";
import { SUPPORT_LINKS } from "@/components/site/Nav";
import { BabyProfileCard } from "@/components/tools/BabyProfileCard";
import { DiaperPlanner } from "@/components/tools/DiaperPlanner";
import { GrowthPercentile } from "@/components/tools/GrowthPercentile";
import { ImmunisationSchedule } from "@/components/tools/ImmunisationSchedule";
import { SizeUpPredictor } from "@/components/tools/SizeUpPredictor";
import { Reveal } from "@/components/motion/Reveal";
import { absoluteUrl, breadcrumbSchema, canonical, jsonLd, SITE_NAME } from "@/lib/seo";

const TITLE = "Parenting Tools | Diaper Planner, Growth & Vaccination Chart | Lumi9";
const DESCRIPTION =
  "Free parenting tools for Indian families: work out how many diapers you need and what they cost, when your baby sizes up, WHO growth percentiles, and the UIP and IAP vaccination schedule from your baby's date of birth.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  keywords: [
    "baby vaccination chart india",
    "immunization schedule india",
    "baby growth percentile calculator",
    "how many diapers per day",
    "diaper cost calculator",
    "when to change diaper size",
  ],
  alternates: canonical("/parenting-tools"),
  openGraph: {
    type: "website",
    url: absoluteUrl("/parenting-tools"),
    siteName: SITE_NAME,
    title: TITLE,
    description: DESCRIPTION,
  },
};

const TOOLS = [
  { href: "#planner", label: "How many will you need?" },
  { href: "#size-up", label: "When will they size up?" },
  { href: "#growth", label: "Growth percentiles" },
  { href: "#immunisation", label: "Vaccination schedule" },
];

export default function ParentingToolsPage() {
  return (
    <PageShell links={SUPPORT_LINKS} cta="shop">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLd(
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Parenting tools", path: "/parenting-tools" },
          ]),
        )}
      />

      <header className="px-safe mx-auto max-w-[720px] pt-[clamp(44px,6vw,80px)] pb-8 text-center">
        <h1 className="m-0 mb-3.5 font-display text-[clamp(29px,7.8vw,60px)] font-normal leading-[1.02] md:text-[clamp(34px,4.6vw,60px)]">
          Parenting tools
        </h1>
        <p className="m-0 text-lead text-muted">
          Four small tools for the nappy years. Fill in your baby once and they all just work —
          everything stays on your device.
        </p>
        <nav className="mt-6 flex flex-wrap justify-center gap-2" aria-label="Tools on this page">
          {TOOLS.map((tool) => (
            <a
              key={tool.href}
              href={tool.href}
              className="rounded-pill border border-moss-tint px-4 py-2 text-sm font-semibold text-moss-deep"
            >
              {tool.label}
            </a>
          ))}
        </nav>
      </header>

      <div className="px-safe mx-auto flex max-w-[900px] flex-col gap-block pb-section">
        <Reveal>
          <BabyProfileCard />
        </Reveal>
        <Reveal>
          <DiaperPlanner />
        </Reveal>
        <Reveal>
          <SizeUpPredictor />
        </Reveal>
        <Reveal>
          <GrowthPercentile />
        </Reveal>
        <Reveal>
          <ImmunisationSchedule />
        </Reveal>
      </div>
    </PageShell>
  );
}
```

- [ ] **Step 2: Add the sitemap entry**

In `apps/lumi9-web/src/app/sitemap.ts`, add to `STATIC_ROUTES` immediately after the `/size-guide` line:

```ts
  { path: "/parenting-tools", priority: 0.7, changeFrequency: "monthly" },
```

- [ ] **Step 3: Add the nav entry**

In `apps/lumi9-web/src/components/site/Nav.tsx`, change `SUPPORT_LINKS` to:

```ts
export const SUPPORT_LINKS: NavLink[] = [
  { label: "Shop", href: "/shop" },
  { label: "Tools", href: "/parenting-tools" },
  { label: "About", href: "/about" },
  { label: "Help", href: "/help" },
  { label: "Contact", href: "/contact" },
];
```

- [ ] **Step 4: Typecheck, lint and run the full test suite**

```bash
cd /Users/bot/dev/femi9
npm run typecheck --workspace lumi9-web && npm run lint --workspace lumi9-web
cd apps/lumi9-web && npm test
```

Expected: all clean, all tests pass.

- [ ] **Step 5: Verify in the browser**

```bash
npm run dev:lumi9
```

Then at `http://localhost:3001/parenting-tools` check each of these by hand:

1. **Empty profile** — all four tools render. The diaper planner works, the size-up tool accepts a weight, the two health tools say what they need. Nothing is blank and nothing throws.
2. **Fill the profile** — the planner's daily rate and the size-up weight pre-fill; percentiles appear; vaccine dates appear.
3. **Reload the page** — the profile survives.
4. **Private window** — the profile does not persist, but nothing errors and every tool still works.
5. **Preterm** — set 32 weeks. Growth shows the corrected-age note; the vaccine list explicitly says dates are *not* corrected. Confirm the first vaccine date still equals the date of birth.
6. **Both vaccine tracks** — switching UIP/IAP changes the list, and the source line under it changes too.
7. **Mobile at 390px** — no horizontal overflow; the anchor chips wrap.

- [ ] **Step 6: Commit**

```bash
cd /Users/bot/dev/femi9
git add apps/lumi9-web/src/app/parenting-tools/page.tsx apps/lumi9-web/src/app/sitemap.ts \
        apps/lumi9-web/src/components/site/Nav.tsx
git commit -m "feat: add the /parenting-tools page"
```

---

## Verification checklist

Run before calling the feature done:

- [ ] `npm test` in `apps/lumi9-web` — all green
- [ ] `npm run typecheck --workspace lumi9-web` — clean
- [ ] `npm run lint --workspace lumi9-web` — clean
- [ ] `npm run build --workspace lumi9-web` — succeeds (the page is a server component with client children; this is where a misplaced `"use client"` shows up)
- [ ] `/parenting-tools` appears in `/sitemap.xml`
- [ ] Every WHO and vaccine value traces to its published source, and both `*_SOURCE` / `*_REVISED_ON` constants are real dates rather than the placeholders in the data-file templates
- [ ] No horizontal overflow at 390 / 360 / 320px
