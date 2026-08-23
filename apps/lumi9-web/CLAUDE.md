# CLAUDE.md — Lumi9 web (`apps/lumi9-web`)

Lumi9 ("Cloud Soft") — baby diapers. Next 16 · React 19 · **Tailwind v4** ·
react-three-fiber for the mascot. Runs on `:3001`.

## Where this app is in the migration

**The storefront still renders from `src/lib/catalog.ts` and `src/lib/content.ts`,
not from the database.** Phase 3 gave Lumi9 real data — its own Postgres schema,
its catalogue seeded, and a working console — but nothing here reads it yet.
Wiring this app to the backend is Phase 4.

So right now:

| | |
| --- | --- |
| Catalogue in the database | ✅ 5 sizes · 12 pack variants · price zones |
| Manageable in the console | ✅ `/lumi9/products` |
| Read by THIS app | ❌ still the hardcoded modules |
| Cart / checkout / auth | ❌ localStorage and local state |

## The seeds

`prisma/` here holds **seed data only** — the schema and migrations are shared,
in `packages/db`. Seed data is brand-specific, which is why it lives with the app
(Femi9 does the same).

```bash
DATABASE_URL_LUMI9="postgresql://…/db?schema=lumi9" npm run db:seed
DATABASE_URL_LUMI9="…" npm run db:seed-zones
```

`prisma/seed.ts` reads `src/lib/catalog.ts` — the same module the storefront
renders from — and writes one `Product` per size with a `pack` variant per tier.
Slugs (`cloud-soft-m`) and SKUs (`LUMI9-M-24`) are stable, so reruns update in
place. Once Phase 4 lands, that file becomes the seed's *input* only and the
database becomes the truth.

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

**`SEED_DEMO_CART` in `src/lib/cart.tsx` is still `true`** — it fakes three line
items so the cart and checkout screens are reviewable. **Turn it off before real
shoppers see this app.**
