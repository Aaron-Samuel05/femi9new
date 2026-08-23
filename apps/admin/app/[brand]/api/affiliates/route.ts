import type { NextRequest } from 'next/server'
import { handle, ok, unauthorized } from '@femi9/core/api'
import { requireConsoleApi } from '@/lib/api-guard'
import { listAffiliates, listPayouts } from '@femi9/core/services/admin/affiliates'

export const dynamic = 'force-dynamic'

/**
 * GET /<brand>/api/affiliates — creator list for the console.
 *   default             → { affiliates } with computed clicks/orders/earnings.
 *   ?payouts=1          → { payouts } (all, or ?affiliateId=… to scope to one).
 * Admin-guarded.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ brand: string }> }) {
  return handle(async () => {
    const auth = await requireConsoleApi((await params).brand)
    if (!auth.ok) return auth.response
    const { brand } = auth

    const sp = req.nextUrl.searchParams
    if (sp.get('payouts')) {
      const affiliateId = sp.get('affiliateId') ?? undefined
      return ok({ payouts: await listPayouts(brand, affiliateId) })
    }

    return ok({ affiliates: await listAffiliates(brand) })
  })
}
