import type { NextRequest } from 'next/server'
import type { ModerationStatus } from '@prisma/client'
import { handle, ok, unauthorized } from '@/lib/api'
import { requireAdmin } from '@/lib/admin-auth'
import { listReviews } from '@/lib/services/admin/reviews'

/**
 * /api/admin/reviews — collection endpoint for the moderation queue.
 *   GET → list reviews, optionally filtered by ?status=pending|approved|hidden.
 * Guarded by requireAdmin; the (panel) shell also guards the page.
 */

const STATUSES: readonly ModerationStatus[] = ['pending', 'approved', 'hidden']

export async function GET(req: NextRequest) {
  const s = await requireAdmin()
  if (!s) return unauthorized()

  return handle(async () => {
    // Only a recognised status filters the list; anything else means "all", so
    // a stale/garbage query param degrades gracefully instead of erroring.
    const raw = req.nextUrl.searchParams.get('status')
    const status = STATUSES.includes(raw as ModerationStatus)
      ? (raw as ModerationStatus)
      : undefined
    return ok(await listReviews({ status }))
  })
}
