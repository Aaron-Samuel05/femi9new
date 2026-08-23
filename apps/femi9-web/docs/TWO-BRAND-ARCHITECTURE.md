# Two-brand architecture — Femi9 + Lumi9 on one platform

Status: **plan, decisions agreed, not yet implemented** · 2026-08-22

## Decisions taken

| Question | Decision |
| --- | --- |
| Domains | **Separate** — `femi9.com`, `lumi9.com`, each hosted independently, plus a shared admin host |
| Customer accounts | **Fully separate** — a Femi9 shopper and a Lumi9 shopper are unrelated rows, even at the same email |
| Admin brand selection | **A segmented toggle at the top of the login form** — not a typed `femi9/` prefix |
| Backend | **Shared** — one source of truth for all business logic |
| Database | **One Postgres instance · three schemas** (`femi9`, `lumi9`, `platform`) |
| Payments | **Two Razorpay merchant accounts** |

## Backend topology — what "same backend" means here

There are two readings of "one backend", and the right one for a Next.js App
Router stack is not the obvious one.

**Reading A — one deployed API service.** `api.femi9group.com` serves both
storefronts over HTTP.

**Reading B — one shared backend *codebase*.** Both storefronts and the admin
deploy the same `packages/core`, hitting the same database.

**We take B.** In the App Router the backend *is* the app: femi9's pages and
server components import `src/lib/services/*` directly and read Postgres with no
network hop. Extracting an API service would convert every one of those direct
calls into a `fetch()` — a large refactor, a permanent latency tax, loss of
React's request-level caching, and auth-token forwarding to build and secure.
That is fighting the framework for no gain, because the thing we actually want to
share — the logic — is shared either way.

```
   femi9.com                lumi9.com               admin.<group>.com
   Next app                 Next app                Next app
   route handlers           route handlers          route handlers
        └────────────────────────┴───────────────────────┘
                          packages/core
        services(brand, …) · auth · razorpay · pricing · mail · brands.ts
                                │
                          packages/db  →  dbFor(brand)
                                │
                    ┌───────────┴───────────┐
              schema femi9            schema lumi9      schema platform
                    └────────  ONE Postgres  ───────────────┘
```

Three deployments run backend code, but there is exactly one implementation of
it. A logic change is one merge; CI deploys the three apps that consume it.

**This stays reversible.** Because every service already takes `brand` as its
first parameter and touches Postgres only through `dbFor(brand)`,
standing up a real `api.` service later is a packaging change, not a rewrite.
Revisit it if a mobile app or a non-Next surface appears.

## Database: one Postgres, three schemas

```
Postgres (one instance, one database)
├── schema "femi9"      all ~60 tables · Femi9 rows      (the live data, renamed in place)
├── schema "lumi9"      the same ~60 tables · Lumi9 rows (new, empty)
└── schema "platform"   AdminUser · AdminBrandRole · AdminAuditLog
```

One `schema.prisma`. Two brand clients, selected by connection string:

```
DATABASE_URL_FEMI9="postgresql://…/app?schema=femi9"
DATABASE_URL_LUMI9="postgresql://…/app?schema=lumi9"
DATABASE_URL_PLATFORM="postgresql://…/app?schema=platform"
```

`dbFor(brand)` returns a memoised `PrismaClient` per brand. A query issued on the
Femi9 client physically cannot reach a Lumi9 row — the isolation is in the
connection, not in a `where` clause somebody might forget.

### Why three schemas and not the alternatives

| | one schema + `brand` column | **three schemas (chosen)** | two separate databases |
| --- | --- | --- | --- |
| Cross-brand leak | possible forever; every query needs `where.brand`, guarded by a Prisma extension | **impossible by construction** | impossible by construction |
| Migration on the live Femi9 data | `brand` on ~20 models, 6 global uniques → composite, backfill — **includes `User.email`, which auth depends on** | one instant `ALTER SCHEMA … RENAME` | one instant rename + a new DB |
| `Product.slug`, `User.email`, `Coupon.code` | must become `@@unique([brand, …])` | **unchanged** | unchanged |
| Femi9-only tables (Thara, cycle, wall) | need route-level fencing so Lumi9 staff cannot reach them | simply empty in `lumi9` | simply empty in `lumi9` |
| Cross-brand reporting | one query | **one query — `UNION ALL` across schemas** | needs `dblink` / FDW, or two round trips |
| Hosting cost | one instance | **one instance** | two instances, two backups, two monitors |
| Blast radius | shared | shared | isolated |

