import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { handle, ok, notFound, forbidden, badRequest } from '@femi9/core/api'
import { getAdminSession } from '@femi9/core/admin-auth'
import { suspendMembership, TharaNotFoundError } from '@femi9/core/services/thara'
import { isTharaEnabled } from '@femi9/core/thara/feature'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const bodySchema = z.object({ reason: z.string().min(1).max(500) })

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    if (!isTharaEnabled()) return notFound()
    const admin = await getAdminSession()
    if (!admin) return forbidden()

    const parsed = bodySchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return badRequest('Invalid body', parsed.error.format())

    const { id } = await ctx.params
    try {
      const row = await suspendMembership(id, parsed.data.reason)
      return ok({ membership: row })
    } catch (e) {
      if (e instanceof TharaNotFoundError) return notFound()
      throw e
    }
  })
}
