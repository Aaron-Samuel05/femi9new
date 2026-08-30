import 'server-only'
import { getCatalog } from '@femi9/core/services/products'
import { getSettings } from '@femi9/core/services/settings'
import { packImage, productName, type ProductSize, type SizeCode } from './catalog'

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
 *
 * It also carries its real PHOTO. Every surface used to call
 * `packImage(size, count)`, which builds `/assets/products/M-24.jpeg` — a file
 * shipped inside the container. So the console's image uploader wrote rows into
 * `ProductImage` (and bytes into the S3 uploads bucket) that this storefront
 * never read: changing a product photo in the console changed nothing a shopper
 * saw, and there was no error anywhere to say so. The database is the source
 * now, and `packImage` survives as the fallback for a product with no rows.
 */

/** A pack tier, now with the id the cart and checkout need. */
export interface DbPack {
  variantId: string
  count: number
  price: number
  /** Purely so the UI can show "only 3 left"; not a reservation. */
  stock: number
  /**
   * The photo this tier shows, already resolved — a `/uploads/…` path the
   * console uploaded to S3, or the bundled `/assets/…` fallback. Resolved HERE
   * rather than at each of the eight call sites, so none of them has to know
   * a product might have no image.
   */
  image: string
  imageAlt: string
}

export interface DbProductSize extends Omit<ProductSize, 'packs'> {
  productId: string
  slug: string
  packs: DbPack[]
  /**
   * Every image on the product, in the console's order. The pack tiers take the
   * first `packs.length` of them; anything beyond that is extra photography the
   * gallery shows and no tier owns.
   */
  images: { url: string; alt: string }[]
  /**
   * The product page's own copy, from the console.
   *
   * The PDP accordion used to be `PDP_ACCORDION` in `src/lib/content.ts` — three
   * hardcoded entries — while the seed wrote the first two of them into
   * `description` and `longDescription`. So the console had an editor for both
   * columns, saving one changed the row, and the page went on printing the
   * module. `specs` is the same story with higher stakes: the size name and the
   * weight range on every card come from the `Size` and `Fits` rows.
   */
  description: string
  longDescription: string
  features: { title: string; body: string }[]
  specs: { key: string; value: string }[]
}

/** `cloud-soft-m` → `M`. The slug is the stable key; the display name is a spec. */
function codeFromSlug(slug: string): SizeCode {
  return slug.replace(/^cloud-soft-/, '').toUpperCase() as SizeCode
}

function spec(specs: { key: string; value: string }[], key: string): string {
  return specs.find((s) => s.key.toLowerCase() === key.toLowerCase())?.value ?? ''
}

/**
 * The catalogue PLUS the business config the storefront prices against.
 *
 * `subscribeSavePct` rides along because it is a number the shopper is quoted
 * ("Subscribe & save 20%") and the number a renewal order is actually
 * discounted by, and those were two different constants: the page said 20% from
 * a hardcoded `SUBSCRIPTION_DISCOUNT`, while `generateDueOrders()` applies
 * `Settings.subscribeSavePct`, which the console owns and which defaults to 15.
 * One request, one query already, so there is no reason for the client to guess.
 */
export interface CatalogPayload {
  sizes: DbProductSize[]
  subscribeSavePct: number
}

/**
 * The catalogue, ordered as the seed wrote it — NB, S, M, L, XL — which is the
 * order a size run should read in. Products with no active pack variant are
 * dropped: a size with nothing purchasable is worse on the page than absent.
 */
export async function loadCatalog(): Promise<CatalogPayload> {
  const [rows, settings] = await Promise.all([getCatalog('lumi9'), getSettings('lumi9')])

  const sizes = rows
    .map((row) => {
      const fits = spec(row.specs, 'Fits')
      const code = codeFromSlug(row.slug)
      const name = spec(row.specs, 'Size') || row.name
      const packs = row.variants
        .filter((v) => v.kind === 'pack' && v.packCount != null)
        .sort((a, b) => (a.packCount ?? 0) - (b.packCount ?? 0))
        .map((v, index) => {
          const count = v.packCount as number
          // Position i of the console's list belongs to pack tier i — the order
          // the seed writes and the order the console's move-up/move-down
          // buttons preserve. A product with FEWER images than tiers falls back
          // to the first (the console calls it the thumbnail), and one with none
          // at all to the bundled asset.
          const photo = row.images[index] ?? row.images[0]
          return {
            variantId: v.id,
            count,
            price: v.price,
            stock: v.stock,
            image: photo?.url ?? packImage(code, count),
            imageAlt: photo?.alt || `${productName({ name })} — ${count} pack`,
          }
        })

      return {
        productId: row.id,
        slug: row.slug,
        size: code,
        name,
        fits,
        range: fits,
        // "7–12 kg" → "7–12kg", the compact form the size chips use.
        short: fits.replace(/\s+/g, ''),
        packs,
        description: row.description,
        longDescription: row.longDescription ?? '',
        features: row.features,
        specs: row.specs,
        images: row.images.map((image) => ({
          url: image.url,
          alt: image.alt || productName({ name }),
        })),
      }
    })
    .filter((entry) => entry.packs.length > 0)

  return { sizes, subscribeSavePct: settings.subscribeSavePct }
}
