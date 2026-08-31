# Lumi9 Parenting Tools — Design

**Date:** 2026-08-30
**App:** `apps/lumi9-web`
**Route:** `/parenting-tools`
**Status:** approved, ready for implementation planning

## Purpose

A parenting-tools page for the Lumi9 storefront, prompted by
`rforrabbit.com/pages/parenting-tools`.

The reference runs 19 tools across pregnancy planning, baby health, checklists,
astrology/naming and an AI chat. It is a long-tail SEO estate: each tool is its
own indexable page chasing a specific search term. **We are not copying it.**
Much of that list — online pregnancy test, Chinese gender predictor, Vedic birth
charts — is pre-conception or divination, which sits badly against a company
selling diapers to people who already have a baby.

This page is built for **utility to real customers**, not for traffic. Fewer
tools, each of which does something the site cannot already do, and two of which
lead to a purchase.

### Success criteria

1. A parent can answer "how many do I need and what will it cost me a month?"
   without arithmetic.
2. A parent knows when their baby will outgrow the current size, before it
   happens.
3. The health tools are accurate, sourced, and India-specific.
4. Every tool works on first visit with no account and no login.

## Scope

**In:** ages 0–5, including health tools. India-first.

**Out, and deliberately:**

- Pregnancy and pre-conception tools — nothing to sell against, off-brand.
- Astrology, numerology, name generators, eye-colour and gender predictors.
- AI chat.
- Milestone tracker, diaper-bag checklist, first-year cost estimator. These are
  lookup tables and lists wearing a tool's clothes; they can be added later as
  content without touching this architecture.
- Multiple children. One profile. Sibling support adds a selector to every tool
  and roughly doubles the state handling, for a second-time-parent minority.
- Server-side profile sync. Local only — see Data model.

## Architecture

One page, not five. `/parenting-tools` holds the profile card and all four
tools as anchored sections (`#planner`, `#size-up`, `#growth`, `#immunisation`).
The parent enters the profile once and scrolls. That is the entire point of
sharing a profile, and subroutes would tax it with a navigation step per tool.

The file-size problem that usually argues for subroutes is solved by
decomposition instead: each tool is its own component and the page only
composes them. If a tool later needs to rank on its own, promoting a section to
a route is a small change *because* the tool is already standalone.

```
src/app/parenting-tools/page.tsx        server: metadata, breadcrumb JSON-LD, composition
src/lib/baby-profile.ts                 shared store (client)
src/lib/growth-standards.ts             WHO LMS tables + percentile maths      (pure)
src/lib/immunisation-schedule.ts        UIP + IAP schedule data                (pure)
src/lib/diaper-planning.ts              usage bands, pack maths, cost          (pure)
src/components/tools/BabyProfileCard.tsx
src/components/tools/DiaperPlanner.tsx
src/components/tools/SizeUpPredictor.tsx
src/components/tools/GrowthPercentile.tsx
src/components/tools/ImmunisationSchedule.tsx
```

### The boundary that matters

All real logic — percentile maths, schedule dating, diaper arithmetic — lives in
`lib/` as pure functions taking data and returning data. Components only render.

This is what makes the health calculations testable without mounting React, and
those are precisely the ones where being wrong matters. A component that renders
a wrong number and a function that returns a wrong number are the same bug, but
only one of them is cheap to catch.

### Also touched

- `src/app/sitemap.ts` — add `/parenting-tools`.
- `SUPPORT_LINKS` in `src/components/site/Nav.tsx` — one entry, alongside the
  size guide. Not the main nav, which is already six items.

## Data model

```ts
type BabyProfile = {
  name?: string
  dob: string              // ISO date, date-only
  sex: "male" | "female"   // required: WHO tables are sex-specific
  weightKg?: number
  heightCm?: number
  gestationalWeeks?: number // optional; < 37 triggers corrected age for growth
}
```

`sex` is not optional. A percentile without it is meaningless, not merely less
accurate.

Stored in `localStorage` via `useSyncExternalStore`, mirroring `src/lib/cart.tsx`
exactly — including a server snapshot returning `null`. That file already
documents the reason: `localStorage` does not exist during SSR, and reading it
inside an effect causes a cascading render. Follow the existing precedent rather
than introduce a second pattern for the same problem.

**The profile is a convenience, never a gate.** Every tool accepts its own
inputs and works standalone on first visit.

## The four tools

### 1. Diaper planner

*Purpose: drives purchase.*

**In:** age (from DOB), diapers per day. **Out:** diapers/day → per month → the
matching pack from `catalog.ts` → ₹/month at launch pricing → "your pack lasts
~N days" → subscription CTA with the interval pre-filled.

Age-banded defaults, defined in `diaper-planning.ts` and confirmed against
published guidance at implementation time:

| Age | Diapers/day |
| --- | --- |
| 0–1 month | 10 |
| 1–5 months | 8 |
| 6–12 months | 7 |
| 12–24 months | 6 |
| 2–5 years | 5 |

These are shown as **editable**. A real family's rate is the accurate number; letting them
correct it is more honest than asserting an average fits, and it makes the cost
figure theirs rather than ours.

### 2. Size-up predictor

*Purpose: drives the next purchase.*

**In:** weight, DOB. **Out:** current size and a projected month for the next
one — "likely M around March".

Uses the catalog's existing weight ranges (NB ≤5, S 4–8, M 7–12, L 9–14,
XL 12–17 kg).

**Projection method, stated because there are two plausible readings and they
give different answers:** compute the child's current weight-for-age z-score,
then hold that z-score constant and walk forward through the WHO table to find
the first age at which their projected weight crosses the next size boundary.

