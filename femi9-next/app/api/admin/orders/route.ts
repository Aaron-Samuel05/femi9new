import type { NextRequest } from 'next/server'
import { handle, ok, unauthorized } from '@/lib/api'
import { requireAdmin } from '@/lib/admin-auth'
import { listOrders } from '@/lib/services/admin/orders'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/orders — paginated order list for the Ops console.
 * Reads ?status, ?q and ?page from the query string. Admin-guarded.
 */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const s = await requireAdmin()
    if (!s) return unauthorized()

    const sp = req.nextUrl.searchParams
    const status = sp.get('status') ?? undefined
    const q = sp.get('q') ?? undefined
    const page = Number(sp.get('page')) || 1

    const result = await listOrders({ status, q, page })
    return ok(result)
  })
}
