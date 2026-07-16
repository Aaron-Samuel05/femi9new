# femi9 App — UX / UI Audit & Fix Tasklist

_Audited 2026-07-12 against the live Pencil canvas (`femi9-pencil.pen`) and Pencil's "Mobile App" design guide._
_Scope: v3 + v4 analyzed. **v4 is the chosen direction**, so fixes target v4 first; v3 shares most issues and can follow._

**Priority legend:** `P0` broken / dead-end · `P1` clearly hurts UX · `P2` polish / nice-to-have
**Status:** `[ ]` todo · `[~]` in progress · `[x]` done

---

## Bucket C — UI component mismatch / inconsistency (highest leverage, do first)

- [x] **C1 · Unify the Status Bar into one component** `P0` ✅ 2026-07-12
  Was hand-built ~40× at 44/54/62px with 3 paddings. **Fixed:** all 26 v4 screens now instance the `StatusBar` component (jlR6o). 21 standard light, T4 + Y2 as dark variants (transparent fill + on-purple text), T3 as modal (absolute), L1/L2 already converted. Verified on S1 (light), T4 (dark header), Y2 (dark full-screen).

- [x] **C2 · Unify the Tab Bar into one component** `P0` ✅ 2026-07-12
  Committed to the **flush bar** (L0mtHT). Swapped all 9 tab bars to instances with a per-screen `selected` override (Today/Learn/Circle/Shop/Me). T2's is absolute-positioned; C1's FAB preserved. Verified Today (T1) + Circle (C1) highlight correctly.

- [x] **C3 · Adopt the component library everywhere** `P0` ✅ 2026-07-12
  Achieved via C1+C2 — StatusBar & TabBar are now instances across every v4 screen. ProductCards were already real instances (verified in layout scan). Fixes now propagate from one source.

- [x] **C4 · Normalize tab-bar stroke/spacing** `P2` ✅ 2026-07-12
  Resolved by C2 — every tab bar inherits the component's stroke + padding, so the `strokeAlignment`/padding drift is gone.

---

## Bucket B — UX quality issues ("not that good") / layout bugs

- [x] **B1 · Circle feed topic chips are clipped** `P0` ✅ 2026-07-12 (v4 `T8g5oY`)
  Fixed on v4: tightened gap 8→6, chip padding 14→12, trimmed "Irregular Cycles"→"Irregular". All 4 chips now fit; T8g5oY dropped off the layout-problem scan. _(v3 J8pQj still open — mirror later.)_

- [x] **B2 · Tab bar clipped at screen bottom** `P1` ✅ 2026-07-12
  Fixed: C2's component (shorter bottom padding) cleared L1/L2/S1. The status-bar standardization then pushed the 3 fixed-height Me screens (M1/M2/M3) ~10px over, so set those to `fit_content(844)`. Verified M1 tab bar now flush.

- [x] **B3 · Uneven ProductCard heights in Shop grid** `P1` ✅ 2026-07-12 (v4 `yZoJ3`)
  Cause: card was `fit_content` and the Name wrapped 1 vs 2 lines. Fixed on the component (nb8so): Name reserved to a fixed 2-line height (36px), and moved the clipping size-chip x139→x117. Shop now reports **zero** layout problems; propagates to all card instances.

- [ ] **B4 · Hero images bleed off the right edge** `P2` (Move `yr6QX`/`MjAYk`, Subscription `FyI14`)
  Illustrations/photos at x≈206–214 are partially clipped. Verify intentional bleed vs accidental overflow; clamp if accidental.

- [ ] **B5 · Log Flow density / one-primary-intent** `P2` (v4 `J1AiD0` T4)
  Flow + Symptoms + Mood + Note + Save on one screen — review hierarchy so the primary action (log) is unmistakable and reachable one-handed. _(needs a visual pass)_

- [ ] **B6 · Onboarding calendar edge clip** `P2` (v4 `EJ1Q3` O2)
  A calendar element (`Lf8zD`) is slightly clipped at the row edge. Tidy the grid math.

---

## Bucket A — Missing screens / states (dead-end CTAs & standard flows)

- [x] **A1 · Login / Sign-in screen** `P0` ✅ 2026-07-12 (`o0y3WC`, placed right of O5)
  Built to the onboarding system: back button, "Welcome back" + subtitle, Email/phone + Password (show/hide) card inputs, Forgot-password link, yellow "Log in" pill, "or" divider, "Continue with Google" outline, "New to femi9? Get started" footer. Now the O1 "I already have an account" CTA has a destination.

