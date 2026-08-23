import { handle, ok, unauthorized } from '@femi9/core/api'
import { requireAdmin } from '@femi9/core/admin-auth'
import { reconcilePendingOrders } from '@femi9/core/services/checkout'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  return handle(async () => {
    const configured = process.env.CRON_SECRET?.trim()
    const supplied = req.headers.get('x-cron-secret')
    if (!configured || supplied !== configured) {
      const admin = await requireAdmin()
      if (!admin) return unauthorized()
    }
    return ok(await reconcilePendingOrders('femi9'))
  })
}
