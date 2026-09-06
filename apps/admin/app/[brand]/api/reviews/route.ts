import type { NextRequest } from 'next/server'
import type { ModerationStatus } from '@prisma/client'
import { z } from 'zod'
import { badRequest, created, handle, notFound, ok, unauthorized } from '@femi9/core/api'
import { requireConsoleApi } from '@/lib/api-guard'
import {
  createReview,
  listReviews,
  ProductNotFoundError,
} from '@femi9/core/services/admin/reviews'

/**
 * /<brand>/api/reviews — collection endpoint for the moderation queue.
 *   GET → list reviews, optionally filtered by ?status=pending|approved|hidden.
 * Guarded by requireAdmin; the (panel) shell also guards the page.
 */

const STATUSES: readonly ModerationStatus[] = ['pending', 'approved', 'hidden']

/**
 * POST /<brand>/api/reviews — admin-authored review.
 *
 * Bypasses the customer moderation queue (writes as `approved` in the service)
 * and sets `verifiedOverride: true` so the storefront shows the "verified
 * buyer" badge without a linked User + purchase. Guarded by the same 'support'
 * tier that lets a moderator hide or delete rows — an operator who can hide
 * a review can also add one.
 */
const CreateReviewSchema = z.object({
  productSlug: z.string().min(1).max(200),
  name: z.string().trim().min(1).max(80),
  place: z.string().trim().max(80).optional().or(z.literal('')),
  rating: z.number().int().min(1).max(5),
  title: z.string().trim().max(120).optional().or(z.literal('')),
  body: z.string().trim().min(1).max(2000),
})

export async function POST(req: NextRequest, { params }: { params: Promise<{ brand: string }> }) {
  const auth = await requireConsoleApi((await params).brand, 'support', 'reviews')
  if (!auth.ok) return auth.response
  const { brand } = auth

  return handle(async () => {
    const parsed = CreateReviewSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return badRequest('Invalid review', parsed.error.flatten())
    try {
      const row = await createReview(brand, {
        productSlug: parsed.data.productSlug,
        name: parsed.data.name,
        place: parsed.data.place || null,
        rating: parsed.data.rating,
        title: parsed.data.title || null,
        body: parsed.data.body,
      })
      return created({ row })
    } catch (err) {
      if (err instanceof ProductNotFoundError) return notFound('Product not found')
      throw err
    }
  })
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ brand: string }> }) {
  const auth = await requireConsoleApi((await params).brand, 'readonly', 'reviews')
  if (!auth.ok) return auth.response
  const { brand } = auth

  return handle(async () => {
    // Only a recognised status filters the list; anything else means "all", so
    // a stale/garbage query param degrades gracefully instead of erroring.
    const raw = req.nextUrl.searchParams.get('status')
    const status = STATUSES.includes(raw as ModerationStatus)
      ? (raw as ModerationStatus)
      : undefined
    return ok(await listReviews(brand, { status }))
  })
}
