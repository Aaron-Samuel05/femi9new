import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { badRequest, handle, notFound, ok, unauthorized } from '@femi9/core/api'
import { requireConsoleApi } from '@/lib/api-guard'
import { deleteReview, setReviewStatus } from '@femi9/core/services/admin/reviews'

/**
 * /<brand>/api/reviews/[id] — single-review moderation endpoint.
 *   PATCH  → set { status } (approve / hide / re-queue).
 *   DELETE → remove the review permanently.
 * Next 14.2: `params` is a plain synchronous object, not a Promise.
 */

const PatchSchema = z.object({
  status: z.enum(['pending', 'approved', 'hidden']),
})

export async function PATCH(req: NextRequest, props: { params: Promise<{ brand: string; id: string }> }) {
  const params = await props.params;
  const auth = await requireConsoleApi((await props.params).brand, 'support')
  if (!auth.ok) return auth.response
  const { brand } = auth

  return handle(async () => {
    const raw = await req.json().catch(() => null)
    const parsed = PatchSchema.safeParse(raw)
    if (!parsed.success) return badRequest('Invalid request', parsed.error.flatten())

    const row = await setReviewStatus(brand, params.id, parsed.data.status)
    // Service returns null when the review id doesn't exist.
    if (!row) return notFound('Review not found')
    return ok({ row })
  })
}

export async function DELETE(_req: NextRequest, props: { params: Promise<{ brand: string; id: string }> }) {
  const params = await props.params;
  const auth = await requireConsoleApi((await props.params).brand, 'support')
  if (!auth.ok) return auth.response
  const { brand } = auth

  return handle(async () => {
    const res = await deleteReview(brand, params.id)
    if (!res) return notFound('Review not found')
    return ok(res)
  })
}
