import type { NextRequest } from 'next/server'
import { handle, ok, notFound, forbidden } from '@/lib/api'
import { getAdminSession } from '@/lib/admin-auth'
import { listMemberships } from '@/lib/services/thara'
import { isTharaEnabled } from '@/lib/thara/feature'
import type { TharaStatus } from '@prisma/client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ALLOWED: TharaStatus[] = ['purchase_pending', 'active', 'suspended', 'deactivated']

export async function GET(req: NextRequest) {
  return handle(async () => {
    if (!isTharaEnabled()) return notFound()
    const admin = await getAdminSession()
    if (!admin) return forbidden()

    const url = new URL(req.url)
    const rawStatus = url.searchParams.get('status') ?? undefined
    const status =
      rawStatus && (ALLOWED as string[]).includes(rawStatus)
        ? (rawStatus as TharaStatus)
        : undefined
    const q = url.searchParams.get('q') ?? undefined
    const take = Math.min(100, Number(url.searchParams.get('take') ?? '25'))
    const skip = Math.max(0, Number(url.searchParams.get('skip') ?? '0'))

    const { rows, total } = await listMemberships({ status, q, take, skip })
    return ok({ rows, total, take, skip })
  })
}
