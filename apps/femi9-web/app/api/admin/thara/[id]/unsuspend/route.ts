import { handle, ok, notFound, forbidden } from '@femi9/core/api'
import { getAdminSession } from '@femi9/core/admin-auth'
import { unsuspendMembership, TharaNotFoundError } from '@femi9/core/services/thara'
import { isTharaEnabled } from '@femi9/core/thara/feature'

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
