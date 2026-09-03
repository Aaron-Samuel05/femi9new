/**
 * READ-ONLY recovery diagnostic, run as a one-off task — never part of `db:seed`.
 *
 * `prisma/seed.ts` was mistakenly re-run against production to backfill
 * `weightKg` and, as its own comment warns, reset every variant's `price` /
 * `mrp` / `discountPct` to the plain catalog.ts list price on the way,
 * wiping out a discount that had been set in the console.
 *
 * This dumps each variant's row from whatever database `RECOVERY_DB_HOST`
 * points at — a point-in-time-restored COPY of the cluster, never the live
 * one. It never reads `DATABASE_URL_LUMI9` as a connection string directly:
 * it takes that value (already injected from Secrets Manager) and swaps only
 * the hostname, so the same credentials reach the recovery copy without this
 * script ever handling a password itself, and without a `RECOVERY_DB_HOST`
 * typo silently falling back to querying production.
 */
import { PrismaClient } from '@prisma/client'

const base = process.env.DATABASE_URL_LUMI9
const recoveryHost = process.env.RECOVERY_DB_HOST
if (!base) throw new Error('DATABASE_URL_LUMI9 is not set')
if (!recoveryHost) throw new Error('RECOVERY_DB_HOST is not set')

const url = new URL(base)
url.hostname = recoveryHost
const prisma = new PrismaClient({ datasources: { db: { url: url.toString() } } })

async function main() {
  const variants = await prisma.productVariant.findMany({
    include: { product: { select: { name: true } } },
    orderBy: [{ product: { name: 'asc' } }, { packCount: 'asc' }],
  })
  console.log('RECOVERED_PRICES_START')
  for (const v of variants) {
    console.log(
      JSON.stringify({
        product: v.product.name,
        label: v.label,
        sku: v.sku,
        price: v.price,
        mrp: v.mrp,
        discountPct: v.discountPct,
      }),
    )
  }
  console.log('RECOVERED_PRICES_END')
  await prisma.$disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
