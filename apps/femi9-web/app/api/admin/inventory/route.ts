import { handle, ok, unauthorized } from '@femi9/core/api'
import { requireAdmin } from '@femi9/core/admin-auth'
import { listInventory } from '@femi9/core/services/admin/inventory'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/inventory — every variant with product name, label, sku, price,
 * stock, active flag and a precomputed low-stock flag. Feeds the admin inventory
 * table (a client page that loads this on mount and edits stock inline).
 */
export async function GET() {
  return handle(async () => {
    const s = await requireAdmin()
    if (!s) return unauthorized()

    const rows = await listInventory('femi9')
    return ok({ rows })
  })
}
