import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, prisma, makeProduct, seedSettings } from '../helpers/db'
import { enrollUser, activateAndLockIfEligible } from '@femi9/core/services/thara'

async function makeUser(email = `u-${Math.random().toString(36).slice(2, 8)}@t.local`) {
  return prisma.user.create({ data: { email, role: 'customer' } })
}

async function paidOrder(userId: string, subtotal: number) {
  const { variant } = await makeProduct({ price: subtotal })
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

describe('activateAndLockIfEligible', () => {
  beforeEach(async () => {
    await resetDb()
    await seedSettings()
  })

  it('promotes purchase_pending -> active on ≥ ₹3,000 order', async () => {
    const u = await makeUser()
    const { id: memId } = await enrollUser(u.id, 'v1')
    const order = await paidOrder(u.id, 300_000)

    await prisma.$transaction((tx) => activateAndLockIfEligible(tx, order.id))

    const m = await prisma.tharaMembership.findUnique({ where: { id: memId } })
    expect(m?.status).toBe('active')
    expect(m?.qualifyingOrderId).toBe(order.id)
    expect(m?.activatedAt).not.toBeNull()
  })

  it('does not activate on an order below ₹3,000', async () => {
    const u = await makeUser()
    const { id: memId } = await enrollUser(u.id, 'v1')
    const order = await paidOrder(u.id, 299_900)

    await prisma.$transaction((tx) => activateAndLockIfEligible(tx, order.id))

    const m = await prisma.tharaMembership.findUnique({ where: { id: memId } })
    expect(m?.status).toBe('purchase_pending')
    expect(m?.qualifyingOrderId).toBeNull()
  })

  it("locks the incoming referral on the referred user's first ≥ ₹3,000 order", async () => {
    const referrerUser = await makeUser()
    const { id: refMemId } = await enrollUser(referrerUser.id, 'v1')
    const referredUser = await makeUser()
    await prisma.tharaReferral.create({
      data: { referrerId: refMemId, referredUserId: referredUser.id },
    })
    const order = await paidOrder(referredUser.id, 500_000)

    await prisma.$transaction((tx) => activateAndLockIfEligible(tx, order.id))

    const ref = await prisma.tharaReferral.findUnique({
      where: { referredUserId: referredUser.id },
    })
    expect(ref?.lockedAt).not.toBeNull()
  })

  it('is a no-op when the user has no membership and no incoming referral', async () => {
    const u = await makeUser()
    const order = await paidOrder(u.id, 500_000)

    await expect(
      prisma.$transaction((tx) => activateAndLockIfEligible(tx, order.id)),
    ).resolves.not.toThrow()
  })
})
