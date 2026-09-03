/**
 * ONE-TIME repair, run as a one-off task — not part of `db:seed`, and safe to
 * delete once it has run successfully in production.
 *
 * `prisma/seed.ts` was mistakenly re-run against production to backfill
 * `weightKg` and, per its own comment, reset every variant's `price`/`mrp`/
 * `discountPct` to the plain catalog.ts list price on the way — wiping the 10%
 * discount that had been set in the console. The real values were read back
 * off a point-in-time-restored copy of the database via
 * `inspect-variant-prices.ts`; this writes exactly those values back, keyed by
 * SKU, and touches no other column (`weightKg` from the earlier reseed is
 * untouched).
 *
 * Uses `chargedPrice`, the SAME derivation the admin console itself calls when
 * an operator saves a discount, so the restored `price` is not a second,
 * independent calculation that could disagree with it.
 */
import { PrismaClient } from '@prisma/client'
import { chargedPrice } from '@femi9/core/services/admin/products'

const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_LUMI9 } } })

const RECOVERED: { sku: string; mrp: number; discountPct: number }[] = [
  { sku: 'LUMI9-NB-3', mrp: 39, discountPct: 10 },
  { sku: 'LUMI9-NB-24', mrp: 291, discountPct: 10 },
  { sku: 'LUMI9-NB-54', mrp: 594, discountPct: 10 },
  { sku: 'LUMI9-S-3', mrp: 42, discountPct: 10 },
  { sku: 'LUMI9-S-24', mrp: 315, discountPct: 10 },
  { sku: 'LUMI9-S-54', mrp: 654, discountPct: 10 },
  { sku: 'LUMI9-M-24', mrp: 342, discountPct: 10 },
  { sku: 'LUMI9-M-54', mrp: 708, discountPct: 10 },
  { sku: 'LUMI9-L-24', mrp: 366, discountPct: 10 },
  { sku: 'LUMI9-L-54', mrp: 765, discountPct: 10 },
  { sku: 'LUMI9-XL-24', mrp: 393, discountPct: 10 },
  { sku: 'LUMI9-XL-54', mrp: 822, discountPct: 10 },
]

async function main() {
  for (const row of RECOVERED) {
    const price = chargedPrice(row.mrp, row.discountPct)
    const before = await prisma.productVariant.findUnique({
      where: { sku: row.sku },
      select: { price: true, mrp: true, discountPct: true },
    })
    if (!before) {
      console.error(`SKIP ${row.sku}: no such variant`)
      continue
    }
    await prisma.productVariant.update({
      where: { sku: row.sku },
      data: { price, mrp: row.mrp, discountPct: row.discountPct },
    })
    console.log(
      `${row.sku}: price ${before.price}->${price}, mrp ${before.mrp}->${row.mrp}, discountPct ${before.discountPct}->${row.discountPct}`,
    )
  }
  await prisma.$disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
