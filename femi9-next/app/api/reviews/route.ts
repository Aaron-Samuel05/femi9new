import { z } from 'zod'
import { ok, badRequest, notFound, handle } from '@/lib/api'
import { rateLimit, clientIp, tooManyRequests } from '@/lib/rate-limit'
import { submitReview, ProductNotFoundError } from '@/lib/services/reviews-public'

/**
 * POST /api/reviews — public review submission from the product page.
 * The created review is always `pending` (see submitReview); this endpoint never
 * publishes content directly, so it needs no auth beyond input validation.
 */

const bodySchema = z.object({
  productSlug: z.string().min(1),
  name: z.string().min(1).max(80),
  rating: z.number().int().min(1).max(5),
  body: z.string().min(1).max(2000),
  // Optional "City, State" style origin shown alongside approved reviews.
  place: z.string().max(80).optional(),
})

export async function POST(req: Request) {
  return handle(async () => {
    const rl = await rateLimit(`reviews:${clientIp(req)}`, 5, 60_000)
    if (!rl.ok) return tooManyRequests(rl.retryAfterSec)

    const json = await req.json().catch(() => null)
    const parsed = bodySchema.safeParse(json)
    if (!parsed.success) return badRequest('Invalid review', parsed.error.flatten())

    const { productSlug, name, rating, body, place } = parsed.data
    try {
      await submitReview(productSlug, { name, rating, body, place })
    } catch (err) {
      // A stale/invalid slug is a client problem, not a server fault.
      if (err instanceof ProductNotFoundError) return notFound('Product not found')
      throw err
    }
    return ok({ ok: true })
  })
}
