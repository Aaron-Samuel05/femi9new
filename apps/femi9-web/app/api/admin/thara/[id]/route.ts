import { handle, ok, notFound, forbidden } from '@femi9/core/api'
import { getAdminSession } from '@femi9/core/admin-auth'
import { getMembershipById } from '@femi9/core/services/thara'
import { isTharaEnabled } from '@femi9/core/thara/feature'
import { prisma } from '@femi9/core/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    if (!isTharaEnabled()) return notFound()
    const admin = await getAdminSession()
    if (!admin) return forbidden()

    const { id } = await ctx.params
    const m = await getMembershipById(id)
    if (!m) return notFound()

    const referrals = await prisma.tharaReferral.findMany({
      where: { referrerId: id },
      orderBy: { createdAt: 'desc' },
    })
    return ok({ membership: m, referrals })
  })
}
