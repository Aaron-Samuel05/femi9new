import { handle, ok, forbidden, notFound } from '@femi9/core/api'
import { getAdminSession } from '@femi9/core/admin-auth'
import { isTharaEnabled } from '@femi9/core/thara/feature'
import { prisma } from '@femi9/core/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** GET /api/admin/thara/metrics — program-wide totals for the admin dashboard. */
export async function GET() {
  return handle(async () => {
    if (!isTharaEnabled()) return notFound()
    const admin = await getAdminSession()
    if (!admin) return forbidden()

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
