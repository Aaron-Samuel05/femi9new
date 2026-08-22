import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { resetDb, prisma, makeProduct } from '../helpers/db'
import {
  enrollUser,
  accrueTharaPoints,
  reverseTharaPointsForRefund,
  getUserCyclePoints,
  currentOpenCycle,
  closeCycle,
  claimVoucher,
  expireStaleVouchers,
  TharaVoucherNotClaimableError,
} from '@femi9/core/services/thara'
import { ManualIssuer } from '@femi9/core/thara/voucher-issuer'

async function activeMember(email: string) {
  const u = await prisma.user.create({ data: { email, role: 'customer' } })
  const { id } = await enrollUser(u.id, 'v1')
  await prisma.tharaMembership.update({
    where: { id },
    data: { status: 'active', activatedAt: new Date() },
  })
  return { userId: u.id, membershipId: id }
}

async function paidOrderForUser(userId: string, subtotal: number) {
  const { variant } = await makeProduct({ price: subtotal, stock: 5 })
  return prisma.order.create({
    data: {
      orderNo: `TEST-${Math.random().toString(36).slice(2, 8)}`,
      userId,
      subtotal,
      total: subtotal,
      status: 'paid',
      items: {
        create: {
          variantId: variant.id,
          productName: 'x',
          variantLabel: '1',
          unitPrice: subtotal,
          qty: 1,
          lineTotal: subtotal,
        },
      },
    },
  })
}

