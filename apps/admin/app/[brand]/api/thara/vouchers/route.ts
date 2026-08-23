import type { NextRequest } from 'next/server'
import { handle, ok, forbidden, notFound } from '@femi9/core/api'
import { requireConsoleApi } from '@/lib/api-guard'
import { isTharaEnabled } from '@femi9/core/thara/feature'
import { dbFor } from '@femi9/db'
import type { TharaVoucherStatus } from '@prisma/client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ALLOWED: TharaVoucherStatus[] = ['available', 'claimed', 'expired', 'cancelled']

/** GET /<brand>/api/thara/vouchers — paginated voucher list for the admin
 *  ops view (paste codes for available/no-code, monitor claim rate). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ brand: string }> }) {
  return handle(async () => {
    if (!isTharaEnabled()) return notFound()
    const auth = await requireConsoleApi((await params).brand)
    if (!auth.ok) return auth.response
    const { brand } = auth
    const prisma = dbFor(brand)

    const url = new URL(req.url)
    const rawStatus = url.searchParams.get('status') ?? undefined
    const status =
      rawStatus && (ALLOWED as string[]).includes(rawStatus)
        ? (rawStatus as TharaVoucherStatus)
        : undefined
    const missingCode = url.searchParams.get('missingCode') === 'true'
    const take = Math.min(100, Number(url.searchParams.get('take') ?? '25'))
    const skip = Math.max(0, Number(url.searchParams.get('skip') ?? '0'))

    const where = {
      ...(status ? { status } : {}),
      ...(missingCode ? { amazonCode: null, status: 'available' as const } : {}),
    }

    const [rows, total] = await Promise.all([
      prisma.tharaVoucher.findMany({
        where,
        take,
        skip,
        orderBy: { issuedAt: 'desc' },
        include: {
          user: { select: { email: true, name: true, phone: true } },
          cycle: { select: { startDate: true, endDate: true } },
        },
      }),
      prisma.tharaVoucher.count({ where }),
    ])
    return ok({ rows, total, take, skip })
  })
}
