import { handle, ok, unauthorized } from '@/lib/api'
import { requireAdmin } from '@/lib/admin-auth'
import { reconcilePendingOrders } from '@/lib/services/checkout'

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
    return ok(await reconcilePendingOrders())
  })
}
