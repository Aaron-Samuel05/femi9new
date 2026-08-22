# CLAUDE.md — Femi9 (femi9-next)

Instructions for Claude Code working in this repo. Read this before every task.

## 0. Scope rule (non-negotiable)

**Work only inside `femi9-next/`.** The parent `femi9/` folder holds dead
prototypes — `femi9-app/`, `femi9-react/`, `femi9-scrool/`, `femi9-lavender/`,
the root `index.html` / `app.js` / `styles.css`. Never read them for patterns and
never edit them. The PDFs in the parent (`Femi9-Backend-PRD.pdf`,
`Femi9-Flows-and-Architecture.pdf`, `Femi9-Thara-Model-Explained.pdf`) are the
only parent-folder files worth consulting, and only when a task needs product
intent.

The sibling `lumi9-web-main/` is a separate app. Touch it only when a task
explicitly names the two-brand integration.

## 1. What this is

Femi9 — Indian D2C period-care brand (pads + period panties). Next.js App
Router monolith: storefront, customer account, and the ops console all in one
deploy, backed by Postgres.

| | |
| --- | --- |
| Framework | Next.js 15.5 (App Router) · React 19 · TypeScript strict |
| Data | PostgreSQL via Prisma 6 (`prisma/schema.prisma`, ~60 models) |
| Styling | Hand-written CSS in `src/styles/*.css` + colocated `*.css`. **No Tailwind.** |
| Auth | Stateless HS256 JWTs in httpOnly cookies (`jose`) |
| Payments | Razorpay (order + webhook + reconcile cron) |
| Email / SMS | Resend · MSG91 OTP |
| 3D / motion | react-three-fiber, GSAP, Lenis |
| Tests | Vitest (`npm test`) · Playwright (`npm run test:ui`) |
| Errors | Sentry (client/server/edge configs at root) |

## 2. Layout

```
app/
  (store)/            storefront: home, shop, product/[id], checkout, blog, thara, …
  account/ dashboard/ welcome/    signed-in customer surface
  admin/login         env-credential sign-in
  admin/(panel)/      ops console — 15 sections, _nav.tsx / _shell.tsx / _charts.tsx
  api/                88 route handlers (33 under api/admin)
  a/[code] r/[code]   affiliate + Thara referral short links
src/
  lib/                auth.ts · admin-auth.ts · db.ts · api.ts · rate-limit.ts ·
                      razorpay.ts · otp.ts · cycle-crypto.ts · geo/ · thara/
  lib/services/       ALL business logic. admin/ subfolder for ops-only logic.
  components/ screens/ store/ styles/ charts/ immersive/ data/
prisma/               schema.prisma · migrations/ · seed.ts · seed-zones.ts
middleware.ts         edge guard for /admin, /api/admin, /account, /dashboard, /welcome
docs/                 GEOIP.md · phases/ · thara/ · superpowers/
```

## 3. Rules that matter here

**Business logic lives in `src/lib/services/*`.** Route handlers parse + authorize
+ delegate. Pages and server components import services directly — they do not
fetch their own API. If you are writing a Prisma query inside `app/`, stop and put
it in a service.

**Two cookies, two audiences, never crossed.**
`femi9_session` (aud `femi9-customer`, 30d) and `femi9_admin` (aud `femi9-admin`,
7d). `middleware.ts` re-implements verification inline with Web Crypto because it
runs on the edge; `src/lib/auth.ts` and `src/lib/admin-auth.ts` are the Node-side
counterparts. **Change one and you must change the other** — they are the same
check written twice on purpose.

**Guard twice.** Middleware is the first gate, not the only one. Every
`/api/admin/*` handler still calls `requireAdmin()`; every customer handler still
calls `requireUser()`. Never rely on the matcher alone.

**Validate with Zod at the boundary.** Every handler parses its body with a
schema and returns `badRequest(msg, err.flatten())` via the helpers in
`src/lib/api.ts` (`ok` / `badRequest` / `unauthorized` / `handle`). Use them —
don't hand-roll `NextResponse.json`.

**Rate-limit anything credential- or cost-bearing.** `rateLimit(key, n, windowMs)`
from `src/lib/rate-limit.ts`, per-IP plus a global cap. See
`app/api/admin/login/route.ts` for the shape.

**Money is integer rupees.** No floats, no paise. Order totals snapshot
`productName` / `variantLabel` / `unitPrice` at purchase — never re-derive a past
order's price from the current catalog.

**Prices are resolved server-side, per zone.** `PriceZone` + `ZoneProductPrice` /
`ZoneVariantPrice` override `basePrice`; an exact zone price beats the zone's
`discountPct`. Never price a cart on the client.

**Cycle data is encrypted at rest.** `PeriodLog` / `SymptomLog` payloads go
through `src/lib/cycle-crypto.ts` with `CYCLE_DATA_ENCRYPTION_KEY`. Never log,
export, or return them raw, and never widen who can read them.

**Thara is feature-flagged.** Every Thara route 404s unless the flag env is
exactly `"true"`. Keep new Thara work behind it.

**Soft deletes are real.** `Address.archivedAt` — every account read filters
`archivedAt IS NULL`, because orders reference addresses forever.

**CSS, not Tailwind.** Match the file you're editing. Shared tokens are in
`src/styles/base.css` / `app.css`; the `craft-*.css` family is the current design
system; `admin.css` and `f9dash.css` own the console.

## 4. Commands

```bash
npm run dev            # next dev
npm run build
npm test               # vitest run
npm run test:ui        # playwright
npm run db:push        # prisma db push
npm run db:migrate     # prisma migrate dev
npm run db:seed
npm run db:studio
```

Env lives in `.env` (gitignored); `.env.example` is the contract — **add every
new var there** with a comment.

## 5. Task log

Append one entry per task. Newest last.

| Date | Task | Touched | Notes |
| --- | --- | --- | --- |
| 2026-08-22 | Two-brand (Femi9 + Lumi9) platform architecture — brainstorm + plan | `CLAUDE.md` (new) · `docs/TWO-BRAND-ARCHITECTURE.md` (new) | Plan only, no code. Agreed: separate domains, **fully separate customer bases**, admin-only `femi9/` · `lumi9/` slash login, two Razorpay accounts. Separate customers ruled out a `brand` discriminator — settled on **one Prisma schema, one database per brand**, so the live Femi9 DB needs no migration. Full plan in the doc. |
| 2026-08-22 | Architecture revision after review | `docs/TWO-BRAND-ARCHITECTURE.md` | Admin brand pick is a **segmented toggle at the top of the login form**, not a typed `femi9/` prefix (brand is untrusted client input — `AdminBrandRole` still decides). "Same backend" settled as **shared `packages/core`, not an extracted API service** — App Router server components read Postgres directly and must keep doing so. DB settled as **one Postgres, three schemas** (`femi9` · `lumi9` · `platform`) rather than two databases: same structural isolation, one instance, and cross-brand `UNION ALL` still works. |
