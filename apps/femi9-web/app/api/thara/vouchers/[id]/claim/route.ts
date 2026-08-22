import { handle, ok, unauthorized, notFound, badRequest } from '@/lib/api'
import { getSession } from '@/lib/auth'
import { isTharaEnabled } from '@/lib/thara/feature'
import { claimVoucher, TharaVoucherNotClaimableError } from '@/lib/services/thara'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** POST /api/thara/vouchers/[id]/claim — customer marks their voucher claimed. */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    if (!isTharaEnabled()) return notFound()
    const session = await getSession()
    if (!session) return unauthorized()

    const { id } = await ctx.params
    try {
      const v = await claimVoucher(id, session.sub)
      return ok({ voucher: v })
    } catch (e) {
      if (e instanceof TharaVoucherNotClaimableError) return badRequest(e.message)
      throw e
    }
  })
}