Three schemas take the structural isolation of separate databases and give back
the two things separate databases cost you: a second hosting bill, and native
cross-brand SQL.

```sql
-- group revenue, one query, no FDW
SELECT 'femi9' AS brand, SUM(total) FROM femi9."Order" WHERE status = 'paid'
UNION ALL
SELECT 'lumi9',          SUM(total) FROM lumi9."Order" WHERE status = 'paid';
```

Lumi9's schema will carry empty Thara / cycle / wall tables. That is harmless and
keeps a single migration path for both brands.

### Moving the live Femi9 data

Femi9's tables are in `public` today. Two options:

- **Leave them.** Point `DATABASE_URL_FEMI9` at `public`, add a `lumi9` schema.
  Zero touch, but permanently asymmetric — a footgun for whoever reads the config
  next.
- **Rename once (recommended).** `ALTER SCHEMA public RENAME TO femi9;` is a
  metadata-only DDL — instant, no table rewrite, and `_prisma_migrations` moves
  with it. Rollback is the inverse rename, equally instant.

**Gotcha:** any Postgres extension installed into `public` (`pgcrypto`,
`uuid-ossp`, `pg_trgm`) moves with the rename and will fall out of the default
`search_path`. Before renaming, check `\dx` and either relocate extensions to a
dedicated `extensions` schema or re-create an empty `public` and append it to the
search path. Do the rename in a short maintenance window with the rollback
rehearsed.

### Operational notes

- **Migrations run three times** — `prisma migrate deploy` once per brand URL, a
  CI loop. A deploy that migrates one brand but not the other leaves the platform
  inconsistent; make it one atomic CI step that fails the deploy on any failure.
- **Connection pools** — three pools against one instance. Sum the per-app pool
  sizes and keep the total under `max_connections`. On Neon/Supabase use the
  pooled URL with `?pgbouncer=true` for the app and the direct URL for
  migrations, exactly as `DIRECT_URL` does today.
- **Backups** are per-instance, so both brands restore together. If a brand ever
  needs independent point-in-time recovery, that is the trigger to split to two
  databases — the code does not change, only the URLs.

## Repository layout

```
femi9-platform/                    npm workspaces + Turborepo
  apps/
    femi9-web/     femi9-next storefront + account     (custom CSS)
    lumi9-web/     lumi9-web-main storefront + account (Tailwind v4)
    admin/         ONE console, two portals            (moved out of femi9-web)
  packages/
    db/            schema.prisma · migrations · seeds · dbFor(brand)
    core/          services(brand, …) · auth · razorpay · pricing · mail · brands.ts
    config/        eslint · tsconfig · zod env schema
```

Two storefront apps rather than one merged app because femi9 is hand-written CSS
and lumi9 is Tailwind v4 — Tailwind's preflight would reset femi9's styles.
Separate apps keep each design system intact and each brand on its own host.

## Brand configuration

```ts
// packages/core/brands.ts
export const BRANDS = {
  femi9: {
    name: 'Femi9', host: 'femi9.com', accent: '…',
    modules: ['catalog','orders','customers','inventory','pricing','coupons',
              'subscriptions','content','reviews','community','affiliates',
              'partners','thara','settings'],
  },
  lumi9: {
    name: 'Lumi9', host: 'lumi9.com', accent: '…',
    modules: ['catalog','orders','customers','inventory','pricing','coupons',
              'subscriptions','content','reviews','settings'],
  },
} as const
```

The admin nav renders from `modules`. A route outside the brand's list returns
**404, not 403** — Lumi9 staff should not learn that Thara exists.

## Admin authentication

Replaces the env-credential login in `app/api/admin/login/route.ts`
(`ADMIN_EMAIL` / `ADMIN_PASSWORD`).

```prisma
// schema "platform"
model AdminUser      { id, email @unique, passwordHash, name, active, mfaSecret?
                       memberships AdminBrandRole[] }
model AdminBrandRole { adminUserId, brand, role   @@unique([adminUserId, brand]) }
model AdminAuditLog  { id, adminUserId, brand, action, target, meta, at }
```

### The login form