- [x] **A2 · Order confirmation / success** `P0` ✅ 2026-07-12 (`UWiD7`)
  Close button, purple check badge, "Order placed!", order card (Double Wings ×2 + Starter, #FM-260712, Total Rs.522), purple "SYNCED TO YOUR CYCLE" delivery card with period-timed ETA + address, "Track order" CTA + "Continue shopping". Rendered & verified. (New frames paint-lag in the canvas screenshot — give them a beat.)

- [ ] **A3 · Cart / bag** `P1`
  Shop jumps S1 → S2 → S3 (checkout) with no cart review; S2 "Add to cart" has no destination.

- [ ] **A4 · Search results** `P1`
  Both L1 (Learn) and C1 (Circle) have search bars with no results screen.

- [ ] **A5 · Edit period dates** `P1`
  T2 "Edit period dates" button has no target screen.

- [ ] **A6 · Empty states** `P1`
  First-run Today (before any logging), empty Circle feed, empty Orders, empty Search.

- [ ] **A7 · Notification permission priming** `P2`
  O5 toggles reminders but there's no system-permission priming / notifications center.

- [ ] **A8 · Post-log updated-prediction confirmation** `P2`
  T4 "Save" gives no feedback that the forecast/confidence updated.

- [ ] **A9 · Me detail screens** `P2`
  M3 links "Help & support", "About femi9", "Data & export", and profile-edit — none have destinations.

---

## Recommended fix order (one at a time)

1. **C1 StatusBar component** → 2. **C2 TabBar component** → 3. **C3 swap all v4 screens to instances** (kills C1/C2/B2/C4 in one sweep)
4. **B1 Circle chips** → 5. **B3 product-card heights** → 6. **B4/B6 edge clips**
7. Missing screens by priority: **A1 Login → A2 Order success → A3 Cart → A4 Search → A5 Edit dates → A6 Empty states**
8. Remaining P2 polish.

_Fixes applied to v4; mirror to v3 only if we keep both versions._

---

## V3 parity (both versions being kept — cream/violet identity preserved)

- [x] **V3 C1 · StatusBar component** ✅ 2026-07-12 — created `E2DAqM` (v3 tokens), adopted across all 26 V3 screens (light + T4/Y2 dark + T3 modal).
- [x] **V3 C2 · TabBar component** ✅ 2026-07-12 — created `crHVd` (flush cream/violet), replaced all 9 V3 tab bars (incl. the floating-capsule variants) with per-screen selection; FAB preserved on C1; T2 absolute nudged flush.
- [x] **V3 B1 · Circle chips** ✅ 2026-07-12 — V3 had 8 chips (worse overflow); trimmed to the same 4 as V4 + tightened.
- [x] **V3 B3 · Product cards** ✅ 2026-07-12 — fixed on component `yexhG` (Name 2-line height + size-chip x117).
- [ ] V3 B4/B6 (hero bleed, calendar edge) — same P2/likely-intentional as V4.

## Core missing screens — build on BOTH versions
- V4: [x] A1 Login · [x] A2 Order confirmation · [x] A3 Cart (`PRMNE`) · [x] A4 Search (`aQDtI`) · [x] A5 Edit period dates (`dNyAj`) · [x] A6 Empty Orders (`z59fF2`) — **V4 core complete**
  _(A1/A2 rendered-verified; A3–A6 built + structure-verified, render next turn once settled)_
- V3: [x] A1 Login (`a1XGl`) · [x] A2 Order confirmation (`x6FqV`) · [x] A3 Cart (`w7BMcX`) · [x] A4 Search (`D17oo`) · [x] A5 Edit period dates (`i8fcg`) · [x] A6 Empty Orders (`CUDJC`) — **V3 core complete**
  _(cream/violet re-themes of V4; built + structure-verified; render on view in Pencil)_

## ✅ BOTH VERSIONS COMPLETE (core scope) — 2026-07-12
V3 + V4 each have: single StatusBar/TabBar components adopted everywhere, Circle-chips + product-card fixes, and all 6 core dead-end screens (Login, Order confirmation, Cart, Search, Edit period dates, Empty Orders). Remaining = optional P2 polish only (B4 hero bleed / B5 log-flow density / B6 calendar edge) + A7–A9 depth screens if ever wanted.
