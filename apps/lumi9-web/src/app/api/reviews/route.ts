import { z } from 'zod'
import { badRequest, handle, notFound, ok } from '@femi9/core/api'
import { clientIp, rateLimit, tooManyRequests } from '@femi9/core/rate-limit'
import { getSession } from '@femi9/core/auth'
import { ProductNotFoundError, submitReview } from '@femi9/core/services/reviews-public'

/**
 * POST /api/reviews — public review submission from the Lumi9 product page.
 *
 * Mirror of Femi9's endpoint (apps/femi9-web/app/api/reviews/route.ts). Every
 * submission is created `pending` inside `submitReview` — this endpoint never
 * publishes content directly, so it needs no auth beyond input validation and
 * rate limiting. The optional session id is threaded through so a signed-in
 * shopper's review can be attributed to her User row (which drives the
 * verified-buyer heuristic in getProduct).
 */

const bodySchema = z.object({
  productSlug: z.string().min(1).max(200),
  name: z.string().trim().min(1).max(80),
  rating: z.number().int().min(1).max(5),
  body: z.string().trim().min(1).max(2000),
  place: z.string().trim().max(80).optional(),
  title: z.string().trim().max(120).optional(),
})

export async function POST(req: Request) {
  return handle(async () => {
    // Five per minute per IP — same envelope as Femi9. Enough for a real
    // shopper's edit-and-retry, tight enough that abuse pays for itself.
    const rl = await rateLimit(`reviews-lumi9:${clientIp(req)}`, 5, 60_000)
    if (!rl.ok) return tooManyRequests(rl.retryAfterSec)

    const parsed = bodySchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return badRequest('Invalid review', parsed.error.flatten())

    const { productSlug, name, rating, body, place, title } = parsed.data
    try {
      const session = await getSession('lumi9')
      await submitReview(
        'lumi9',
        productSlug,
        { name, rating, body, place, title },
        session?.sub,
      )
    } catch (err) {
      if (err instanceof ProductNotFoundError) return notFound('Product not found')
      throw err
    }
    return ok({ ok: true })
  })
}
