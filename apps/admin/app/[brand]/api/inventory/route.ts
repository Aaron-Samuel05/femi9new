import type { NextRequest } from 'next/server'
import { handle, ok, unauthorized } from '@femi9/core/api'
import { requireConsoleApi } from '@/lib/api-guard'
import { listInventory } from '@femi9/core/services/admin/inventory'

export const dynamic = 'force-dynamic'

/**
 * GET /<brand>/api/inventory — every variant with product name, label, sku, price,
 * stock, active flag and a precomputed low-stock flag. Feeds the admin inventory
 * table (a client page that loads this on mount and edits stock inline).
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ brand: string }> }) {
  return handle(async () => {
    const auth = await requireConsoleApi((await params).brand)
    if (!auth.ok) return auth.response
    const { brand } = auth

    const rows = await listInventory(brand)
    return ok({ rows })
  })
}
