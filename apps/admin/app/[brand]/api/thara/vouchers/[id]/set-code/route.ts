import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { handle, ok, forbidden, notFound, badRequest } from '@femi9/core/api'
import { requireConsoleApi } from '@/lib/api-guard'
import { isTharaEnabled } from '@femi9/core/thara/feature'
import { dbFor } from '@femi9/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const bodySchema = z.object({ amazonCode: z.string().min(1).max(200) })

/** POST /<brand>/api/thara/vouchers/[id]/set-code — admin pastes an Amazon code
 *  for a voucher issued via the manual issuer. Refuses non-available vouchers. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ brand: string; id: string }> }) {
  return handle(async () => {
    if (!isTharaEnabled()) return notFound()
    const auth = await requireConsoleApi((await ctx.params).brand)
    if (!auth.ok) return auth.response
    const { brand } = auth
    const prisma = dbFor(brand)

    const parsed = bodySchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return badRequest('Invalid body', parsed.error.format())

    const { id } = await ctx.params
    const v = await prisma.tharaVoucher.findUnique({ where: { id } })
    if (!v) return notFound()
    if (v.status !== 'available') return badRequest(`Voucher is ${v.status}.`)

    const updated = await prisma.tharaVoucher.update({
      where: { id },
      data: { amazonCode: parsed.data.amazonCode.trim() },
    })
    return ok({ voucher: updated })
  })
}
