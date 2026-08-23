import type { NextRequest } from 'next/server'
import { handle, ok, unauthorized } from '@femi9/core/api'
import { requireConsoleApi } from '@/lib/api-guard'
import { listOrders } from '@femi9/core/services/admin/orders'

export const dynamic = 'force-dynamic'

/**
 * GET /<brand>/api/orders — paginated order list for the Ops console.
 * Reads ?status, ?q and ?page from the query string. Admin-guarded.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ brand: string }> }) {
  return handle(async () => {
    const auth = await requireConsoleApi((await params).brand)
    if (!auth.ok) return auth.response
    const { brand } = auth

    const sp = req.nextUrl.searchParams
    const status = sp.get('status') ?? undefined
    const q = sp.get('q') ?? undefined
    const page = Number(sp.get('page')) || 1

    const result = await listOrders(brand, { status, q, page })
    return ok(result)
  })
}
