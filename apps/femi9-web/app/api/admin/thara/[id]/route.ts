import { handle, ok, notFound, forbidden } from '@/lib/api'
import { getAdminSession } from '@/lib/admin-auth'
import { getMembershipById } from '@/lib/services/thara'
import { isTharaEnabled } from '@/lib/thara/feature'
import { prisma } from '@/lib/db'

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
