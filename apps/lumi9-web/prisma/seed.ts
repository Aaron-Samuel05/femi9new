/**
 * Seed Lumi9's catalog into the `lumi9` schema.
 *
 * The SHAPE of the data is shared with Femi9 — one `schema.prisma` in
 * packages/db — but the DATA is not, which is why this seed lives with the app
 * rather than beside the schema. Femi9's seed does the same with its own
 * catalog.
 *
 * Source of truth is `src/lib/catalog.ts`, the same module the storefront
 * renders from today. Once the storefront reads the database (Phase 4), that
 * file becomes the seed's input only, and the database becomes the truth.
 *
 *   DATABASE_URL_LUMI9=postgresql://…/db?schema=lumi9 npm run db:seed
 *
 * Idempotent: slugs and SKUs are stable, so a rerun updates in place.
 */
import { dbFor } from '@femi9/db'
import { SIZES, defaultPack, packImage, productName, type ProductSize } from '../src/lib/catalog'
import { PDP_ACCORDION } from '../src/lib/content'

const BRAND = 'lumi9' as const

/** `cloud-soft-nb`, `cloud-soft-m`, … — stable, so reruns update. */
function slugFor(size: ProductSize): string {
  return `cloud-soft-${size.size.toLowerCase()}`
}

/** `LUMI9-M-24` — stable per size and pack tier. */
function skuFor(size: ProductSize, count: number): string {
  return `LUMI9-${size.size}-${count}`
}

/**
 * `Product.flow` is Femi9's word — "Heavy · Night + Day" — and there is no
 * period flow on a diaper. Rather than migrate a column that Femi9 reads
 * everywhere, Lumi9 uses the same slot for the equivalent idea: what the
 * product is rated for. Renaming it to something brand-neutral is worth doing
 * one day; it is not worth doing in the same change that first fills it.
 */
function ratedFor(size: ProductSize): string {
  return `${size.fits} · up to 12h dryness`
}

async function main() {
  const db = dbFor(BRAND)

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
      description,
      longDescription: materials,
      status: 'active' as const,
    }

    const existing = await db.product.findUnique({ where: { slug }, select: { id: true } })

    const product = existing
      ? await db.product.update({ where: { id: existing.id }, data: base })
      : await db.product.create({ data: { ...base, slug } })

    existing ? updated++ : created++

    // ── Variants: one per pack tier ────────────────────────────────────────
    for (const pack of size.packs) {
      const sku = skuFor(size, pack.count)
      const found = await db.productVariant.findUnique({ where: { sku }, select: { id: true } })
      const variant = {
        productId: product.id,
        kind: 'pack' as const,
        label: `${pack.count} pcs`,
        packCount: pack.count,
        price: pack.price,
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

    // ── Images: replace wholesale, since position matters and the set is small
    await db.productImage.deleteMany({ where: { productId: product.id } })
    await db.productImage.createMany({
      data: size.packs.map((pack, index) => ({
        productId: product.id,
        url: packImage(size.size, pack.count),
        alt: `${productName(size)} — ${pack.count} pack`,
        position: index,
      })),
    })

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
