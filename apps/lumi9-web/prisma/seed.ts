/**
 * Seed Lumi9's catalog into the `lumi9` schema.
 *
 * The SHAPE of the data is shared with Femi9 - one `schema.prisma` in
 * packages/db - but the DATA is not, which is why this seed lives with the app
 * rather than beside the schema. Femi9's seed does the same with its own
 * catalog.
 *
 * `src/lib/catalog.ts` is this seed's INPUT. The storefront no longer reads it -
 * it reads the database, through `catalog.server.ts`. So editing that module
 * changes what a fresh seed writes and nothing that is already live; a live
 * catalogue is edited in the console.
 *
 *   DATABASE_URL_LUMI9=postgresql://…/db?schema=lumi9 npm run db:seed
 *
 * Idempotent: slugs and SKUs are stable, so a rerun updates in place.
 */
import { dbFor } from '@femi9/db'
import { CADENCES, SIZES, defaultPack, packImage, productName, type ProductSize } from '../src/lib/catalog'
import { uploadPublicFile, uploadsBucket } from './product-images'
import { PDP_ACCORDION } from '../src/lib/content'

const BRAND = 'lumi9' as const

/** `cloud-soft-nb`, `cloud-soft-m`, … - stable, so reruns update. */
function slugFor(size: ProductSize): string {
  return `cloud-soft-${size.size.toLowerCase()}`
}

/** `LUMI9-M-24` - stable per size and pack tier. */
function skuFor(size: ProductSize, count: number): string {
  return `LUMI9-${size.size}-${count}`
}

/**
 * `Product.flow` is Femi9's word - "Heavy · Night + Day" - and there is no
 * period flow on a diaper. Rather than migrate a column that Femi9 reads
 * everywhere, Lumi9 uses the same slot for the equivalent idea: what the
 * product is rated for. Renaming it to something brand-neutral is worth doing
 * one day; it is not worth doing in the same change that first fills it.
 */
function ratedFor(size: ProductSize): string {
  return `${size.fits} · up to 12h dryness`
}

/**
 * Subscription cadences - reference data, not demo content.
 *
 * The box builder posts a `code` to /api/subscriptions and `createSubscription`
 * resolves it against these rows; without them EVERY subscribe attempt is a 400
 * that nothing on the page can explain. Sourced from CADENCES in
 * src/lib/catalog.ts so the picker and the database cannot drift apart - the
 * same arrangement, and the same reason, as Femi9's seed.
 *
 * The codes are Lumi9's own. Femi9's are period-cycle shaped ('cycle', '4w',
 * '6w'); a diaper refill is not, and the two brands' rows live in separate
 * schemas so they need not agree.
 */
async function seedCadences(db: ReturnType<typeof dbFor>) {
  for (const [position, cadence] of CADENCES.entries()) {
    const row = { label: cadence.label, sub: cadence.sub, days: cadence.days, active: true, position }
    await db.cadence.upsert({
      where: { code: cadence.code },
      create: { code: cadence.code, ...row },
      update: row,
    })
  }
  console.log(`Seeded subscription cadences (${CADENCES.length})`)
}

