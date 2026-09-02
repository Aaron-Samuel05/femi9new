# CLAUDE.md — Femi9 web (`apps/femi9-web`)

Instructions for Claude Code working in this app. Read this before every task.
Platform-level context lives in the repo-root `CLAUDE.md`.

## 0. Scope rule (non-negotiable)

**Work only inside `apps/femi9-web/`.** Two neighbours you must not wander into:

- `apps/lumi9-web/` — the other brand. Touch it only when a task explicitly
  names the two-brand integration.
- The **repo root** holds dead prototypes — `femi9-app/`, `femi9-react/`,
  `femi9-scrool/`, `femi9-lavender/`, and the loose `index.html` / `app.js` /
  `styles.css`. Never read them for patterns and never edit them.

The PDFs at the repo root (`Femi9-Backend-PRD.pdf`,
`Femi9-Flows-and-Architecture.pdf`, `Femi9-Thara-Model-Explained.pdf`) are the
only root files worth consulting, and only when a task needs product intent.

## 1. What this is

Femi9 — Indian D2C period-care brand (pads + period panties). Next.js App
Router: storefront, customer account, and the ops console in one deploy, backed
by Postgres. One of two apps in the `femi9-platform` workspace, pinned to the
same exact Next version as `lumi9-web`.

| | |
| --- | --- |
| Framework | Next.js 16.3.1 (App Router, **Turbopack**) · React 19.2 · TypeScript strict |
| Data | PostgreSQL via Prisma 6 (`prisma/schema.prisma`, ~60 models) |
| Styling | Hand-written CSS in `src/styles/*.css` + colocated `*.css`. **No Tailwind.** |
| Auth | Stateless HS256 JWTs in httpOnly cookies (`jose`) |
| Payments | Razorpay — one-off orders, **recurring mandates** (Subscriptions API), webhook, reconcile cron |
| Messaging | Resend (email) · WhatsApp Cloud API (**sign-in OTP + order status**) · MSG91 (reward codes only) |
| Tests | Vitest (`npm test`) · Playwright (`npm run test:ui`) |
| Errors | Sentry (client/server/edge configs at app root) |

## 2. Layout

```
app/
  (store)/            storefront: home, shop, product/[id], checkout, blog, thara, …
  account/ dashboard/ welcome/    signed-in customer surface
  api/                route handlers (customer + webhooks + cron)
  a/[code] r/[code]   affiliate + Thara referral short links

There is NO admin here any more — see below.
src/
  lib/                CLIENT-side only now — 9 files: router-compat, track,
                      use-add-pulse, use-public-settings, sticky-nav,
                      opt-images, safe-next, session, thara/terms.
                      Everything server-side moved to @femi9/core.
  components/ screens/ store/ styles/ charts/ immersive/ data/
prisma/               seed.ts · seed-zones.ts · seed-demo.ts  (brand-specific
                      seed DATA only — schema + migrations are in packages/db)
middleware.ts         edge guard for /admin, /api/admin, /account, /dashboard, /welcome
docs/                 GEOIP.md · TWO-BRAND-ARCHITECTURE.md · phases/ · thara/
```

## 3. Rules that matter here

**The Prisma schema is NOT in this app.** It lives in `packages/db`
(`@femi9/db`), shared with the other brand. `src/lib/db.ts` is now a thin,
deliberately LAZY re-export that pins `dbFor('femi9')` behind the import path
~80 call sites already use. It is lazy because `dbFor()` needs `DATABASE_URL` at
construction and the Docker build stage has no credentials — constructing
eagerly would break `next build` in the image. New service code should call
`dbFor(brand)` directly rather than importing this shim.

The `db:*` scripts pass `--schema ../../packages/db/prisma/schema.prisma`; they
still run from THIS directory because that is where `.env` is, and the Prisma
CLI reads env from its working directory.

**Business logic lives in `@femi9/core`, not in this app.** Route handlers parse
+ authorize + delegate. Pages and server components import services directly —
they do not fetch their own API. If you are writing a Prisma query inside `app/`,
stop and put it in a service in `packages/core`.

