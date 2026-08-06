import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { badRequest, handle, notFound, ok, unauthorized } from '@/lib/api'
import { requireAdmin } from '@/lib/admin-auth'
import { deleteReview, setReviewStatus } from '@/lib/services/admin/reviews'

/**
 * /api/admin/reviews/[id] — single-review moderation endpoint.
 *   PATCH  → set { status } (approve / hide / re-queue).
 *   DELETE → remove the review permanently.
 * Next 14.2: `params` is a plain synchronous object, not a Promise.
 */

const PatchSchema = z.object({
  status: z.enum(['pending', 'approved', 'hidden']),
})

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const s = await requireAdmin()
  if (!s) return unauthorized()

  return handle(async () => {
    const raw = await req.json().catch(() => null)
    const parsed = PatchSchema.safeParse(raw)
    if (!parsed.success) return badRequest('Invalid request', parsed.error.flatten())

    const row = await setReviewStatus(params.id, parsed.data.status)
    // Service returns null when the review id doesn't exist.
    if (!row) return notFound('Review not found')
    return ok({ row })
  })
}

export async function DELETE(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const s = await requireAdmin()
  if (!s) return unauthorized()

  return handle(async () => {
    const res = await deleteReview(params.id)
    if (!res) return notFound('Review not found')
    return ok(res)
  })
}
