import 'server-only'
import { prisma } from '@/lib/db'

/**
 * Storefront-facing review service — the write counterpart to getProduct()'s read
 * path (which only surfaces `approved` rows). Shopper submissions land here as
 * `pending` so nothing goes live until a moderator triages it in the admin queue.
 *
 * Kept separate from `services/admin/reviews.ts`: that module is the moderator
 * side (list/approve/hide/delete) and must never be reachable from public code.
 */

export interface ReviewInput {
  name: string
  place?: string
  rating: number
  body: string
}

/**
 * Thrown when the slug doesn't resolve to a product. Typed so the route can map
 * it to a 404 while any other failure still bubbles up as a 500.
 */
export class ProductNotFoundError extends Error {
  constructor(slug: string) {
    super(`Product not found: ${slug}`)
    this.name = 'ProductNotFoundError'
  }
}

/**
 * Create a `pending` review for the product identified by `slug`.
 *
 * A Review references its product by internal id, not slug, so we resolve the
 * slug first and reject unknown ones. `status: 'pending'` is set explicitly to
 * override the schema default (`approved`) — shopper submissions must be moderated
 * before they appear on the product page.
 */
export async function submitReview(productSlug: string, input: ReviewInput, userId?: string): Promise<void> {
  const product = await prisma.product.findUnique({
    where: { slug: productSlug },
    select: { id: true },
  })
  if (!product) throw new ProductNotFoundError(productSlug)

  await prisma.$transaction(async (tx) => {
    const priorReview = userId
      ? await tx.review.findFirst({ where: { userId, productId: product.id }, select: { id: true } })
      : null
    const purchased = userId
      ? await tx.order.findFirst({
          where: { userId, status: { in: ['paid', 'processing', 'shipped', 'delivered'] }, items: { some: { variant: { productId: product.id } } } },
          select: { id: true },
        })
      : null
    await tx.review.create({
      data: {
        productId: product.id,
        userId,
        name: input.name,
        place: input.place,
        rating: input.rating,
        body: input.body,
        status: 'pending',
      },
    })
    if (userId && purchased && !priorReview) {
      const balance = await tx.pointsLedger.aggregate({ where: { userId }, _sum: { delta: true } })
      await tx.pointsLedger.create({
        data: { userId, delta: 50, reason: `Product review: ${product.id}`, balanceAfter: (balance._sum.delta ?? 0) + 50 },
      })
    }
  })
}

/** A moderated review, shaped for the landing testimonial carousel. */
export interface FeaturedReview {
  id: string
  name: string
  place: string | null
  rating: number
  quote: string
  productName: string
}

/**
 * Approved reviews for the landing carousel.
 *
 * The landing page shipped four hardcoded quotes — one of which ("Make The
 * Switch This Month") was not even a person's name — while a moderated Review
 * table with real customer words sat unread. Only 4- and 5-star reviews are
 * eligible: this is a testimonial rail, not the product's rating summary, which
 * lives on the PDP and shows everything.
 */
export async function listFeaturedReviews(limit = 6): Promise<FeaturedReview[]> {
  const rows = await prisma.review.findMany({
    where: { status: 'approved', rating: { gte: 4 } },
    orderBy: { createdAt: 'desc' },
    take: Math.max(1, Math.min(24, limit)),
    select: {
      id: true,
      name: true,
      place: true,
      rating: true,
      body: true,
      product: { select: { name: true } },
    },
  })
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    place: r.place,
    rating: r.rating,
    // Testimonial cards are a fixed height; a long review is trimmed on a word
    // boundary rather than mid-word.
    quote: r.body.length > 120 ? r.body.slice(0, r.body.lastIndexOf(' ', 117)) + '…' : r.body,
    productName: r.product.name,
  }))
}