describe('Thara reward points + voucher (sub-project D)', () => {
  const originalFlag = process.env.THARA_ENABLED

  beforeEach(async () => {
    await resetDb()
    process.env.THARA_ENABLED = 'true'
  })
  afterEach(() => {
    process.env.THARA_ENABLED = originalFlag
  })

  it('currentOpenCycle returns the same open cycle across calls', async () => {
    const a = await currentOpenCycle()
    const b = await currentOpenCycle()
    expect(b.id).toBe(a.id)
  })

  it('accrueTharaPoints credits 1% of subtotal as points on a locked downline order', async () => {
    const referrer = await activeMember('r1@t.local')
    const referredUser = await prisma.user.create({ data: { email: 'friend1@t.local', role: 'customer' } })
    await prisma.tharaReferral.create({
      data: { referrerId: referrer.membershipId, referredUserId: referredUser.id, lockedAt: new Date() },
    })
    const cycle = await currentOpenCycle()
    const order = await paidOrderForUser(referredUser.id, 300_000) // ₹3,000 = 30 points expected

    await prisma.$transaction((tx) => accrueTharaPoints(tx, order.id))

    expect(await getUserCyclePoints(referrer.userId, cycle.id)).toBe(30)
  })

  it('does not accrue points on an unlocked referral', async () => {
    const referrer = await activeMember('r2@t.local')
    const referredUser = await prisma.user.create({ data: { email: 'friend2@t.local', role: 'customer' } })
    await prisma.tharaReferral.create({
      data: { referrerId: referrer.membershipId, referredUserId: referredUser.id, lockedAt: null },
    })
    const cycle = await currentOpenCycle()
    const order = await paidOrderForUser(referredUser.id, 500_000)
    await prisma.$transaction((tx) => accrueTharaPoints(tx, order.id))
    expect(await getUserCyclePoints(referrer.userId, cycle.id)).toBe(0)
  })

  it('reverseTharaPointsForRefund writes a mirror-signed row per accrual', async () => {
    const referrer = await activeMember('r3@t.local')
    const referredUser = await prisma.user.create({ data: { email: 'friend3@t.local', role: 'customer' } })
    await prisma.tharaReferral.create({
      data: { referrerId: referrer.membershipId, referredUserId: referredUser.id, lockedAt: new Date() },
    })
    const cycle = await currentOpenCycle()
    const order = await paidOrderForUser(referredUser.id, 800_000) // 80 points
    await prisma.$transaction((tx) => accrueTharaPoints(tx, order.id))
    expect(await getUserCyclePoints(referrer.userId, cycle.id)).toBe(80)

    await prisma.$transaction((tx) => reverseTharaPointsForRefund(tx, order.id))
    expect(await getUserCyclePoints(referrer.userId, cycle.id)).toBe(0)
  })

  it('closeCycle issues one voucher per user with points, using ManualIssuer (no code)', async () => {
    const cycle = await currentOpenCycle()
    const a = await prisma.user.create({ data: { email: 'a@t.local', role: 'customer' } })
    const b = await prisma.user.create({ data: { email: 'b@t.local', role: 'customer' } })
    const c = await prisma.user.create({ data: { email: 'c@t.local', role: 'customer' } })
    await prisma.tharaRewardPointsLedger.createMany({
      data: [
        { userId: a.id, cycleId: cycle.id, delta: 30, reason: 'referral-points' },
        { userId: a.id, cycleId: cycle.id, delta: 80, reason: 'referral-points' },
        { userId: b.id, cycleId: cycle.id, delta: 15, reason: 'referral-points' },
        // c has zero points (no rows)
      ],
    })

    const result = await closeCycle(cycle.id, new ManualIssuer())
    expect(result.vouchersIssued).toBe(2)

    const vA = await prisma.tharaVoucher.findFirst({ where: { userId: a.id, cycleId: cycle.id } })
    expect(vA?.points).toBe(110)
    expect(vA?.valuePaise).toBe(110 * 3 * 100) // points × 3 = ₹, × 100 = paise
    expect(vA?.amazonCode).toBeNull()
    expect(vA?.status).toBe('available')

    const closedCycle = await prisma.tharaCycle.findUnique({ where: { id: cycle.id } })
    expect(closedCycle?.status).toBe('closed')

    // Verify c had no voucher.
    const vC = await prisma.tharaVoucher.findFirst({ where: { userId: c.id, cycleId: cycle.id } })
    expect(vC).toBeNull()
  })

  it('closeCycle is idempotent on a closed cycle', async () => {
    const cycle = await currentOpenCycle()
    const a = await prisma.user.create({ data: { email: 'idem-a@t.local', role: 'customer' } })
    await prisma.tharaRewardPointsLedger.create({
      data: { userId: a.id, cycleId: cycle.id, delta: 10, reason: 'referral-points' },
    })
    await closeCycle(cycle.id, new ManualIssuer())
    const second = await closeCycle(cycle.id, new ManualIssuer())
    expect(second.vouchersIssued).toBe(0)
    // Still exactly one voucher for a.
    const count = await prisma.tharaVoucher.count({ where: { userId: a.id, cycleId: cycle.id } })
    expect(count).toBe(1)
  })

  it('claimVoucher marks available -> claimed and stamps claimedAt', async () => {
    const cycle = await currentOpenCycle()
    const u = await prisma.user.create({ data: { email: 'claim@t.local', role: 'customer' } })
    const v = await prisma.tharaVoucher.create({
      data: {
        userId: u.id,
        cycleId: cycle.id,
        points: 10,
        valuePaise: 3000,
        status: 'available',
        claimDeadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    })
    const after = await claimVoucher(v.id, u.id)
    expect(after.status).toBe('claimed')
    expect(after.claimedAt).not.toBeNull()
  })

  it('claimVoucher refuses to claim someone else\'s voucher', async () => {
    const cycle = await currentOpenCycle()
    const owner = await prisma.user.create({ data: { email: 'own@t.local', role: 'customer' } })
    const other = await prisma.user.create({ data: { email: 'other@t.local', role: 'customer' } })
    const v = await prisma.tharaVoucher.create({
      data: {
        userId: owner.id,
        cycleId: cycle.id,
        points: 10,
        valuePaise: 3000,
        status: 'available',
        claimDeadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    })
    await expect(claimVoucher(v.id, other.id)).rejects.toBeInstanceOf(TharaVoucherNotClaimableError)
  })

  it('expireStaleVouchers flips past-deadline vouchers to expired', async () => {
    const cycle = await currentOpenCycle()
    const u = await prisma.user.create({ data: { email: 'exp@t.local', role: 'customer' } })
    await prisma.tharaVoucher.create({
      data: {
        userId: u.id,
        cycleId: cycle.id,
        points: 10,
        valuePaise: 3000,
        status: 'available',
        claimDeadline: new Date(Date.now() - 60 * 1000), // already past
      },
    })
    const n = await expireStaleVouchers()
    expect(n).toBe(1)
    const v = await prisma.tharaVoucher.findFirst({ where: { userId: u.id } })
    expect(v?.status).toBe('expired')
  })
})
