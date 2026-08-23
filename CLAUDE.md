# CLAUDE.md — femi9-platform

Workspace root. Two consumer brands, one shared backend.

## The map

```
apps/
  femi9-web/    Femi9 storefront + account + (for now) the ops console.
                Next 15.5 · hand-written CSS · Prisma/Postgres · LIVE.
                Has its own CLAUDE.md — read it before touching this app.
  lumi9-web/    Lumi9 storefront. Next 16.3 · Tailwind v4.
                Frontend only: no backend, no database, cart in localStorage.
  admin/        ONE console, both brands. :3002. Has its own CLAUDE.md.
                Brand comes from the SESSION, never the URL segment.
                Holds ALL the ops pages and APIs — femi9-web has none.
packages/
  db/           @femi9/db — the shared Prisma schema and `dbFor(brand)`.
                One schema, one client per brand. Seeds are NOT here: seed data
                is brand-specific and lives with each app.
  db-platform/  @femi9/db-platform — admin identity in its OWN schema, which
                neither brand's client can reach. Generates to `generated/`
                (gitignored) because the brand client owns the default output.
  core/         @femi9/core — the shared backend. 64 modules: the whole
                service layer, auth, Razorpay, pricing, geo, OTP, Thara.
                Import by SUBPATH, never from a barrel:
                  import { requireAdmin } from '@femi9/core/admin-auth'
                  import { getOrders } from '@femi9/core/services/admin/orders'
```

Everything else at this root is **dead**: `femi9-app/`, `femi9-react/`,
`femi9-scrool/`, `femi9-lavender/`, `index.html`, `app.js`, `styles.css`,
`assets/`, `Images/`. Superseded by `apps/femi9-web`. Never read them for
patterns, never edit them. The PDFs are product docs and are worth consulting.

## Where the plan lives

`apps/femi9-web/docs/TWO-BRAND-ARCHITECTURE.md` is the agreed design and the
phase list. Read it before any structural work. The short version:

- Separate domains, **fully separate customer bases** (no shared `User`).
- "One backend" means **one shared `packages/core`**, not an extracted API
  service — App Router server components read Postgres directly and must keep
  doing so.
- **One Postgres, three schemas**: `femi9` · `lumi9` · `platform`. Isolation
  lives in the connection string, so a brand cannot read another's rows.
- The admin console picks its brand with a **segmented toggle on the login
  form**. That toggle is untrusted client input — `AdminBrandRole` decides.

## Database access

```ts
import { dbFor, isBrand, type Brand } from '@femi9/db'
const db = dbFor('femi9')
```

Isolation lives in the **connection string**, not in a `where` clause somebody
can forget — each brand's client is bound to its own Postgres schema. `isBrand()`
has no default: narrow untrusted input through it, and take brand from the
session or the host, never from a request body.

`DATABASE_URL` still works for Femi9 as a transitional fallback — the live data
is in `public` and Phase 2 does the rename. Lumi9 has no fallback on purpose.

## Commands

```bash
npm install          # ALWAYS here. One hoisted lockfile; apps have none.
npm run dev:femi9    # :3000
npm run dev:lumi9    # :3001
npm run dev:admin    # :3002
npm run build        # turbo — both apps
npm run typecheck
```

`npm ci` only works at this root. There is no app-level `package-lock.json`.

## Things that will bite

**Docker builds from THIS directory**, not from the app:
```bash
docker build -f apps/femi9-web/Dockerfile -t femi9-web .
```
The context must be the workspace root because `npm ci` needs the hoisted
lockfile. `.dockerignore` here is load-bearing — it is what keeps `.env`, the
legacy prototypes and the other brand's source out of the image.

**`three` must stay single-versioned across the workspace.** Two copies gives
`@react-three/fiber` one `PerspectiveCamera` type and an app another, and casts
between them fail to compile. femi9-web declares the 3D stack but imports none
of it; its versions exist only to match lumi9-web.

**Both apps are pinned to Next 16.3.1 exactly**, so `next` hoists to a single
copy. Keep them in lockstep — a version split un-hoists Next and reintroduces
the dual-`three` class of type clash.

**Turbo needs `packageManager` in the root package.json.** Without it every
`turbo run` fails with "Could not resolve workspace". Turborepo also collects
anonymous telemetry by default; set `TURBO_TELEMETRY_DISABLED=1` to opt out.

**femi9-web still uses the `middleware` file convention**, which Next 16
deprecates in favour of `proxy`. It is kept deliberately: `proxy` runs on the
Node runtime only, and this middleware is hand-written to be edge-compatible.
Every build prints a deprecation warning until that decision is revisited.

**`apps/femi9-web/.github/workflows/deploy.yml` is inert.** GitHub only runs
workflows from `<repo>/.github/workflows`. It has never executed. The two that
DO run are `ci.yml` and `deploy-staging.yml` at this root.

**`npm test` in femi9-web truncates every table.** Never run it against a `.env`
pointing at staging or production. Both suites are safe against local scratch
databases — see each app's CLAUDE.md.

**Two Prisma generators, two output paths.** A fresh clone or Docker build must
run `prisma generate` for `@femi9/db` AND `@femi9/db-platform`; the second uses
a package-local `generated/` directory so the two do not overwrite each other.

**The `public` → `femi9` schema rename has NOT been run** against the live
database. Femi9 still reads `DATABASE_URL`. See
`apps/femi9-web/docs/TWO-BRAND-ARCHITECTURE.md` and `docs/rename-public-to-femi9.sql`.