Import by subpath — there is no barrel, on purpose (one would drag Razorpay,
Prisma and the mail client into any consumer wanting a single helper):

```ts
import { ok, badRequest, handle } from '@femi9/core/api'
import { requireAdmin }           from '@femi9/core/admin-auth'
import { getOrders }              from '@femi9/core/services/admin/orders'
```

**Every service in `@femi9/core` takes `brand` as its first parameter** and
resolves its own client with `dbFor(brand)`. Core exports no client of its own,
so there is nothing there for a second brand to import by accident.

`src/lib/db.ts` is a Femi9-pinned lazy client for the ~18 route handlers and
pages in THIS app that still query Prisma directly. Pinning a brand is fine for
a single-brand app; it was only dangerous while it lived in the shared package.
Those direct queries are debt — the architecture says they belong in a service.
Each one moved into `packages/core` is one fewer file importing this.

**The ops console is not in this app.** It lives in `apps/admin`, serves both
brands, and has its own per-brand cookies. `/admin` here redirects there when
`ADMIN_CONSOLE_URL` is set, and 404s otherwise. Do not add admin pages or
`/api/admin/*` routes back — the storefront's own E2E asserts that surface is
gone.

**⚠️ The cron routes' admin fallback is now inert.** `/api/cron/*` accept either
a matching `x-cron-secret` OR a signed-in admin. This app no longer mints an
admin cookie, so that second path can never succeed — **`CRON_SECRET` must be
set**, or subscription skip-resumes, legacy renewals and Thara cycle closing have
no way in. The routes were left otherwise untouched on purpose: they move money.

**Subscriptions are billed by a Razorpay MANDATE — the gateway owns the
calendar.** Three things follow, and all three are easy to get wrong:

1. **A new plan is INERT.** `POST /api/subscriptions` writes `pending_mandate`
   and creates the gateway subscription; nothing is EVER debited until the
   customer's bank approves it through `src/lib/mandate.ts` and
   `POST /api/subscriptions/[id]/authorize`. A 201 means "ready to authorise".
   To finish an abandoned one, re-`GET` that route — never POST
   `/api/subscriptions` again, or she gets two plans and two debits a cycle.
2. **A recurring order is created by the `subscription.charged` webhook**, in
   `recordSubscriptionCharge`, after the money has arrived — so it is born
   `paid`, with a real Payment row, and it is NEVER refused. A stock shortfall
   logs a backorder and still creates the order; refusing would mean the bank
   had moved the money and we had recorded nothing.
3. **`generateDueOrders` (the renew cron) serves LEGACY plans only** —
   `razorpaySubscriptionId IS NULL`. Drop that filter and every mandated
   subscriber gets two boxes a cycle, one of them unpaid and holding stock.

"Skip next" is a pause plus a scheduled resume, because Razorpay has no
skip-one-cycle primitive; `/api/cron/resume-subscriptions` performs it. And
`RAZORPAY_WEBHOOK_SECRET` stops being optional here: a mandate debits with no
browser involved, so an unverifiable webhook means charges taken and no orders
created at all.

**Two cookies, two audiences, never crossed.**
`femi9_session` (aud `femi9-customer`, 30d) is this app's only session now.
`middleware.ts` re-implements verification inline with Web Crypto because it runs
on the edge; `@femi9/core/auth` is the Node-side counterpart. **Change one and
you must change the other** — the same check written twice, which is the cost of
the edge runtime. (The admin console avoids this: it uses `proxy.ts` on Node and
calls the shared verifier once.)

**This app uses `middleware.ts`, not `proxy.ts`, on purpose.** Next 16 renamed
the convention and every build warns about it. We have NOT migrated because
`proxy` runs on the Node runtime only and cannot be configured, while this file
is deliberately written to be edge-compatible. Migrating is a real decision, not
a rename — see the note in `docs/TWO-BRAND-ARCHITECTURE.md`. Do not "fix" the
warning by running the codemod without that decision being made.

