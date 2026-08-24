# CLAUDE.md — Lumi9 web (`apps/lumi9-web`)

Lumi9 ("Cloud Soft") — baby diapers. Next 16 · React 19 · **Tailwind v4** ·
react-three-fiber for the mascot. Runs on `:3001`.

## Where this app is in the migration

**This storefront runs on the shared backend.** Catalogue, cart, sign-in,
checkout and account are all real; `src/lib/content.ts` still supplies marketing
copy and the loyalty stats.

**The CATALOGUE comes from the database.** `src/lib/catalog.ts` is the seed's
input, not the storefront's source: a server loader reads the `lumi9` schema and
a provider hands it to client components. Cart, checkout and auth are still
local — those are the rest of Phase 4.

So right now:

| | |
| --- | --- |
| Catalogue in the database | ✅ 5 sizes · 12 pack variants · price zones |
| Manageable in the console | ✅ `/lumi9/products` |
| **Read by THIS app** | ✅ **live — a console price change shows without a rebuild** |
| Cart | ✅ server-side, in `lumi9.Cart`, priced by the server |
| Sign-in | ✅ emailed link — no passwords on this platform |
| Checkout + payment | ✅ real orders (`LM-00001`), Razorpay, brand-routed webhook |
| Account orders | ✅ real — only the loyalty stats are still placeholder copy |

## How the catalogue reaches the page

```
lumi9 schema ──▶ getCatalog('lumi9')      @femi9/core, brand-agnostic rows
             ──▶ loadCatalog()            catalog.server.ts — maps to Lumi9's shape
             ──▶ <CatalogProvider>        root layout, ONE query per request
             ──▶ useCatalogData()         every client component
```

`useCatalogData()` returns the sizes AND `getSize` / `getSizeOrDefault` as plain
closures, deliberately — those are called inside event handlers and `useMemo`
bodies, where a hook cannot go.

**The whole tree is `force-dynamic`.** Two reasons, and the second is the one
that bites: a console price change must not wait for a rebuild, and the Docker
build stage has NO database credentials. Prerendering the catalogue would make
the build require a database, which it cannot have. If SSR-per-request becomes
a cost, cache the read behind a tag the console invalidates — do not go back to
build-time data.

## The seeds

`prisma/` here holds **seed data only** — the schema and migrations are shared,
in `packages/db`. Seed data is brand-specific, which is why it lives with the app
(Femi9 does the same).

```bash
DATABASE_URL_LUMI9="postgresql://…/db?schema=lumi9" npm run db:seed
DATABASE_URL_LUMI9="…" npm run db:seed-zones
```

`prisma/seed.ts` reads `src/lib/catalog.ts` and writes one `Product` per size
with a `pack` variant per tier. Slugs (`cloud-soft-m`) and SKUs (`LUMI9-M-24`)
are stable, so reruns update in place rather than duplicating.

That module is the seed's **input** only — the storefront reads the database.
Editing it changes what a fresh seed writes and nothing that is already live.

## Deploying

`Dockerfile` here, built from the WORKSPACE ROOT:

```bash
docker build -f apps/lumi9-web/Dockerfile -t lumi9-web .
```

`Dockerfile.dockerignore` beside it governs that build — BuildKit prefers it
over the context root's, which is necessary because the root file excludes
`apps/lumi9-web/**` and would otherwise produce an image with no app in it.

`docker-entrypoint.sh` creates the `lumi9` schema if it is missing, applies the
shared migration history to it, then starts the server. It sets `DATABASE_URL`
for the migrate command ALONE and never exports it: `dbFor('femi9')` accepts a
bare `DATABASE_URL` as Femi9's transitional fallback, so exporting it inside
this image would let a stray Femi9 read quietly succeed against Lumi9's data.

The image carries the seed scripts under `./seed/` but does NOT run them. They
are launched as a one-off ECS task with the command overridden — see
`infra/terraform/README.md`.

`/api/health` fails closed: 503 when the `lumi9` schema is unreachable or
`AUTH_SECRET` is missing, 200 with a `warnings` array when only a feature is
switched off. That distinction is in `@femi9/core/brand-readiness`, and it
matters — a missing webhook secret must not pull the task out of the load
balancer and turn a degraded feature into an outage.

## Things that will bite

**`Product.flow` is Femi9's word.** It means "Heavy · Night + Day" over there;
there is no period flow on a diaper. Lumi9 uses the same column for what the
product is rated for (`7–12 kg · up to 12h dryness`). Renaming the column to
something brand-neutral is worth doing one day — it was not worth doing in the
same change that first filled it.

**Lumi9 sells `diaper`, and only that.** The `ProductType` enum is shared, but
`brandConfig('lumi9').productTypes` is `['diaper']`, the console's form renders
its options from that list, and the product routes reject anything outside it.
A shared enum without that check would happily file a sanitary pad under Lumi9.

**`three` must stay version-matched with femi9-web.** Two copies in the workspace
gives `@react-three/fiber` one `PerspectiveCamera` type and this app another, and
the casts in `src/components/three/` stop compiling.

**`SEED_DEMO_CART` in `src/lib/cart.tsx` is already `false`.** The README still
warns you to turn it off; that warning is stale. Leave it off — the cart screens
are reviewable by adding an item, and a basket pre-filled with phantom lines is
worse than an empty one now that the prices beside them are real.

**Nothing here may import a package this app does not declare.** `@femi9/core`
is shared source, not a built artifact, so its imports become this app's
imports. The image build is where that surfaces: `npm ci --workspace lumi9-web`
installs only this workspace's closure, unlike the root `npm install` that
makes everything look fine locally.
