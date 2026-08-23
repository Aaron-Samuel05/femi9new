import 'server-only'
import { getCatalog } from '@femi9/core/services/products'
import type { ProductSize, SizeCode } from './catalog'

/**
 * Load Lumi9's catalogue from the database in the shape the storefront already
 * speaks.
 *
 * The UI is organised by nappy size with pack tiers underneath; the database
 * stores one Product per size with a `pack` variant per tier. This is the seam
 * between them, and it lives here rather than in `@femi9/core` because the
 * shape is Lumi9's, not the platform's — the same reason each brand keeps its
 * own seed.
 *
 * Every tier carries its real `variantId`. That is the point of the exercise:
 * the cart used to key lines by `${size}-${count}` because there was nothing
 * else to key them by, and a server-side cart needs the id the database knows.
 */

/** A pack tier, now with the id the cart and checkout need. */
export interface DbPack {
  variantId: string
  count: number
  price: number
  /** Purely so the UI can show "only 3 left"; not a reservation. */
  stock: number
}

export interface DbProductSize extends Omit<ProductSize, 'packs'> {
  productId: string
  slug: string
  packs: DbPack[]
}

/** `cloud-soft-m` → `M`. The slug is the stable key; the display name is a spec. */
function codeFromSlug(slug: string): SizeCode {
  return slug.replace(/^cloud-soft-/, '').toUpperCase() as SizeCode
}

function spec(specs: { key: string; value: string }[], key: string): string {
  return specs.find((s) => s.key.toLowerCase() === key.toLowerCase())?.value ?? ''
}

/**
 * The catalogue, ordered as the seed wrote it — NB, S, M, L, XL — which is the
 * order a size run should read in. Products with no active pack variant are
 * dropped: a size with nothing purchasable is worse on the page than absent.
 */
export async function loadCatalog(): Promise<DbProductSize[]> {
  const rows = await getCatalog('lumi9')

  return rows
    .map((row) => {
      const fits = spec(row.specs, 'Fits')
      const packs = row.variants
        .filter((v) => v.kind === 'pack' && v.packCount != null)
        .sort((a, b) => (a.packCount ?? 0) - (b.packCount ?? 0))
        .map((v) => ({
          variantId: v.id,
          count: v.packCount as number,
          price: v.price,
          stock: v.stock,
        }))

      return {
        productId: row.id,
        slug: row.slug,
        size: codeFromSlug(row.slug),
        name: spec(row.specs, 'Size') || row.name,
        fits,
        range: fits,
        // "7–12 kg" → "7–12kg", the compact form the size chips use.
        short: fits.replace(/\s+/g, ''),
        packs,
      }
    })
    .filter((entry) => entry.packs.length > 0)
}
