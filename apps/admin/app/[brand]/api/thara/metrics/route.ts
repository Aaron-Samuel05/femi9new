import type { NextRequest } from 'next/server'
import { handle, ok, forbidden, notFound } from '@femi9/core/api'
import { requireConsoleApi } from '@/lib/api-guard'
import { hasModule } from '@femi9/core/brands'
import { isTharaEnabled } from '@femi9/core/thara/feature'
import { dbFor } from '@femi9/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** GET /<brand>/api/thara/metrics — program-wide totals for the admin dashboard. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ brand: string }> }) {
  return handle(async () => {
    if (!isTharaEnabled()) return notFound()
    const auth = await requireConsoleApi((await params).brand, 'readonly', 'thara')
    if (!auth.ok) return auth.response
    const { brand } = auth
    // THARA_ENABLED is a GLOBAL flag and this console serves both brands, so the
    // flag alone says nothing about whether THIS brand runs the programme. Without
    // this line, turning Thara on for Femi9 opened every one of these endpoints to
    // a Lumi9 admin. 404, matching requireConsole: a brand that has no Thara must
    // not learn one exists.
    if (!hasModule(brand, 'thara')) return notFound()
    const prisma = dbFor(brand)

    const [
      totalMembers,
      activeMembers,
      pendingMembers,
      suspendedMembers,
      totalReferrals,
      lockedReferrals,
      commissionAccrued,
      creditSpent,
      totalPoints,
      vouchersAvailable,
      vouchersClaimed,
      vouchersExpired,
      currentCycle,
    ] = await Promise.all([
      prisma.tharaMembership.count(),
      prisma.tharaMembership.count({ where: { status: 'active' } }),
      prisma.tharaMembership.count({ where: { status: 'purchase_pending' } }),
      prisma.tharaMembership.count({ where: { status: 'suspended' } }),
      prisma.tharaReferral.count(),
      prisma.tharaReferral.count({ where: { lockedAt: { not: null } } }),
      prisma.tharaCreditLedger.aggregate({
        where: { reason: 'referral-commission' },
        _sum: { delta: true },
      }),
      prisma.tharaCreditLedger.aggregate({
        where: { reason: 'checkout-spend' },
        _sum: { delta: true },
      }),
      prisma.tharaRewardPointsLedger.aggregate({
        where: { reason: 'referral-points' },
        _sum: { delta: true },
      }),
      prisma.tharaVoucher.count({ where: { status: 'available' } }),
      prisma.tharaVoucher.count({ where: { status: 'claimed' } }),
      prisma.tharaVoucher.count({ where: { status: 'expired' } }),
      prisma.tharaCycle.findFirst({ where: { status: 'open' }, orderBy: { startDate: 'desc' } }),
    ])

    return ok({
      members: {
        total: totalMembers,
        active: activeMembers,
        pending: pendingMembers,
        suspended: suspendedMembers,
      },
      referrals: {
        total: totalReferrals,
        locked: lockedReferrals,
      },
      credit: {
        commissionAccruedPaise: commissionAccrued._sum.delta ?? 0,
        creditSpentPaise: Math.abs(creditSpent._sum.delta ?? 0),
      },
      rewards: {
        totalPointsAccrued: totalPoints._sum.delta ?? 0,
        vouchersAvailable,
        vouchersClaimed,
        vouchersExpired,
      },
      currentCycle: currentCycle
        ? {
            id: currentCycle.id,
            startDate: currentCycle.startDate,
            endDate: currentCycle.endDate,
          }
        : null,
    })
  })
}
