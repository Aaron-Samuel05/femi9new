import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, seedSettings, prisma } from '../helpers/db'
import { redeem, InsufficientPointsError } from '@femi9/core/services/rewards'

/**
 * Rewards redemption is the security-sensitive path: it turns loyalty points into
 * a real, spendable Coupon. The invariant under test is that a customer can never
 * mint a coupon they didn't pay points for — the balance check + atomic debit must
 * hold. These tests assert against the DB directly so they fail if that guard is
 * removed (a reverted fix would let an underfunded user redeem anyway).
 */

async function seedUserWithPoints(balance: number) {
  const user = await prisma.user.create({
    data: { email: `u-${Math.random().toString(36).slice(2, 10)}@test.dev` },
  })
  await prisma.pointsLedger.create({
    data: { userId: user.id, delta: balance, reason: 'seed earn', balanceAfter: balance },
  })
  return user
}

/** Balance is the running sum of the ledger — the exact source of truth redeem reads. */
async function balanceOf(userId: string) {
  const agg = await prisma.pointsLedger.aggregate({ where: { userId }, _sum: { delta: true } })
  return agg._sum.delta ?? 0
}

describe('rewards.redeem (integration)', () => {
  beforeEach(async () => {
    await resetDb()
    await seedSettings()
  })

  it('debits points with a NEGATIVE ledger row and mints a real coupon', async () => {
    const user = await seedUserWithPoints(500)
    const option = await prisma.rewardOption.create({
      data: { title: 'Rs 50 off', costPoints: 200, couponType: 'flat', couponValue: 50 },
    })

    const { couponCode } = await redeem(user.id, option.id)

    // The returned code is a real, persisted Coupon carrying the option's terms.
    const coupon = await prisma.coupon.findUnique({ where: { code: couponCode } })
    expect(coupon).not.toBeNull()
    expect(coupon!.type).toBe('flat')
    expect(coupon!.value).toBe(50)
    expect(coupon!.maxUses).toBe(1)
    expect(coupon!.active).toBe(true)
    expect(await prisma.coupon.count()).toBe(1)

    // Balance dropped by exactly the cost (500 - 200).
    expect(await balanceOf(user.id)).toBe(300)

    // A negative debit row was written, carrying the reconstructable balanceAfter.
    const debit = await prisma.pointsLedger.findFirst({ where: { userId: user.id, delta: { lt: 0 } } })
    expect(debit).not.toBeNull()
    expect(debit!.delta).toBe(-200)
    expect(debit!.balanceAfter).toBe(300)
  })

  it('throws InsufficientPointsError and writes NOTHING when the balance is short', async () => {
    const user = await seedUserWithPoints(100)
    const option = await prisma.rewardOption.create({
      data: { title: 'Rs 500 off', costPoints: 500, couponType: 'flat', couponValue: 500 },
    })

    const ledgerRowsBefore = await prisma.pointsLedger.count()

    await expect(redeem(user.id, option.id)).rejects.toBeInstanceOf(InsufficientPointsError)

    // No coupon minted, no debit row appended, balance untouched — the transaction
    // rolled back atomically. A reverted balance check would fail every line here.
    expect(await prisma.coupon.count()).toBe(0)
    expect(await prisma.pointsLedger.count()).toBe(ledgerRowsBefore)
    expect(await balanceOf(user.id)).toBe(100)
  })
})