Brand is a **segmented toggle at the top of the card**, above the fields:

```
┌───────────────────────────────────────────┐
│   ┌───────────────┬───────────────┐       │
│   │    Femi9      │     Lumi9     │       │   ← segmented control
│   └───────────────┴───────────────┘       │
│                                            │
│   Email      priya@company.com             │
│   Password   ••••••••                      │
│                                            │
│   [            Sign in            ]        │
└───────────────────────────────────────────┘
```

- Selecting a brand swaps the card's logo and accent colour, so staff can see
  which console they are entering before they type.
- The choice posts as a `brand` field alongside email and password.
- Last choice is remembered in `localStorage`, so ops who only ever use one brand
  never touch the toggle.
- `/admin/login?brand=lumi9` pre-selects, for bookmarks and invite links.

**The toggle is a convenience, never an authorisation.** `brand` arrives from the
client and is untrusted input: validate it against the `BRANDS` keys, then check
`AdminBrandRole` server-side for that admin. The button decides which console the
user is *asking* for; the database decides whether they get it.

### Sign-in flow

1. Parse and validate `brand` against the known brand keys. Anything else is a
   `400`, not a fallback to a default brand.
2. Look up `AdminUser` by email, verify the password with **argon2id**. (Today's
   code compares SHA-256 digests of env values — that goes away.)
3. Check `AdminBrandRole` for the requested brand. **No role → the identical
   "Invalid email or password."** Never leak which brands a person works on.
4. Mint `{ sub, brand, role, aud: 'admin' }` into cookie `admin_session_<brand>`
   — per-brand cookie names, so ops can hold Femi9 in one tab and Lumi9 in
   another.
5. Middleware compares the URL's brand segment against the JWT `brand` claim and
   rejects a mismatch. Every handler re-checks — middleware is the first gate,
   not the only one.
6. Someone holding roles in both brands gets a header switcher; no re-login.
7. Rate-limit per IP and globally, as `app/api/admin/login/route.ts` already does.

Roles: `owner` · `manager` · `support` · `readonly`, scoped per brand.

## Customer authentication

Unchanged in mechanism, duplicated per brand:

- Each storefront knows its own brand at build time — it is a single-brand app on
  a single host. No host sniffing needed, no brand in the URL.
- Cookie names `femi9_session` / `lumi9_session`. The separate hosts already
  isolate them, but keep **distinct JWT audiences** (`femi9-customer`,
  `lumi9-customer`) and **distinct `AUTH_SECRET` values per brand**, so a token
  is not replayable across brands even if a cookie is copied by hand.
- Lumi9 needs its own full auth stack — OTP, Google, account, checkout. It reuses
  `packages/core` services verbatim; only the storefront UI differs.

## Payments — two Razorpay accounts

- Per-brand keys: `RAZORPAY_KEY_ID_FEMI9` / `_LUMI9`, with secrets and webhook
  secrets likewise. A zod env schema in `packages/config` fails the boot rather
  than the checkout.
- Each storefront hosts its own webhook endpoint and verifies against its own
  brand's secret. A Lumi9 payment can never be signature-checked against Femi9's
  secret and silently dropped.
- The reconcile cron (`/api/cron/reconcile`) runs once per brand.

## Phased delivery

Phases 0–2 are invisible to users. All structural risk lands before anyone can
see it.

**Phase 0 — Workspace. ✅ DONE (0a) · ⏳ 0b outstanding.**

*0a — shipped.* npm workspaces + Turborepo at the repo root.
`femi9-next` → `apps/femi9-web`, `lumi9-web-main` → `apps/lumi9-web` (it was not
a git repo; it is now tracked here). One hoisted `package-lock.json`; the
per-app lockfiles are gone and `npm ci` runs only at the root.

Both apps build. What it took beyond the move:

- **`three` had to be single-versioned.** femi9 declared `^0.169`, lumi9
  `^0.185`. Hoisting gave `@react-three/fiber` the 0.169 `PerspectiveCamera`
  type and lumi9's own code the 0.185 one, and the cast in `FitCamera.tsx`
  stopped compiling. femi9 imports no three at all — its 3D stack is dead weight
  from an earlier iteration — so aligning it up to lumi9's versions was free.
  (Removing it entirely is a cleanup candidate; `next.config.mjs` still names it
  in `transpilePackages`.)