**There is no ESLint here.** This app has never had a config, `next lint` was
removed in Next 16, and `next build` no longer lints. The `lint` script is gone
rather than left pretending to work. Adding real linting is worthwhile, but it
is its own task.

**Guard twice.** Middleware is the first gate, not the only one. Every
`/api/admin/*` handler still calls `requireAdmin()`; every customer handler still
calls `requireUser()`. Never rely on the matcher alone.

**Validate with Zod at the boundary.** Every handler parses its body with a
schema and returns `badRequest(msg, err.flatten())` via the helpers in
`@femi9/core/api` (`ok` / `badRequest` / `unauthorized` / `handle`). Use them —
don't hand-roll `NextResponse.json`.

**Rate-limit anything credential- or cost-bearing.** `rateLimit(key, n, windowMs)`
from `@femi9/core/rate-limit`, per-IP plus a global cap. See
`app/api/admin/login/route.ts` for the shape.

**Money is integer rupees.** No floats, no paise. Order totals snapshot
`productName` / `variantLabel` / `unitPrice` at purchase — never re-derive a past
order's price from the current catalog.

**Prices are resolved server-side, per zone.** `PriceZone` + `ZoneProductPrice` /
`ZoneVariantPrice` override `basePrice`; an exact zone price beats the zone's
`discountPct`. Never price a cart on the client.

**Cycle data is encrypted at rest.** `PeriodLog` / `SymptomLog` payloads go
through `@femi9/core/cycle-crypto` with `CYCLE_DATA_ENCRYPTION_KEY`. Never log,
export, or return them raw, and never widen who can read them.

**Thara is feature-flagged.** Every Thara route 404s unless the flag env is
exactly `"true"`. Keep new Thara work behind it.

**Soft deletes are real.** `Address.archivedAt` — every account read filters
`archivedAt IS NULL`, because orders reference addresses forever.

**CSS, not Tailwind.** Match the file you're editing. Shared tokens are in
`src/styles/base.css` / `app.css`; the `craft-*.css` family is the current design
system; `admin.css` and `f9dash.css` own the console.

**⚠️ `npm test` truncates every table.** `test/setup.ts` refuses to run unless
`DATABASE_URL` names a `*_test` database, and shell env beats `.env`, so point
`TEST_DATABASE_URL` at a scratch database and it cannot touch anything else:

```bash
createdb femi9_test                 # once
TEST_DATABASE_URL="postgresql://USER:PASS@127.0.0.1:5432/femi9_test?schema=public" npx vitest run
```

Push the schema in first with `npm run db:push`, pointing the same URL at
`DATABASE_URL`/`DIRECT_URL`. Full suite: 37 files, 247 tests, ~75s.

**Mock specifiers are strings, and TypeScript does not check them.** When a
module moves, `vi.mock('@/lib/x')` keeps compiling and silently stops mocking
anything — the test then exercises the real collaborator and can still "pass"
for the wrong reason. Grep `vi.mock(` after any move.

## 4. Commands

Run from the repo root (preferred) or inside this directory:

```bash
npm run dev:femi9              # from root — this app on :3000
npm run build:femi9            # from root
npm install                    # ALWAYS at the root; one hoisted lockfile

# from inside apps/femi9-web:
npm run build
npm run typecheck              # tsc --noEmit  (there is no `lint` script — see above)
npm test                       # vitest — SEE THE WARNING ABOVE
npm run test:ui                # playwright
npm run db:generate            # prisma generate
npm run db:migrate             # prisma migrate dev
npm run db:seed
npm run db:studio
```

There is **no app-level `package-lock.json`** — npm workspaces keep a single
hoisted lockfile at the repo root. `npm ci` only works there.

Env lives in `.env` (gitignored); `.env.example` is the contract — **add every
new var there** with a comment.

**Docker builds from the repo root, not here:**
```bash
docker build -f apps/femi9-web/Dockerfile -t femi9-web .
```

**This image had not built since phase 1b.** It copied
`src/lib/cycle-crypto.ts`, which moved to `packages/core` in that phase — the
211 files importing it were repointed, the Dockerfile was not, and a Dockerfile
is not something typecheck or the suite reads. `deploy-staging.yml` was failing
at the image step the whole time.

