import { handle, ok, notFound, forbidden } from '@femi9/core/api'
import { requireConsoleApi } from '@/lib/api-guard'
import { getMembershipById } from '@femi9/core/services/thara'
import { isTharaEnabled } from '@femi9/core/thara/feature'
import { dbFor } from '@femi9/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_req: Request, ctx: { params: Promise<{ brand: string; id: string }> }) {
  return handle(async () => {
    if (!isTharaEnabled()) return notFound()
    const auth = await requireConsoleApi((await ctx.params).brand)
    if (!auth.ok) return auth.response
    const { brand } = auth
    const prisma = dbFor(brand)

    const { id } = await ctx.params
    const m = await getMembershipById(brand, id)
    if (!m) return notFound()

    const referrals = await prisma.tharaReferral.findMany({
      where: { referrerId: id },
      orderBy: { createdAt: 'desc' },
    })
    return ok({ membership: m, referrals })
  })
}