- **`outputFileTracingRoot` now points at the workspace root**, not the app.
  Hoisted dependencies live above the app, so an app-rooted trace would emit a
  standalone bundle with modules missing.
- **The Docker build context moved to the repo root** — `npm ci` needs the
  hoisted lockfile, which an app-scoped context cannot see. Build with
  `docker build -f apps/femi9-web/Dockerfile .`. The deps stage installs with
  `npm ci --workspace femi9-web --include-workspace-root` so Lumi9's tree never
  enters the Femi9 image (verified: femi9's full build tree present, every
  lumi9-only package absent).
- **The runtime layout was kept deliberately flat.** A workspace-rooted
  standalone build emits `.next/standalone/apps/femi9-web/server.js`; the runner
  stage flattens it back to `/app/server.js`, so the entrypoint, HEALTHCHECK,
  CMD and the ECS task definition are unchanged. `server.js` is entirely
  `__dirname`-relative, so this is safe.
- **A root `.dockerignore` is now load-bearing.** With a root context the whole
  repo is a build-context candidate — including `.env`, which `next build`
  traces into the standalone bundle when present.
- **CI and staging deploy repointed**, and a Lumi9 lint+build job added so the
  second storefront cannot break silently.

*0b — shipped.* femi9 Next 15.5.23 → **16.3.1**, pinned exactly to match lumi9,
so `next` now hoists to a single copy. Both apps build, and `turbo run build`
builds them together.

Most of the v16 breaking-change surface turned out not to apply:

- **Zero `next/image` usage** in femi9 (it has its own `OptImg`), so every image
  breaking change — `minimumCacheTTL`, `imageSizes`, `qualities`, local images
  with query strings, `images.domains` — was moot.
- **No `images`, `webpack`, `eslint` or `turbopack` keys** in `next.config.mjs`,
  so there was no config to migrate.
- **Turbopack is now the default builder and it worked first try.** The guide
  warns that a plugin-injected webpack config fails the build; Sentry 10.70 is
  Turbopack-compatible and ran its `runAfterProductionCompile` source-map hook
  normally.
- **`next lint` was removed upstream** and `next build` no longer lints. This app
  has never had an ESLint config, so the script was already a no-op and was
  dropped rather than left pretending to work. Giving femi9 real linting is
  worthwhile and is its own task.
- **Turbo needed `packageManager` in the root manifest** — without it every
  `turbo run` fails with "Could not resolve workspace". So `turbo` had in fact
  never run until this phase.

### Open decision: `middleware.ts` → `proxy.ts`

Next 16 deprecates the `middleware` file convention in favour of `proxy`, and
femi9 prints that warning on every build. **We did not migrate**, because it is
not a rename:

> The `edge` runtime is **NOT** supported in `proxy`. The `proxy` runtime is
> `nodejs`, and it cannot be configured.

`middleware.ts` is deliberately edge-shaped: it hand-rolls HS256 verification
with Web Crypto, avoiding any Node or `server-only` import, and that duplicated
verifier is the file's whole design. Switching to `proxy` moves the auth gate to
the Node runtime — a behavioural change on the most security-sensitive path in
the app, which did not belong in a version-alignment commit.

The argument **for** migrating, when it is taken up:

- Femi9 deploys to **ECS Fargate as a standalone Node server**. There is no edge
  network in front of it, so the edge runtime buys nothing here — it only
  imposes constraints.
- On the Node runtime the guard could `import { verifySession }` from
  `src/lib/auth.ts` directly, deleting the inline re-implementation. That kills
  the standing hazard recorded in `CLAUDE.md`: *the same check written twice, and
  changing one means changing the other.*

That makes this a natural companion to **Phase 1**, where the auth helpers move
into `packages/core` and want a single implementation anyway. Until then the
deprecation warning is expected, not a defect.

**Phase 1 — Extract core.** `prisma/` → `packages/db`, `src/lib` +
`src/lib/services` → `packages/core`. Every service signature gains `brand` as
its first parameter, resolving its client via `dbFor(brand)`. femi9-web imports
from core. Vitest suite green. *No schema change to the live database.*

**Phase 2 — Schemas + unified admin. ⏳ IN PROGRESS.**

