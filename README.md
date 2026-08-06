# Femi9 — Workspace Guide

This folder is the working repo for **Femi9**, an organic period-care pad brand
(ultra-thin breathable organic-cotton pads with an anion strip; India-first,
shame-free positioning). It is **not a single app** — it holds several parallel
builds and experiments that grew over time: the original static marketing site,
two React rebuilds of the storefront, a Pencil-designed mobile app, and a
standalone scroll animation component.

This README exists so a new developer can tell the projects apart, know which one
is live, understand what changed recently, and run any of them.

---

## TL;DR — what's live and what to touch

- **`femi9-lavender/` is the live production storefront** → https://femi9-lavender.vercel.app
  (Vercel project `femi9-lavender`). This is the one that has received all the
  recent work. **Start here.**
- `femi9-react/` is the **older sibling** of lavender (same codebase, earlier
  state, no lavender theme / extra pages). Kept for reference; not the source of truth.
- `femi9-app/` is the **mobile app design** (Pencil `.pen` file) plus two deployed
  HTML prototypes. Design/prototype only — not a shipping app.
- `femi9-scrool/` is a **reusable `<pad-exploder>` web component** (zero-dependency
  scroll animation). It was later ported into lavender's immersive layer.
- The root `index.html` / `styles.css` / `app.js` are the **original hand-coded
  static site** — the first version, superseded by the React builds.

