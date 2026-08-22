import { dbFor, type Brand } from '@femi9/db'

/**
 * ⚠️ TRANSITIONAL — A FEMI9-PINNED CLIENT INSIDE A SHARED PACKAGE. ⚠️
 *
 * This is the one piece of `@femi9/core` that is NOT brand-agnostic, and it is
 * scaffolding, not design. Phase 1b moved the service layer here with its
 * signatures unchanged; every service still reaches for this hard-pinned Femi9
 * client. Phase 1c threads `brand` through those signatures so each one calls
 * `dbFor(brand)` itself — and then this file is deleted.
 *
 * ── Do not build on it ──────────────────────────────────────────────────────
 * Anything new, and ANY code the admin console will run, must take `brand` and
 * call `dbFor(brand)`. A second brand importing `prisma` from here would read
 * Femi9's database while believing it was reading its own — which is precisely
 * the failure the per-brand connection was chosen to make impossible. The
 * remaining importers are the pre-existing Femi9 call sites, and the count only
 * goes down.
 *
 * ── Why the Proxy ──────────────────────────────────────────────────────────
 * It is deliberately LAZY. The original called `new PrismaClient()` at module
 * scope, which was safe because Prisma resolves its connection string at connect
 * time, not construction. `dbFor()` takes an explicit `datasourceUrl`, so it
 * needs `DATABASE_URL` to already be present — and the Docker build stage has no
 * database credentials at all (they are injected at deploy time from Secrets
 * Manager). Constructing eagerly would throw during `next build` inside the
 * image. Deferring to first property access keeps the build credential-free
 * while every real call site still gets a client.
 */
const BRAND: Brand = 'femi9'

let client: ReturnType<typeof dbFor> | undefined

export const prisma = new Proxy({} as ReturnType<typeof dbFor>, {
  get(_target, property) {
    client ??= dbFor(BRAND)
    // `client` as the receiver, so methods keep their own `this` rather than
    // binding to the empty proxy target.
    return Reflect.get(client, property, client)
  },
})
