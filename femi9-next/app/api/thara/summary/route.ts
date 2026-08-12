import { handle, ok, unauthorized, notFound } from '@/lib/api'
import { getSession } from '@/lib/auth'
import { isTharaEnabled } from '@/lib/thara/feature'
import {
  getMembership,
  getTharaCreditBalance,
  currentOpenCycle,
  getUserCyclePoints,
  THARA_VOUCHER_MULTIPLIER,
} from '@/lib/services/thara'
import { prisma } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/thara/summary — the one-shot payload the customer dashboard
 * reads to render every Thara section (membership + referral + wallet +
 * points + vouchers + downline count). All computed server-side so the
 * client renders a static tree.
 */
export async function GET() {
  return handle(async () => {
    if (!isTharaEnabled()) return notFound()
    const session = await getSession()
    if (!session) return unauthorized()

    const userId = session.sub
    const m = await getMembership(userId)
    if (!m) return ok({ enrolled: false })

    const base = process.env.NEXT_PUBLIC_SITE_URL ?? ''
    const referralUrl = base ? `${base}/r/${m.referralCode}` : `/r/${m.referralCode}`

    const [
      creditBalance,
      cycle,
      recentCreditRows,
      vouchers,
      downlineCount,
      incomingReferral,
    ] = await Promise.all([
      getTharaCreditBalance(prisma, userId),
      currentOpenCycle(),
      prisma.tharaCreditLedger.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      prisma.tharaVoucher.findMany({
        where: { userId },
        orderBy: { issuedAt: 'desc' },
        take: 10,
      }),
      prisma.tharaReferral.count({ where: { referrerId: m.id } }),
      prisma.tharaReferral.findUnique({
        where: { referredUserId: userId },
        include: { referrer: { select: { referralCode: true } } },
      }),
    ])

    const currentCyclePoints = await getUserCyclePoints(userId, cycle.id)

    return ok({
      enrolled: true,
      membership: {
        status: m.status,
        referralCode: m.referralCode,
        referralUrl,
        enrolledAt: m.enrolledAt,
        activatedAt: m.activatedAt,
      },
      referrerCode: incomingReferral?.referrer.referralCode ?? null,
      downlineCount,
      credit: {
        balancePaise: creditBalance,
        recentRows: recentCreditRows.map((r) => ({
          id: r.id,
          delta: r.delta,
          reason: r.reason,
          sourceOrderId: r.sourceOrderId,
          balanceAfter: r.balanceAfter,
          createdAt: r.createdAt,
        })),
      },
      cycle: {
        id: cycle.id,
        startDate: cycle.startDate,
        endDate: cycle.endDate,
        status: cycle.status,
        currentPoints: currentCyclePoints,
        estimatedVoucherRupees: currentCyclePoints * THARA_VOUCHER_MULTIPLIER,
      },
      vouchers: vouchers.map((v) => ({
        id: v.id,
        cycleId: v.cycleId,
        points: v.points,
        valuePaise: v.valuePaise,
        status: v.status,
        issuedAt: v.issuedAt,
        claimDeadline: v.claimDeadline,
        claimedAt: v.claimedAt,
        hasAmazonCode: !!v.amazonCode,
        amazonCode: v.status === 'claimed' ? v.amazonCode : null,
      })),
    })
  })
}