> ⚠️ **Current uncommitted state:** `femi9-lavender/` has **24 files staged but not
> committed** (the "Hallmark" design-audit pass — see [Recent work](#recent-work--current-state)).
> Those changes are **already live in production** (deployed from the working tree
> via the Vercel CLI) but are **not yet in a git commit**. Commit them before doing
> new work in lavender so history matches production.

---

## Repository map

| Path | What it is | Stack | Live? |
|------|-----------|-------|-------|
| `index.html`, `styles.css`, `app.js`, `assets/` | Original static single-page marketing site (v0) | Hand-coded HTML/CSS/JS | Superseded |
| `femi9-lavender/` | **Production storefront** (lavender theme, full site) | Vite + React 18 + TS | ✅ `femi9-lavender.vercel.app` |
| `femi9-react/` | Earlier React storefront build (predecessor to lavender) | Vite + React 18 + TS | Reference only |
| `femi9-app/` | Mobile companion app — Pencil design + v3 prototypes | Pencil `.pen`, HTML, one Vite app | Prototypes on Vercel |
| `femi9-scrool/` | Standalone `<pad-exploder>` scroll-animation web component | Vanilla Web Component | Component / reference |
| `Femi  9.pdf` | Brand-kit PDF (~41 MB) — source of brand imagery/colors | — | Asset |
| `femi9-scrool.zip` | Zipped snapshot of `femi9-scrool/` (handoff bundle) | — | Asset |

---

## 1. `femi9-lavender/` — the production storefront ⭐

The current, deployed Femi9 website. Vite + React 18 + TypeScript SPA using
`react-router-dom`, with GSAP + Lenis for motion and `three` / `@react-three`
for the 3D exploded-pad showcase.

**Run it**
```bash
cd femi9-lavender
npm install
npm run dev        # local dev server (Vite)
npm run build      # production build → dist/
npm run preview    # preview the built bundle
```

**Deploy** — Vercel project `femi9-lavender` (`.vercel/project.json`). It's a
client-side-routed SPA, so `vercel.json` rewrites every non-`/assets/` path to
`/index.html` — **keep that rewrite** or deep links / refreshes 404.

**What's inside `src/`**
- `pages/` — routed pages: `Home`, `ProductDetail`, `Blog`, `BlogPost`,
  `Account`, `UserDashboard`, `AdminDashboard`, `Affiliate`, `Partner`,
  `PeriodsWall`, `Rewards`.
- `components/` — section + UI components (`HeroBanner`, `Products`, `WhyBento`,
  `Story`, `Impact`, `Collabs`, `Cta`, `Footer`, `Nav`, `CartDrawer`,
  `CycleTracker`, `BlogCover`, `Rewards`, etc.).
- `immersive/` — the motion/3D layer: `PadExploder` (scroll-driven exploded pad,
  ported from `femi9-scrool`), `ExplodedPad` (three.js), `CycleMode`,
  `PadSelector`, `SmoothScroll` (Lenis), `Testimonials`, `ScrollStack`.
  `FluidCursor` and `LiquidBackground` still exist here but were **unmounted** in
  the recent audit.
- `charts/` — small hand-rolled chart components for the dashboards
  (`AreaChart`, `BarChart`, `DonutChart`, `CycleCalendar`).
- `data/` — static content/config (`products`, `productDetail`, `blog`,
  `account`, `analytics`, `cycle`).
- `store/cart.tsx` — cart context/state.
- `styles/` — global + per-feature CSS (`base`, `app`, `responsive`, `blog`,
  `rewards`, `affiliate`, `partner`, `periods-wall`, `collabs`, `cycle-tracker`).

> Note: this project's `package.json` still says `"name": "femi9-react"` — it was
> copied from `femi9-react/`. That's cosmetic; the deployed project is `femi9-lavender`.

## 2. `femi9-react/` — earlier React build

The predecessor to `femi9-lavender`. Same architecture (Vite + React + TS, same
`immersive/` and `charts/` folders) but an earlier snapshot: no lavender theme,
and it's missing the pages/components added later in lavender (`Affiliate`,
`Partner`, `PeriodsWall`, `Rewards`, `Collabs`, `CycleTracker`, `BlogCover`,
`PadExploder`, `PantyArt`, `TrustStrip`, `Hero`). It also uses `@fontsource/fraunces`.

Kept for reference/history. **Make changes in `femi9-lavender/`, not here**, unless
you're intentionally comparing the two. Runs the same way (`npm install` → `npm run dev`).

## 3. `femi9-app/` — mobile companion app (design + prototypes)

Design work for a native mobile companion app (cycle tracker + wellness programs
+ community + pad shop/subscribe). Not a shipping codebase — it's design assets
and prototypes.

- `femi9-pencil.pen` — the Pencil design file (open with the Pencil editor / MCP;
  it's encrypted, don't `cat` it).
- `docs/` — the spec and build notes:
  - `2026-07-11-femi9-app-design.md` — full design spec (audience, navigation,
    the "product-led spine", screen list).
  - `BUILD-PROMPT.md`, `v4-audit-tasks.md` — build prompt and audit tasks.
- `images/`, `logofemi9*.png` — generated screen renders and logo variants.
- `v3-app/` — a small **Vite + React** prototype (deps: `react`, `react-dom`,
  `lucide-react`). Vercel project `v3-app`. Run with `npm install && npm run dev`.
- `v3-prototype/` — a static HTML prototype with exported screens in
  `screens/*.webp`. Vercel project `v3-prototype`.

## 4. `femi9-scrool/` — `<pad-exploder>` web component

A self-contained, **zero-dependency** Web Component: as the visitor scrolls, a
pad separates into its layers on a `<canvas>` and labelled callouts fade in.
Works in plain HTML, React, Vue, WordPress — no build step. All styling lives in
its Shadow DOM; it's SSR-safe and cleans up on unmount.

- `pad-exploder.js` — the component (one file).
- `frames/optimised/` — the animation frames (`.webp` + `.jpg` fallback).
- `Frame/` — the raw source frames (`ezgif-frame-001..180.jpg`).
- `demo.html` — usage demo. `README.md` — install instructions.

This component was **later integrated into `femi9-lavender`** as
`src/immersive/PadExploder.tsx`. Treat `femi9-scrool/` as the standalone/source
version. `femi9-scrool.zip` at the repo root is a zipped copy for handoff.

## 5. Root static site (v0)

`index.html` + `styles.css` + `app.js` + `assets/img/` — the original hand-coded
marketing page (`<title>Femi9 - Organic, breathable period care</title>`). This
is the first version of the site, before the React rebuilds. Open `index.html`
directly in a browser. Superseded by `femi9-lavender/` but kept for reference.

---

## Recent work & current state

### 2026-08-06 — `femi9-next` release verification

The Next.js storefront/admin application on `master` was verified locally with
an isolated PostgreSQL database: TypeScript validation, the production build,
58 unit/integration tests, and 68 HTTP E2E checks passed. The production
dependency audit reports zero vulnerabilities. Local E2E uses explicit mock
providers, so it does not send email/SMS or capture real payments; live-provider
and cloud-deployment checks remain an operator responsibility.

All recent effort has gone into **`femi9-lavender/`**. In rough order:

1. **Content/AI-slop audit** — removed generic marketing copy and dead code;
   rebuilt the `Impact` section around real, authentic stats instead of
   fabricated metrics.
2. **`<pad-exploder>` integration** — ported the scroll-driven exploded-pad
   animation from `femi9-scrool/` into `immersive/PadExploder.tsx` with lavender
   theming; fixed label collisions and mobile layout.
3. **Fade-band polish** — eliminated hairline artifacts at the animation's fade
   junctions on both desktop and mobile.
4. **Performance pass** — JPEG→WebP, lazy-loading off-screen images, route-level
   code-splitting via `React.lazy`, tuned preloads, and removing `three.js` from
   the entry bundle. Result: LCP ~950 ms (~41% faster than baseline), CLS 0.00.
   (This pass is the most recent **git commit**, `7db66fe`.)
5. **"Hallmark" design audit** — an anti-AI-slop design cleanup. This is the set
   of **currently staged, uncommitted** changes (24 files). Notably:
   - Added a `--surface` CSS token and replaced ~41 hardcoded `#fff` backgrounds
     with it (`styles/*.css`).
   - Changed emphasized headings from italic to roman + weight
     (`.hero h1 .accent`, immersive title).
   - **Unmounted `LiquidBackground` and `FluidCursor`** from `StoreLayout.tsx`
     and removed the orphaned CSS in `immersive.css`.
   - Replaced `transition: all` with targeted property transitions
     (`Products.css`, `HeroBanner.css`, `CartDrawer.css`).
   - Added keyboard focus-pause to the `HeroBanner` carousel.
   - Converted straight quotes/apostrophes to smart typography in rendered copy
     (`Collabs`, `Story`, `Products`, `Impact`).
   - Moved bento icons inside `<h3>` headings and dropped the colored tile
     backgrounds (`WhyBento.tsx`/`.css`).
   - Removed scroll-triggered reveal/stagger animations from several sections and
     from `ProductCard` (the `delay` prop was retired).

**Git status right now**
- Latest commit: `7db66fe` (performance/image optimization).
- **Staged but uncommitted:** the 24 Hallmark-audit files under
  `femi9-lavender/src/`. These are **live in production** (deployed via Vercel
  CLI from the working tree) but not yet committed. **Recommended next step:
  commit them** so git history matches what's deployed.
- Unstaged: only `.DS_Store` (noise — safe to ignore or add to `.gitignore`).

---

## Conventions & gotchas

- **`.pen` files are encrypted** — only open `femi9-app/femi9-pencil.pen` through
  the Pencil editor/MCP, never with plain file tools.
- **Lavender needs the SPA rewrite** — don't remove the `vercel.json` rewrite or
  client-routed pages 404 on refresh/deep-link.
- **Two near-identical React trees** (`femi9-react` vs `femi9-lavender`) — make
  sure you're editing **lavender** (the live one). Both `package.json` files are
  named `femi9-react`, so check the folder, not the package name.
- **Brand imagery** comes from `Femi  9.pdf` and the live site; keep the pastel +
  yellow palette and lavender theme consistent.
