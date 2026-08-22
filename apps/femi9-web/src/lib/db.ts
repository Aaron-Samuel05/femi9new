import { dbFor, type Brand } from '@femi9/db'

/** This app is Femi9's storefront: single brand, fixed at build time. */
const BRAND: Brand = 'femi9'

/**
 * Femi9's Prisma client.
 *
 * TRANSITIONAL. The client itself now lives in `@femi9/db`, which builds one per
 * brand from a shared schema. This module keeps the import path that ~80 call
 * sites in this app already use, so moving the schema out did not touch them.
 *
 * As Phase 1 threads `brand` through the service layer, each service should call
 * `dbFor(brand)` itself and stop importing this. When nothing imports it, delete
 * it.
 *
 * ── Why the Proxy ──────────────────────────────────────────────────────────
 * It is deliberately LAZY. The previous version called `new PrismaClient()` at
 * module scope, which was safe because Prisma resolves its connection string at
 * connect time, not construction. `dbFor()` takes an explicit `datasourceUrl`,
 * so it needs `DATABASE_URL` to already be present — and the Docker build stage
 * has no database credentials at all (they are injected at deploy time from
 * Secrets Manager). Constructing eagerly would throw during `next build` in the
 * image. Deferring to first property access keeps the build credential-free
 * while every real call site still gets a client.
 */
let client: ReturnType<typeof dbFor> | undefined

export const prisma = new Proxy({} as ReturnType<typeof dbFor>, {
  get(_target, property) {
    client ??= dbFor(BRAND)
    // `client` as the receiver, so methods keep their own `this` rather than
    // binding to the empty proxy target.
    return Reflect.get(client, property, client)
  },
})
