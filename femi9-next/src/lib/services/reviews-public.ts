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
