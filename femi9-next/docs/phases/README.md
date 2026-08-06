# Femi9 Backend — Phase Plan (execution specs)

This folder is the **split-out, executable phase plan**. Each file is a detailed
implementation spec for one phase — files to create/edit, endpoints/functions,
data touched, edge cases, and a testable acceptance check per task. They are
grounded against the real `prisma/schema.prisma` and note any schema additions a
phase needs before feature code.

Companion documents: `../../../Femi9-Backend-PRD.pdf` (the what/why) and
`../../../Femi9-Backend-Tasks.md` (the epic/task tracker with ✓ boxes).

## Status

| Phase | Spec | Status |
|-------|------|--------|
| **Phase 0 — Foundation** | (delivered inline) | ✅ **Done** — Next.js migration, Postgres + Prisma schema, seed, and the read-side API layer are live and verified |
| Phase 1 — Auth & accounts | [`phase-1-auth.md`](./phase-1-auth.md) | 📋 Spec ready |
| Phase 2 — Commerce + Razorpay | [`phase-2-commerce.md`](./phase-2-commerce.md) | 📋 Spec ready |
| Phase 3 — Custom admin | [`phase-3-admin.md`](./phase-3-admin.md) | 📋 Spec ready |
| Phase 4 — Growth programs | [`phase-4-programs.md`](./phase-4-programs.md) | 📋 Spec ready |
| Phase 5 — Lifecycle & content | [`phase-5-lifecycle.md`](./phase-5-lifecycle.md) | 📋 Spec ready |

## What Phase 0 delivered (already in the codebase)

- **Next.js app** (`femi9-next/`) — the whole storefront migrated from the Vite SPA, verified route-for-route.
- **Database** — PostgreSQL + Prisma, 31-model schema (PRD §6), initial migration, and a seed that migrates all existing content. Both original data-bugs fixed (variant-aware lines; id foreign keys).
- **Read-side API layer** (all returning live seeded data):
  - `GET /api/products`, `GET /api/products/[slug]`
  - `GET /api/blog`, `GET /api/blog/[slug]`
  - `GET /api/settings` (replaces hardcoded `FREE_SHIP`/`SUBSCRIBE_PCT`/`WA_NUMBER`)
  - `GET/POST /api/cart`, `PATCH/DELETE /api/cart/items/[variantId]` (guest cart, server-recomputed prices, variant-aware)
  - `GET /api/health`, `POST /api/events`
  - Services under `src/lib/services/*` are the single seam between DB and UI.
- **First page cutover** — `/product/[id]` is now a server component rendering from Postgres.

## Remaining cutover (Phase 0 tail, no external accounts needed)

The storefront's **other** pages (Home grid, blog list/post, cart drawer) still
read the static `src/data/*` files; the APIs/services to replace them now exist.
Cutting them over is the next low-risk step before Phase 1.

## Deployment target (AWS — founder-action)

Compute: **ECS Fargate + ALB/CloudFront**. Database: **Aurora Serverless v2**
(`ap-south-1`, Mumbai) via RDS Proxy. Local Postgres is used for development; the
schema/seed deploy to Aurora unchanged. See each spec's founder-action blockers.
