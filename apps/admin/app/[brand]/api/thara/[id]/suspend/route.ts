import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { handle, ok, notFound, forbidden, badRequest } from '@femi9/core/api'
import { requireConsoleApi } from '@/lib/api-guard'
import { hasModule } from '@femi9/core/brands'
import { suspendMembership, TharaNotFoundError } from '@femi9/core/services/thara'
import { isTharaEnabled } from '@femi9/core/thara/feature'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const bodySchema = z.object({ reason: z.string().min(1).max(500) })

export async function POST(req: NextRequest, ctx: { params: Promise<{ brand: string; id: string }> }) {
  return handle(async () => {
    if (!isTharaEnabled()) return notFound()
    const auth = await requireConsoleApi((await ctx.params).brand, 'manager')
    if (!auth.ok) return auth.response
    const { brand } = auth
    // THARA_ENABLED is a GLOBAL flag and this console serves both brands, so the
    // flag alone says nothing about whether THIS brand runs the programme. Without
    // this line, turning Thara on for Femi9 opened every one of these endpoints to
    // a Lumi9 admin. 404, matching requireConsole: a brand that has no Thara must
    // not learn one exists.
    if (!hasModule(brand, 'thara')) return notFound()

    const parsed = bodySchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return badRequest('Invalid body', parsed.error.format())

    const { id } = await ctx.params
    try {
      const row = await suspendMembership(brand, id, parsed.data.reason)
      return ok({ membership: row })
    } catch (e) {
      if (e instanceof TharaNotFoundError) return notFound()
      throw e
    }
  })
}
