import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { handle, ok, forbidden, notFound, badRequest } from '@/lib/api'
import { getAdminSession } from '@/lib/admin-auth'
import { isTharaEnabled } from '@/lib/thara/feature'
import { prisma } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const bodySchema = z.object({ amazonCode: z.string().min(1).max(200) })

/** POST /api/admin/thara/vouchers/[id]/set-code — admin pastes an Amazon code
 *  for a voucher issued via the manual issuer. Refuses non-available vouchers. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    if (!isTharaEnabled()) return notFound()
    const admin = await getAdminSession()
    if (!admin) return forbidden()

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
