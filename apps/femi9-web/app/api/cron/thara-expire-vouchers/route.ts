import type { NextRequest } from 'next/server'
import { handle, ok, unauthorized, notFound } from '@femi9/core/api'
import { getAdminSession } from '@femi9/core/admin-auth'
import { isTharaEnabled } from '@femi9/core/thara/feature'
import { expireStaleVouchers } from '@femi9/core/services/thara'

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
