import type { NextRequest } from 'next/server'
import { handle, ok, unauthorized } from '@femi9/core/api'
import { requireConsoleApi } from '@/lib/api-guard'
import { listCustomers } from '@femi9/core/services/admin/customers'

export const dynamic = 'force-dynamic'

/** GET /<brand>/api/customers?q=&page= — paginated customer list with aggregates. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ brand: string }> }) {
  return handle(async () => {
    const auth = await requireConsoleApi((await params).brand, 'readonly', 'customers')
    if (!auth.ok) return auth.response
    const { brand } = auth

    const { searchParams } = new URL(req.url)
    const q = searchParams.get('q') ?? undefined
    // Coerce page defensively; a garbage value falls back to page 1 in the service.
    const pageNum = Number(searchParams.get('page'))
    const page = Number.isFinite(pageNum) && pageNum > 0 ? pageNum : undefined

    return ok(await listCustomers(brand, { q, page }))
  })
}