*Shipped:* the platform schema and admin identity (`@femi9/db-platform`:
`AdminUser` · `AdminBrandRole` · `AdminAuditLog`), and `apps/admin` — brand
toggle login, `proxy.ts` guard on the Node runtime, module-gated nav, per-brand
cookies and audiences, `create-admin` script. 21 tests.

Two deviations from this document, both deliberate:

- **scrypt, not argon2id.** Every argon2 binding for Node is native; this image
  is Alpine built from a workspace root, and a prebuilt resolving to the wrong
  libc is a deploy failure on the one endpoint that must never be down. The
  encoded hash names its own algorithm and cost, so argon2id can be adopted
  later and old hashes upgraded on next sign-in.
- **`proxy.ts`, not `middleware.ts`,** for the admin app — it is Next 16's
  convention and runs on Node, so the guard calls the same `verifyAdminSession`
  the handlers do. That is the duplication the storefront still carries.

*Not run:* the `public` → `femi9` rename. It is the only step that touches live
data, so it waits for a human. It has been **rehearsed end-to-end** against a
local copy — 49 tables moved, data intact, Prisma "already in sync" against
`?schema=femi9`, `dbFor('lumi9')` provably unable to read Femi9's rows, and the
rollback verified and re-applied. See `docs/RENAME-RUNBOOK.md`.

*Remaining:* move the 15 admin pages and 33 admin routes out of femi9-web into
`apps/admin`, and retire the env-credential login there.

**Phase 2 (original plan) — Schemas + unified admin.** Rename `public` → `femi9`, create `lumi9`
and `platform`. Move the 15 admin pages and 33 admin routes into `apps/admin`.
Seed the current admin as an `AdminUser` with a femi9 `owner` role, retire the
env credentials. Brand toggle login, brand-scoped session, module-gated nav,
per-brand theme. `/admin` on femi9-web 301s to the admin host.

**Phase 3 — Lumi9 data + catalog.** Migrate the `lumi9` schema, seed the catalog
from `lumi9-web-main/src/lib/catalog.ts` (NB · S · M · L · XL × pack tiers →
`Product` + `ProductVariant`). Seed Lumi9 price zones. Enable the Lumi9 admin
modules — ops can manage a real Lumi9 catalog before the storefront is wired.

**Phase 4 — Lumi9 storefront goes live.** Replace the localStorage cart
(`src/lib/cart.tsx`) with the cart API, wire checkout → Razorpay, wire OTP/Google
auth, make `AccountDashboard.tsx` read real orders, move the placeholder journal
content out of `lib/content.ts` into the CMS.
**Set `SEED_DEMO_CART = false`.**

**Phase 5 — Group layer.** A cross-brand analytics dashboard in the admin
(`UNION ALL` across schemas), consolidated exports, group-level audit view.

## Risks

1. **The `public` → `femi9` rename** — instant, but check installed extensions
   first (see above) and rehearse the rollback.
2. **Two Razorpay accounts** — per-brand webhook secrets are mandatory, not
   optional. Getting it wrong loses paid orders silently.
3. **Email per brand** — Resend domain, DKIM, `EMAIL_FROM`, and every template
   duplicated per brand.
4. **Regional pricing** — `PriceZone` seeding and the GeoIP path are Femi9-shaped
   today; Lumi9 needs its own zones seeded in Phase 3.
5. **Migrations run three times** — one atomic CI step, failing the deploy on any
   schema's failure.
6. **Connection pools** — three pools on one instance; sum them against
   `max_connections`.
7. **Env sprawl** — every provider variable doubles. The zod env schema in
   `packages/config` is the guard.
8. **Next 15.5 → 16.3 upgrade on femi9** — a real upgrade with breaking changes,
   scheduled in Phase 0 while nothing else is moving.
9. **Deploy pipeline rewrite** — `.github/workflows/deploy.yml`, the `Dockerfile`
   and `docker-compose.yml` all assume a single app at the repo root.
10. **Shared backups** — both brands restore together. Independent PITR per brand
    is the one trigger to split to two databases later.

## Open items

- Admin host name (`admin.femi9group.com`?)
- Whether Lumi9 needs subscriptions at launch, or catalog + one-off orders only
- Lumi9 journal: reuse `BlogPost` / `BlogCategory`, or keep it static
- Whether a mobile app is on the roadmap — the one thing that would justify
  extracting a real `api.` service
