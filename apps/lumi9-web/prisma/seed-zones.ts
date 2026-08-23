/**
 * Lumi9's regional pricing zones.
 *
 * Zones are per-brand data in a shared table shape — Lumi9 needs its own
 * because a discount that makes sense on period care need not make sense on
 * diapers, and because the two live in different Postgres schemas anyway.
 *
 * Every catalog needs a DEFAULT zone: it is the price a visitor sees when we
 * cannot place them, which is most first-time visitors. Without one, pricing
 * falls back to basePrice with no record of why.
 *
 *   DATABASE_URL_LUMI9=postgresql://…/db?schema=lumi9 npm run db:seed-zones
 */
import { dbFor } from '@femi9/db'

const BRAND = 'lumi9' as const

async function main() {
  const db = dbFor(BRAND)

  const def = await db.priceZone.upsert({
    where: { name: 'Default' },
    create: { name: 'Default', discountPct: 0, isDefault: true, position: 0 },
    update: { isDefault: true },
  })

  // Starts at parity. Ops can set a real discount, or exact per-product prices,
  // from the console — the zone existing is what matters here.
  const tn = await db.priceZone.upsert({
    where: { name: 'Tamil Nadu' },
    create: { name: 'Tamil Nadu', discountPct: 0, isDefault: false, position: 1 },
    update: {},
  })
  await db.zoneRegion.upsert({
    where: { kind_value: { kind: 'state', value: 'Tamil Nadu' } },
    create: { zoneId: tn.id, kind: 'state', value: 'Tamil Nadu' },
    update: { zoneId: tn.id },
  })

  const zones = await db.priceZone.findMany({
    include: { _count: { select: { regions: true } } },
    orderBy: { position: 'asc' },
  })
  console.log(
    'Lumi9 zones: ' +
      zones
        .map(
          (z) =>
            `${z.name} (${z.discountPct}% off, ${z._count.regions} region(s)${z.isDefault ? ', DEFAULT' : ''})`,
        )
        .join('  |  '),
  )
  void def
  await db.$disconnect()
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exitCode = 1
})
