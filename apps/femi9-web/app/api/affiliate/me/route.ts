import { handle, notFound, ok, unauthorized } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { getForUser } from '@/lib/services/affiliate'

export const dynamic = 'force-dynamic'

/** Owner-scoped affiliate metrics. A shareable promo code is not authentication. */
export async function GET() {
  return handle(async () => {
    const user = await requireUser()
    if (!user) return unauthorized()
    const stats = await getForUser(user.sub)
    if (!stats) return notFound('No approved affiliate account was found.')
    return ok(stats)
  })
}
