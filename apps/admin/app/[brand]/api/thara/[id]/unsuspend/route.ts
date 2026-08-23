import { handle, ok, notFound, forbidden } from '@femi9/core/api'
import { requireConsoleApi } from '@/lib/api-guard'
import { unsuspendMembership, TharaNotFoundError } from '@femi9/core/services/thara'
import { isTharaEnabled } from '@femi9/core/thara/feature'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(_req: Request, ctx: { params: Promise<{ brand: string; id: string }> }) {
  return handle(async () => {
    if (!isTharaEnabled()) return notFound()
    const auth = await requireConsoleApi((await ctx.params).brand)
    if (!auth.ok) return auth.response
    const { brand } = auth

    const { id } = await ctx.params
    try {
      const row = await unsuspendMembership(brand, id)
      return ok({ membership: row })
    } catch (e) {
      if (e instanceof TharaNotFoundError) return notFound()
      throw e
    }
  })
}
