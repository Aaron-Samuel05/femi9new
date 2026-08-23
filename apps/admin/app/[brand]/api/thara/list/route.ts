import type { NextRequest } from 'next/server'
import { handle, ok, notFound, forbidden } from '@femi9/core/api'
import { requireConsoleApi } from '@/lib/api-guard'
import { listMemberships } from '@femi9/core/services/thara'
import { isTharaEnabled } from '@femi9/core/thara/feature'
import type { TharaStatus } from '@prisma/client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ALLOWED: TharaStatus[] = ['purchase_pending', 'active', 'suspended', 'deactivated']

export async function GET(req: NextRequest, { params }: { params: Promise<{ brand: string }> }) {
  return handle(async () => {
    if (!isTharaEnabled()) return notFound()
    const auth = await requireConsoleApi((await params).brand)
    if (!auth.ok) return auth.response
    const { brand } = auth

    const url = new URL(req.url)
    const rawStatus = url.searchParams.get('status') ?? undefined
    const status =
      rawStatus && (ALLOWED as string[]).includes(rawStatus)
        ? (rawStatus as TharaStatus)
        : undefined
    const q = url.searchParams.get('q') ?? undefined
    const take = Math.min(100, Number(url.searchParams.get('take') ?? '25'))
    const skip = Math.max(0, Number(url.searchParams.get('skip') ?? '0'))

    const { rows, total } = await listMemberships(brand, { status, q, take, skip })
    return ok({ rows, total, take, skip })
  })
}
