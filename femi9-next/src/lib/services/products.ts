import 'server-only'
import { prisma } from '@/lib/db'
import type { Product, ProductType } from '@/data/products'
import type { ProductExtra } from '@/data/productDetail'

/**
 * Product service — the single seam between the database and the UI.
 *
 * DB rows are mapped back onto the existing `Product` / `ProductExtra` shapes so
 * the storefront components can consume live data with no structural change.
 * `id` maps to the product `slug` (which we kept equal to the original id), so
 * existing /product/:id links keep working.
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
  body: string
  /** "Jun 2026" — preformatted. Every card used to print a hardcoded 'Jun 2026'
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
function toProduct(row: Row): ProductWithVariants {
  const packs = row.variants
    .filter((v) => v.kind === 'pack')
    .map((v) => ({ count: v.packCount ?? 0, price: v.price }))
  const sizes = row.variants.filter((v) => v.kind === 'size').map((v) => v.size ?? v.label)

  return {
    id: row.slug,
    name: row.name,
    price: row.basePrice,
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
      price: v.price,
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
  const rows = await loadRows()
  return rows.map(toProduct)
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
    body: r.body,
    date: r.createdAt.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }),
    verified: Boolean(r.userId && buyerIds.has(r.userId)),
  }))

  return {
      product: toProduct(row),
      extra: toExtra(row),
      reviews,
  }
}
