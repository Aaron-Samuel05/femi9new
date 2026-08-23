import type { NextRequest } from 'next/server'
import type { ModerationStatus } from '@prisma/client'
import { handle, ok, unauthorized } from '@femi9/core/api'
import { requireConsoleApi } from '@/lib/api-guard'
import { listWall } from '@femi9/core/services/admin/wall'

/**
 * /<brand>/api/wall — collection endpoint for the community moderation queue.
 *   GET → list wall posts, optionally filtered by ?status=pending|approved|hidden.
 * Guarded by requireAdmin; the (panel) shell also guards the page.
 */

const STATUSES: readonly ModerationStatus[] = ['pending', 'approved', 'hidden']

export async function GET(req: NextRequest, { params }: { params: Promise<{ brand: string }> }) {
  const auth = await requireConsoleApi((await params).brand)
  if (!auth.ok) return auth.response
  const { brand } = auth

  return handle(async () => {
    // Only a recognised status filters the list; anything else means "all", so
    // a stale/garbage query param degrades gracefully instead of erroring.
    const raw = req.nextUrl.searchParams.get('status')
    const status = STATUSES.includes(raw as ModerationStatus)
      ? (raw as ModerationStatus)
      : undefined
    return ok(await listWall(brand, { status }))
  })
}
