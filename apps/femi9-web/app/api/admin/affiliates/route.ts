import type { NextRequest } from 'next/server'
import { handle, ok, unauthorized } from '@/lib/api'
import { requireAdmin } from '@/lib/admin-auth'
import { listAffiliates, listPayouts } from '@/lib/services/admin/affiliates'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/affiliates — creator list for the console.
 *   default             → { affiliates } with computed clicks/orders/earnings.
 *   ?payouts=1          → { payouts } (all, or ?affiliateId=… to scope to one).
 * Admin-guarded.
 */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const s = await requireAdmin()
    if (!s) return unauthorized()

    const sp = req.nextUrl.searchParams
    if (sp.get('payouts')) {
      const affiliateId = sp.get('affiliateId') ?? undefined
      return ok({ payouts: await listPayouts(affiliateId) })
    }

    return ok({ affiliates: await listAffiliates() })
  })
}
