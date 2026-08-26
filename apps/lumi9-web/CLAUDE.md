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

## The Journal, and where SEO lives

`/journal` and `/journal/[slug]` are Lumi9's blog. They follow Femi9's blog
layout — hero, featured mosaic, category chips over a filtered grid, then an
article page of cover + body + FAQ + related reads — rebuilt on this app's
Tailwind tokens rather than Femi9's hand-written CSS.

**The posts are in `src/lib/journal.ts`, not the database.** Femi9's journal
reads `@femi9/core/services/blog`, which is brand-agnostic and would work here
with `listPosts('lumi9')`. It is not wired up yet because the storefront would
then show nothing until somebody seeded the `lumi9` schema. The module's shape
mirrors `BlogPostDTO` deliberately, and its loaders carry the same names
(`listPosts` / `getPost` / `listCategories` / `relatedPosts`), so moving to the
database is a change of import in two pages and a delete of one array.

The fields the DTO has no column for — `metaTitle`, `keywords`, `faqs`,
`imageAlt` — drive `<head>` and JSON-LD, not the card. A DB migration that adds
the journal will need them too.

**Body blocks are a tiny markdown subset**, rendered by
`components/journal/ArticleBody.tsx`: `## `, `### `, `> `, `• ` and `1. ` lists,
plus inline `**bold**` and `[label](href)`. A list is ONE block with embedded
newlines — the renderer splits it, because a `<p>` would let HTML whitespace
collapsing eat every separator. No HTML is ever interpreted.

**`src/lib/seo.ts` owns the origin.** Canonicals, Open Graph URLs, `sitemap.xml`,
`robots.txt` and every JSON-LD `@id` resolve through `SITE_URL`, so one variable
moves the whole site between staging and production.

```
SITE_URL=https://thelumi9.com     # server-only, read at RUNTIME
```

It is deliberately NOT a `NEXT_PUBLIC_` name. Next inlines every
`NEXT_PUBLIC_*` reference at build time and the Docker build stage has no deploy
configuration, so a public variable would bake whatever the build happened to
see into the image — and `robots.ts`'s staging guard could never fire. Nothing
in `seo.ts` is imported by a client component. `NEXT_PUBLIC_SITE_URL` is still
honoured as a fallback because the email-link verifier already reads it.

`CANONICAL_ORIGIN` in that file is the production domain from the SEO brief
(`thelumi9.com`). The Terraform examples still say `shop.lumi9.in` — **if the
site ships on lumi9.in instead, change that one constant**, or every canonical
tag will point at a domain that does not serve the page.

**Any origin that is not `CANONICAL_ORIGIN` serves `Disallow: /` and `noindex`.**
Both, not either: robots.txt keeps a crawler out, and the meta tag is the only
thing that removes a URL already indexed — which a crawler can only read on a
page robots.txt let it fetch.

**FAQ answers must stay in the DOM.** `ui/Accordion` hides collapsed panels with
the `hidden` attribute instead of unmounting them, and the article FAQ is a
plain `<dl>`. FAQPage structured data whose answers a crawler cannot find in the
document is a manual-action risk, not a shortcut to a rich result. Whatever
replaces either component has to keep that property.

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

**The nav is ONE row below `md`, and `--nav-h` is load-bearing.** The links live
behind a burger in a slide-down sheet; the bar used to wrap them onto a second
scrolling line and stood 118px tall on a phone, fixed, over an 844px viewport.
`--nav-h` is published by the nav's ResizeObserver and is what `scroll-padding-top`
in `globals.css` offsets every in-page anchor by — so never add `scroll-mt-*` to
an anchor target as well, or it lands a whole screen too low.

**A `backdrop-filter` element is a backdrop root; nesting one inside it does
nothing.** The nav carries `backdrop-blur`, so the menu sheet's own blur sampled
the nav's (transparent) content rather than the page and the hero read straight
through the menu. The sheet is opaque for that reason. The same trap ate the
sheet's scrim: as a child of the nav its negative z-index put it behind that
backdrop root and it never painted at all — it is a SIBLING of the bar, at z-90.

**Nothing here may import a package this app does not declare.** `@femi9/core`
is shared source, not a built artifact, so its imports become this app's
imports. The image build is where that surfaces: `npm ci --workspace lumi9-web`
installs only this workspace's closure, unlike the root `npm install` that
makes everything look fine locally.