async function main() {
  const db = dbFor(BRAND)
  await seedCadences(db)

  const description =
    PDP_ACCORDION.find((entry) => entry.q === 'Description')?.a ??
    'Cloud Soft pants for everyday comfort.'
  const materials = PDP_ACCORDION.find((entry) => entry.q === 'Materials & safety')?.a ?? ''

  let created = 0
  let updated = 0

  for (const size of SIZES) {
    const slug = slugFor(size)
    const fallback = defaultPack(size)

    const base = {
      name: productName(size),
      type: 'diaper' as const,
      // The card price is the default pack tier's price; a cart line is charged
      // its own variant price.
      basePrice: fallback.price,
      meta: `${fallback.count} diapers · ${size.range}`,
      flow: ratedFor(size),
      // The numeric weight band behind `size.range`. The size-up projector reads
      // these columns now instead of its own SIZE_BOUNDS array, so a range
      // renamed in the console moves the maths as well as the words.
      minWeightKg: size.minWeightKg,
      maxWeightKg: size.maxWeightKg,
      description,
      longDescription: materials,
      status: 'active' as const,
    }

    const existing = await db.product.findUnique({ where: { slug }, select: { id: true } })

    const product = existing
      ? await db.product.update({ where: { id: existing.id }, data: base })
      : await db.product.create({ data: { ...base, slug } })

    if (existing) updated++
    else created++

    // ── Variants: one per pack tier ────────────────────────────────────────
    for (const pack of size.packs) {
      const sku = skuFor(size, pack.count)
      const found = await db.productVariant.findUnique({ where: { sku }, select: { id: true } })
      const variant = {
        productId: product.id,
        kind: 'pack' as const,
        label: `${pack.count} pcs`,
        packCount: pack.count,
        // The seed's catalogue is the LIST price, so mrp and price are the same
        // number and there is no discount. Writing both keeps a seeded row
        // consistent with one the console saved, rather than leaving mrp null
        // for the reader to interpret.
        //
        // Re-running this therefore RESETS any discount an operator set in the
        // console for a seeded variant. That is the same hazard as every other
        // field here — the seed is the catalogue's starting point, not a merge.
        price: pack.price,
        mrp: pack.price,
        discountPct: 0,
        // What `shippingForWeight()` sums against cart quantity — see
        // `size.packs[].shipWeight` above, which is this column's seed input.
        weightKg: pack.shipWeight,
        active: true,
      }
      if (found) {
        await db.productVariant.update({ where: { id: found.id }, data: variant })
      } else {
        // Stock is a placeholder: ops sets real counts in the console. It is not
        // zero, because a zero-stock catalog reads as "sold out" rather than
        // "not counted yet".
        await db.productVariant.create({ data: { ...variant, sku, stock: 250 } })
      }
    }

    // ── Images: replaced wholesale WHEN there is a bucket, untouched without one
    //
    // The bytes go to S3 and the row stores the `/uploads/…` URL CloudFront
    // serves back. This used to write `packImage(...)` - `/assets/products/
    // M-24.jpeg`, a file baked into the container - so every seeded photo came
    // from the image rather than from object storage, and could not be changed
    // without a redeploy. Nothing reported it: the page rendered a perfectly
    // good picture, just not one anybody could replace.
    //
    // Without a bucket (a local seed) the row is SKIPPED rather than filled
    // with a container path. A product with no photo is visibly missing one,
    // which is the honest state and the one the console is there to fix; a
    // bundled path looks finished and quietly is not.
    //
    // The delete is INSIDE the bucket branch, and that placement is the whole
    // point. It used to run unconditionally, one line above the `if` — so a
    // re-seed without a bucket deleted every row and then warned that it had
    // seeded no photos. That reads as "nothing happened"; what actually
    // happened is that every photograph ops had uploaded through the console
    // was destroyed. Nothing surfaced it either: `catalog.server.ts` falls back
    // to `packImage()`, so the storefront kept rendering a perfectly good
    // picture from inside the container, just not the one anybody chose.
    //
    // The seed is documented as safe to re-run and ships in the image as a
    // one-off ECS task. A task definition missing UPLOADS_BUCKET is therefore
    // one `npm run db:seed` away from wiping the brand's photography, silently,
    // in production. Without a bucket this now leaves the rows alone.
    if (uploadsBucket()) {
      const urls = await Promise.all(
        size.packs.map((pack) => uploadPublicFile('lumi9', packImage(size.size, pack.count))),
      )
      // Replace wholesale, since position matters and the set is small.
      await db.productImage.deleteMany({ where: { productId: product.id } })
      await db.productImage.createMany({
        data: size.packs.map((pack, index) => ({
          productId: product.id,
          url: urls[index]!,
          alt: `${productName(size)} - ${pack.count} pack`,
          position: index,
        })),
      })
    } else {
      const kept = await db.productImage.count({ where: { productId: product.id } })
      console.warn(
        `  ! UPLOADS_BUCKET unset - no photos seeded for ${size.size}` +
          (kept > 0 ? `; kept the ${kept} already on this product.` : '.') +
          ' Upload them in the console, or re-run with a bucket configured.',
      )
    }

    // ── Specs: the fit facts ops will want to edit later ───────────────────
    await db.productSpec.deleteMany({ where: { productId: product.id } })
    await db.productSpec.createMany({
      data: [
        { productId: product.id, key: 'Size', value: size.name, position: 0 },
        { productId: product.id, key: 'Fits', value: size.fits, position: 1 },
        {
          productId: product.id,
          key: 'Pack sizes',
          value: size.packs.map((p) => `${p.count}`).join(' · '),
          position: 2,
        },
      ],
    })
  }

  const variants = await db.productVariant.count()
  console.log(
    JSON.stringify(
      { brand: BRAND, products: { created, updated }, variants, sizes: SIZES.map((s) => s.size) },
      null,
      2,
    ),
  )
  await db.$disconnect()
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
