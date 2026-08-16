import 'server-only'
import { prisma } from '@/lib/db'
import { applyZonePrice, resolveAmbientZone, type ResolvedZone } from '@/lib/services/pricing'
import type { Product, ProductType } from '@/data/products'
import type { ProductExtra } from '@/data/productDetail'

/**
 * Product service — the single seam between the database and the UI.
 *
 * DB rows are mapped back onto the existing `Product` / `ProductExtra` shapes so
 * the storefront components can consume live data with no structural change.
 * `id` maps to the product `slug` (which we kept equal to the original id), so
 * existing /product/:id links keep working.
 *
 * Every price leaving this service is a ZONE price — the zone's custom price for
 * that product/variant when the admin set one, else its percentage discount. The
 * catalogue used to print `variant.price` raw while checkout charged the regional
 * price, so a shopper in a discounted state was quoted one number on the card and
 * a different one at the payment sheet.
 */

export interface Variant {
  id: string
  kind: 'pack' | 'size'
  label: string
  packCount: number | null
  size: string | null
  price: number
  stock: number
}

export interface ProductWithVariants extends Product {
  variants: Variant[]
}

export interface ProductReview {
  id: string
  name: string
  place: string | null
  rating: number
  /** Optional one-line headline. Null on every row written before it existed. */
  title: string | null
  body: string
  /** Helpful / not-helpful tallies shown under each card. */
  helpfulUp: number
  helpfulDown: number
  /** "14/10/2025" — preformatted. Every card used to print a hardcoded 'Jun 2026'
   *  because the DTO carried no date at all. */
  date: string
  /** True only when this reviewer actually bought this product. The badge used
   *  to read "Verified Buyer" unconditionally on every card. */
  verified: boolean
}

export interface FullProduct {
  product: ProductWithVariants
  extra: ProductExtra
  reviews: ProductReview[]
}

type Row = Awaited<ReturnType<typeof loadRows>>[number]

function loadRows() {
  return prisma.product.findMany({
    where: { status: 'active' },
    orderBy: { createdAt: 'asc' },
    include: {
      variants: { where: { active: true }, orderBy: { price: 'asc' } },
      images: { orderBy: { position: 'asc' } },
      features: { orderBy: { position: 'asc' } },
      specs: { orderBy: { position: 'asc' } },
    },
  })
}

/** Map a DB row → the `Product` shape the cards/grid expect. */
function toProduct(row: Row, zone: ResolvedZone | null): ProductWithVariants {
  // Each price is keyed by WHAT it prices, so a zone's custom price for this
  // product/variant is found; without the key it would fall back to the zone's
  // percentage and the card would contradict the cart.
  const zonedVariant = (price: number, variantId: string) =>
    applyZonePrice(price, zone, { variantId })

  const packs = row.variants
    .filter((v) => v.kind === 'pack')
    .map((v) => ({ count: v.packCount ?? 0, price: zonedVariant(v.price, v.id) }))
  const sizes = row.variants.filter((v) => v.kind === 'size').map((v) => v.size ?? v.label)

  return {
    id: row.slug,
    name: row.name,
    price: applyZonePrice(row.basePrice, zone, { productId: row.id }),
    img: row.images[0]?.url ?? '',
    meta: row.meta,
    flow: row.flow,
    desc: row.description,
    tag: row.tag ?? undefined,
    tagClass: (row.tagClass as 'pink' | undefined) ?? undefined,
    type: row.type as ProductType,
    packs: packs.length ? packs : undefined,
    sizes: sizes.length ? sizes : undefined,
    variants: row.variants.map((v) => ({
      id: v.id,
      kind: v.kind as 'pack' | 'size',
      label: v.label,
      packCount: v.packCount,
      size: v.size,
      price: zonedVariant(v.price, v.id),
      stock: v.stock,
    })),
  }
}

/** Map a DB row → the `ProductExtra` shape the detail page expects. */
function toExtra(row: Row): ProductExtra {
  return {
    gallery: row.images.map((i) => i.url),
    rating: row.rating,
    reviews: row.reviewCount,
    long: row.longDescription ?? row.description,
    features: row.features.map((f) => ({ title: f.title, body: f.body })),
    specs: row.specs.map((s) => ({ k: s.key, v: s.value })),
  }
}

/** All active products, in the `Product` shape (catalog grid / cards). */
export async function listProducts(): Promise<ProductWithVariants[]> {
  const [rows, zone] = await Promise.all([loadRows(), resolveAmbientZone()])
  return rows.map((row) => toProduct(row, zone))
}

/** One product by slug, with detail extras and moderated reviews. */
export async function getProduct(slug: string): Promise<FullProduct | null> {
  const row = await prisma.product.findFirst({
      where: { slug, status: 'active' },
      include: {
        variants: { where: { active: true }, orderBy: { price: 'asc' } },
        images: { orderBy: { position: 'asc' } },
        features: { orderBy: { position: 'asc' } },
        specs: { orderBy: { position: 'asc' } },
        reviews: { where: { status: 'approved' }, orderBy: { createdAt: 'desc' } },
      },
    })
  if (!row) return null

  // "Verified buyer" has to mean something: resolve, in one query, which of
  // these reviewers actually has a paid order containing a variant of THIS
  // product. Anonymous reviews (userId null) are never verified.
  const reviewerIds = row.reviews.map((r) => r.userId).filter((id): id is string => Boolean(id))
  const buyerIds = new Set<string>()
  if (reviewerIds.length > 0) {
    const buyers = await prisma.order.findMany({
      where: {
        userId: { in: reviewerIds },
        status: { in: ['paid', 'processing', 'shipped', 'delivered'] },
        items: { some: { variant: { productId: row.id } } },
      },
      select: { userId: true },
      distinct: ['userId'],
    })
    for (const b of buyers) if (b.userId) buyerIds.add(b.userId)
  }

  const reviews: ProductReview[] = row.reviews.map((r) => ({
    id: r.id,
    name: r.name,
    place: r.place,
    rating: r.rating,
    title: r.title,
    body: r.body,
    helpfulUp: r.helpfulUp,
    helpfulDown: r.helpfulDown,
    // Day-precision, dd/mm/yyyy. The card sits beside a helpfulness control, and
    // "was this recent?" is the question a reader asks before trusting a vote
    // count — a month/year stamp cannot answer it.
    date: r.createdAt.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }),
    verified: Boolean(r.userId && buyerIds.has(r.userId)),
  }))

  return {
      product: toProduct(row, await resolveAmbientZone()),
      extra: toExtra(row),
      reviews,
  }
}
