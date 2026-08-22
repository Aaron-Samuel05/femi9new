import { handle, ok, notFound, forbidden } from '@/lib/api'
import { getAdminSession } from '@/lib/admin-auth'
import { unsuspendMembership, TharaNotFoundError } from '@/lib/services/thara'
import { isTharaEnabled } from '@/lib/thara/feature'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    if (!isTharaEnabled()) return notFound()
    const admin = await getAdminSession()
    if (!admin) return forbidden()

    const { id } = await ctx.params
    try {
      const row = await unsuspendMembership(id)
      return ok({ membership: row })
    } catch (e) {
      if (e instanceof TharaNotFoundError) return notFound()
      throw e
    }
  })
}
