import type { NextRequest } from 'next/server'
import { handle, ok, unauthorized } from '@femi9/core/api'
import { requireAdmin } from '@femi9/core/admin-auth'
import { listCustomers } from '@femi9/core/services/admin/customers'

export const dynamic = 'force-dynamic'

/** GET /api/admin/customers?q=&page= — paginated customer list with aggregates. */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const s = await requireAdmin()
    if (!s) return unauthorized()

    const { searchParams } = new URL(req.url)
    const q = searchParams.get('q') ?? undefined
    // Coerce page defensively; a garbage value falls back to page 1 in the service.
    const pageNum = Number(searchParams.get('page'))
    const page = Number.isFinite(pageNum) && pageNum > 0 ? pageNum : undefined

    return ok(await listCustomers({ q, page }))
  })
}
