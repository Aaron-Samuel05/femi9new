import 'server-only'
import { getCatalog } from '@femi9/core/services/products'
import { getSettings } from '@femi9/core/services/settings'
import { PRODUCT_IMAGE_PLACEHOLDER, productName, type ProductSize, type SizeCode } from './catalog'

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
 * It also carries its real PHOTO, and that photo now comes from S3 and nowhere
 * else. Every surface used to call `packImage(size, count)` —
 * `/assets/products/M-24.jpeg`, a file shipped inside the container — so the
 * console's uploader wrote `ProductImage` rows (and bytes into the S3 uploads
 * bucket) that this storefront never read: changing a product photo in the
 * console changed nothing a shopper saw, and there was no error anywhere to say
 * so.
 *
 * Reading the rows fixed that, but left the last bundled path in place as the
 * fallback — so a product with NO rows still borrowed a picture of a different
 * pack out of the container and looked photographed. Both halves are closed
 * now: the row's URL is the only source, and the absence of one renders
 * `PRODUCT_IMAGE_PLACEHOLDER`, a plain tile that is visibly not a product.
 *
 * `prisma/seed.ts` writes to the bucket too — it used to seed the bundled paths
 * straight into the rows, which is why every seeded product was serving a
 * container file that no console upload could replace. `prisma/
 * migrate-images-to-s3.ts` moves the rows that predate this.
 */

/** A pack tier, now with the id the cart and checkout need. */
export interface DbPack {
  variantId: string
  count: number
  price: number
  /** Purely so the UI can show "only 3 left"; not a reservation. */
  stock: number
  /**
   * The photo this tier shows, already resolved: the `/uploads/…` object the
   * console (or the seed) put in S3, or `PRODUCT_IMAGE_PLACEHOLDER` when the
   * product has no photo at all. Resolved HERE rather than at each of the eight
   * call sites, so none of them has to know a product might have no image —
   * and so none of them can reintroduce a bundled product picture.
   */
  image: string
  imageAlt: string
}

export interface DbProductSize extends Omit<ProductSize, 'packs'> {
  productId: string
  slug: string
  packs: DbPack[]
  /**
   * The product's headline price — `Product.basePrice`, already zone-resolved
   * by `getCatalog`.
   *
   * This used to be dropped on the floor here, and NOTHING on the storefront
   * read it: every price a shopper saw came from a pack variant. The console
   * meanwhile offers a "Base price (₹)" input and prints this column as THE
   * price in its products list — so an admin edited it, watched the console's
   * own list update, and the storefront never moved. There was no error to say
   * so. Femi9 has never had the bug because its `toProduct` maps
   * `price: applyZonePrice(row.basePrice, …)`; this is the same field, carried
   * across the same seam.
   *
   * ⚠️ Keep it equal to one of the pack prices. It is the CARD's price while
   * the card's button adds a pack, so the two contradict each other the moment
   * they diverge — see the pack pick in ShopBrowser.
   */
  basePrice: number
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
          // to the first (the console calls it the thumbnail).
          const photo = row.images[index] ?? row.images[0]
          return {
            variantId: v.id,
            count,
            price: v.price,
            stock: v.stock,
            // S3 only — the `packImage()` fallback is gone. See the header.
            image: photo?.url ?? PRODUCT_IMAGE_PLACEHOLDER,
            imageAlt: photo?.alt || `${productName({ name })} — ${count} pack`,
          }
        })

      return {
        productId: row.id,
        slug: row.slug,
        basePrice: row.basePrice,
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
