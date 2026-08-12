import type { NextRequest } from 'next/server'
import { handle, ok, unauthorized, notFound } from '@/lib/api'
import { getAdminSession } from '@/lib/admin-auth'
import { isTharaEnabled } from '@/lib/thara/feature'
import { expireStaleVouchers } from '@/lib/services/thara'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** POST /api/cron/thara-expire-vouchers — batch-expire past-deadline vouchers.
 *  Same access rules as thara-close-cycle. */
export async function POST(req: NextRequest) {
  return handle(async () => {
    if (!isTharaEnabled()) return notFound()

    const secret = process.env.CRON_SECRET
    const provided = req.headers.get('x-cron-secret')
    const secretOk = Boolean(secret) && provided === secret
    if (!secretOk) {
      const admin = await getAdminSession()
      if (!admin) return unauthorized()
    }

    const expired = await expireStaleVouchers()
    return ok({ expired })
  })
}
