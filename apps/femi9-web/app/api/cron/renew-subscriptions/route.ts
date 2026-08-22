import { handle, ok, unauthorized } from '@/lib/api'
import { requireAdmin } from '@/lib/admin-auth'
import { generateDueOrders } from '@/lib/services/subscriptions'

/**
 * POST /api/cron/renew-subscriptions — generate renewal orders for every due
 * subscription. Returns { generated: n }.
 *
 * In production this is called on a schedule by AWS EventBridge Scheduler, which
 * presents the shared secret in the `x-cron-secret` header. Access is allowed when
 * either:
 *   - CRON_SECRET is set AND the x-cron-secret header matches it (the scheduler), OR
 *   - a signed-in admin is calling it (manual trigger from ops / local dev where no
 *     secret is configured).
 * With no valid secret and no admin session the endpoint is never open.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  return handle(async () => {
    const secret = process.env.CRON_SECRET
    const provided = req.headers.get('x-cron-secret')
    const secretOk = Boolean(secret) && provided === secret

    if (!secretOk) {
      const admin = await requireAdmin()
      if (!admin) return unauthorized()
    }

    const generated = await generateDueOrders()
    return ok({ generated })
  })
}