**The runtime layout changed: the image now runs from `/app/apps/femi9-web`.**
It used to flatten the standalone bundle to `/app/server.js`, which was right
before Next 16. Turbopack writes externalised server packages into
`.next/node_modules` as relative symlinks counted from the nested depth, so
flattening dangles all of them and the container dies loading its
instrumentation hook. Anything with a relative path — a `docker run` command, an
ECS `--overrides` — is relative to the app directory now.

## 5. Task log

Append one entry per task. Newest last.

| Date | Task | Touched | Notes |
| --- | --- | --- | --- |
| 2026-08-22 | Two-brand (Femi9 + Lumi9) platform architecture — brainstorm + plan | `CLAUDE.md` (new) · `docs/TWO-BRAND-ARCHITECTURE.md` (new) | Plan only, no code. Agreed: separate domains, **fully separate customer bases**, admin-only brand selection, two Razorpay accounts. |
| 2026-08-22 | Architecture revision after review | `docs/TWO-BRAND-ARCHITECTURE.md` | Admin brand pick is a **segmented toggle on the login form**, not a typed `femi9/` prefix (brand is untrusted client input — `AdminBrandRole` still decides). "Same backend" settled as **shared `packages/core`, not an extracted API service**. DB settled as **one Postgres, three schemas** (`femi9` · `lumi9` · `platform`). |
| 2026-08-23 | **Phase 0 — monorepo** | repo-wide | `femi9-next` → `apps/femi9-web`, `lumi9-web-main` → `apps/lumi9-web`. npm workspaces + Turborepo, one hoisted lockfile. Both apps build. Docker context moved to repo root; runtime layout kept flat and identical. CI/deploy paths updated, Lumi9 CI job added. Next upgrade deferred to Phase 0b. |
| 2026-08-23 | **Phase 0b — Next 16** | `package.json` · root `package.json` | Next 15.5.23 → **16.3.1** (exact, matching lumi9 — `next` now hoists to one copy). Builds on **Turbopack**; Sentry 10.70 is Turbopack-compatible, so no webpack conflict. `next lint` removed upstream → dead `lint` script dropped. Added `packageManager` to the root manifest (turbo could not resolve the workspace without it). **`middleware.ts` kept, not migrated to `proxy`** — open decision, see architecture doc. Zero `next/image` usage, so every image breaking change was moot. |
| 2026-08-23 | **Phase 1a — `packages/db`** | `packages/db/*` (new) · `src/lib/db.ts` · `Dockerfile` · `ci.yml` · `next.config.mjs` | Schema + 13 migrations → `@femi9/db`; seeds stayed (brand-specific). `dbFor(brand)` builds one client per brand from one schema — isolation in the connection string. `src/lib/db.ts` became a lazy Proxy shim so all ~80 call sites kept working and the credential-free Docker build still passes. Verified: proxy forwards delegates, `dbFor` memoises, `isBrand` rejects case/traversal/undefined, and **lumi9 refuses to fall back to femi9's `DATABASE_URL`**. |
| 2026-08-23 | **Phase 1b — `packages/core`** | 64 modules → `packages/core` · 211 files repointed | Server half of `src/lib` moved to `@femi9/core`; 9 client-side files stayed. Signatures UNCHANGED (move first, thread `brand` second) — services still use the pinned `core/db`. Catalog view-model types moved to `core/types/catalog`, re-exported from `src/data/*` so component imports were untouched. Subpath exports, no barrel. Verified: both packages typecheck, femi9 builds, no `@/` alias left in core, no unresolved `@femi9/*` require in the standalone bundle. |
| 2026-08-23 | **Phase 1c — `brand` threaded** | 35 core services · ~120 app/test files | All **161** core service functions now take `brand: Brand` first and call `dbFor(brand)`. Core exports **no** client; the Femi9 pin moved back to `apps/femi9-web/src/lib/db.ts` where pinning is legitimate. Every call site passes `'femi9'`, so behaviour is unchanged. Codemod gotchas worth remembering: a generic return type (`Promise<{...}>`) supplies a brace before the body; multi-line destructured params do too; `function f<T>(` isn't matched by `function f(`; arrow consts wrapped in `cache()` need it by hand; defaults like `db: Db = prisma` live in the signature, not the body. |
| 2026-08-23 | **Phase 4a — Lumi9 catalogue live** | `apps/lumi9-web/*` · `core/services/products.ts` | Lumi9's storefront reads the database. `getCatalog(brand)` added to core (brand-agnostic rows, with specs and real variant ids); Lumi9 maps them to its own size/pack shape and hands them to 12 client components through a provider. Whole tree `force-dynamic` — prerendering made the BUILD need a database the Docker stage does not have. Live data turned two stale-closure lint warnings into real bugs. |
| 2026-08-23 | **Phase 3 — Lumi9 data** | `packages/db` migrations · `apps/lumi9-web/prisma/*` · `brands.ts` | Lumi9 catalogue seeded (5 sizes, 12 variants, zones) and provable in isolation from Femi9. Found and fixed **migration drift**: cycle-encryption columns were `db push`-ed and never captured, so history could not rebuild the schema — `migrate diff` now clean. `ProductType += diaper`, and Femi9's vocabulary un-baked from the Zod boundary, the product form and `InventoryRow`. Product types are now per-brand and enforced at the routes. |
| 2026-08-23 | **Phase 2 — console moved out** | 15 pages + 31 routes → `apps/admin` | Every ops page and API left this app. Brand now comes from the SESSION (`requireConsole` / `requireConsoleApi`), never the URL segment. `/admin` redirects to `ADMIN_CONSOLE_URL` or 404s; `middleware.ts` no longer guards an admin surface. Storefront E2E rewritten: the seed script calls the services directly instead of the departed admin API, and both suites now assert the surface is **gone**. ⚠️ cron routes' admin fallback is inert — `CRON_SECRET` is required. |
| 2026-08-23 | **Phase 1 verified end-to-end** | `test/unit/geo-ladder.test.ts` | Ran the full suite against a LOCAL scratch `femi9_test`: **37 files / 247 tests pass**. Found a Phase 1b regression typecheck could not see — `vi.mock('@/lib/geo/mmdb'…)` still named the pre-move path, so the mocks were inert and 6 geo tests were exercising real lookups. Specifiers repointed at `@femi9/core/geo/*`. |
| 2026-08-25 | **PDP buy block on Lumi9's layout + site-wide scroll motion** | `screens/ProductDetail.tsx` · `product/[id]/page.tsx` · `lib/size-run.ts` · `lib/motion.ts` · `components/ScrollMotion.tsx` · `components/motion/Reveal.tsx` · `styles/pdp-buybox.css` · `styles/motion.css` · `app.css` · `craft-product.css` · `layout.tsx` · `providers.tsx` | Gallery is a **square sticky stage + horizontal thumb rail**; `.pdp-hero-gap-banner` deleted — it was an unrelated stock shot rendered only to fill the gap a 4:5 stage left beside a taller buy column, and it read as a second product photo. Buy column reordered to Lumi9's (desc above price, trust badges below the CTA), Femi9 tokens throughout. **Size picker changes the URL**: each pad length is its own product, so every chip is a `<Link>` to a sibling, derived from the catalogue at runtime (`sizeRun`) — never hardcoded, or it stops matching the day someone adds a 240mm. Period underwear is the one product with real size variants, so it writes `?size=`, resolved SERVER-side (a `useSearchParams` read would paint the default first and correct it after hydration). Lumi9's reveal + parallax ported and applied site-wide under the existing Lenis. Two invariants worth keeping: CSS hides only what JS tagged (`[data-reveal]`), so a failed bundle leaves the page visible, not blank; and the first pass after a full page load leaves on-screen blocks alone, because the server already painted them and fading them back in is a flash, not an entrance. Home/About skipped — `main.figma-landing` runs its own `data-visible` entrance. |

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