This tracks the child's *own* growth curve. Applying the population median
velocity instead would be wrong for exactly the children the tool is most useful
for — a baby on the 90th centile outgrows a size sooner than the median, and a
baby on the 10th later.

Projection is capped at 6 months out and expressed as a month, not a date
("around March"), because the precision beyond that is false.

Links to `/size-guide`; does not duplicate it.

### 3. Growth percentile

*Purpose: earns trust.*

**In:** weight, height, DOB, sex. **Out:** weight-for-age and
length/height-for-age percentiles.

WHO Child Growth Standards, 0–5 — the same standards IAP endorses for
under-fives. Standard LMS maths, stated here so it is checkable:

```
z = ((value / M)^L − 1) / (L × S)     for L ≠ 0
z = ln(value / M) / S                 for L = 0
percentile = Φ(z)
```

The `L = 0` branch is defensive, not exercised. Checked against the downloaded
tables: height-for-age is L = 1 throughout and weight-for-age runs −0.3531 to
0.3809, never reaching exactly zero. It is kept because the general formula
divides by zero there and another WHO indicator (BMI-for-age) can sit near it —
not because this data reaches it.

*(Corrected after the fact. This section originally asserted the branch "occurs
in the WHO tables". That was written before the tables were downloaded and it
turned out to be false — recorded here rather than quietly overwritten, because
a spec that hides having been wrong teaches the reader to trust the rest of it
more than they should.)*

JavaScript has no normal CDF, so `Φ` is implemented from an `erf` approximation
(Abramowitz & Stegun 7.1.26 is accurate to ~1.5e-7, far beyond what a displayed
percentile needs). This is called out because it is the kind of gap that
otherwise gets filled with a rough guess.

For a baby born before 37 weeks, **corrected age** is used up to 24 months.

### 4. Immunisation schedule (India)

*Purpose: earns trust, India-specific.*

**In:** DOB. **Out:** a dated schedule with past doses marked.

**Two tracks, because India genuinely has two:**

- **UIP** — the Government of India Universal Immunization Programme. Free, and
  what most families actually follow.
- **IAP** — the Indian Academy of Pediatrics timetable, which adds optional
  vaccines (typhoid conjugate, hepatitis A, varicella, influenza).

Showing only one would misinform a large share of the audience. The parent
chooses a track; both are always available.

Dates are **chronological, never corrected**, including for preterm babies.

## Data sourcing

Vaccine ages and WHO LMS tables are **transcribed from published sources at
implementation time, not written from model memory.** Every entry carries its
`source` and `revisedOn`.

This is a hard requirement, not a preference. A wrong vaccine date is a
different class of defect from a wrong margin, and "the model was fairly
confident" is not a citation. Sources:

- IAP Immunization Timetable (latest published revision)
- MoHFW / UIP National Immunization Schedule
- WHO Child Growth Standards LMS data files (weight-for-age,
  length/height-for-age, by sex, 0–60 months)

Each tool displays its source and revision date inline, so a parent can verify
it and we can tell when it has gone stale.

## Preterm handling

The two health tools disagree about what "age" means, and both are correct:

| Tool | Age basis |
| --- | --- |
| Growth percentile | **Corrected** age, up to 24 months |
| Immunisation schedule | **Chronological** age, always |

Applying one rule to both would be actively harmful in opposite directions —
either plotting a preterm baby as failing to thrive, or delaying their
vaccinations. The immunisation tool states on-screen that it is deliberately not
corrected.

Gestational age is optional; absent it, the baby is assumed term.

## Edge cases

- **DOB in the future** — reject with a clear message; compute nothing.
- **Age > 5 years** — growth declines to plot and says why (outside WHO range);
  immunisation still shows the 5–6 year booster.
- **Weight beyond ±5 SD** — no percentile rendered. "Outside the standard range
  — worth asking your paediatrician" is the correct output, not a number.
- **Date arithmetic is date-only.** No `Date` with a time component, no timezone
  conversion. A due date that shifts by a day depending on the viewer's timezone
  is a real bug and a very hard one to notice.
- **`localStorage` unavailable** (private browsing, blocked site data) — every
  read and write wrapped; tools work, they just do not persist.
- **Empty profile** — every tool renders and accepts its own inputs.

## Safety

Both health tools carry a visible disclaimer — not buried in the footer:
*not medical advice; talk to your paediatrician.* Alongside the inline source
and revision date from Data sourcing.

## Testing

Vitest, added to `apps/lumi9-web` (which currently has no test tooling at all),
scoped to the pure `lib/` modules. No React Testing Library: the logic is pure,
so nothing needs mounting, and the value is in the numbers.

- `growth-standards` — percentiles checked against published WHO reference
  z-scores, including the ±5 SD boundary and the corrected-age path.
- `immunisation-schedule` — dating checked against hand-computed dates from a
  fixed DOB, both tracks; preterm confirmed *not* corrected.
- `diaper-planning` — pack selection, monthly cost against `catalog.ts` launch
  pricing, "lasts N days".
- Date helpers — no timezone drift across DST boundaries.

Adds one dev dependency and a `test` script. `typecheck` and `lint` continue to
gate as they do now.

## Follow-on work, explicitly not in this build

- Promoting a tool to its own route if it turns out to warrant SEO attention.
- A personalised "right now" summary strip at the top of the hub — cheap to add
  precisely because the profile is already shared.
- Server-side profile sync for logged-in parents (needs a `packages/db` schema
  change and an API route).
- Milestones, diaper-bag checklist, first-year costs.
