import { handle, ok, unauthorized } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { getCycleData } from '@/lib/services/cycle'

/**
 * GET /api/cycle — the signed-in user's computed cycle model (same shape the
 * dashboard renders). Per-user and cookie-gated, so it must never be cached.
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  return handle(async () => {
    const u = await requireUser()
    if (!u) return unauthorized()
    return ok(await getCycleData(u.sub))
  })
}
