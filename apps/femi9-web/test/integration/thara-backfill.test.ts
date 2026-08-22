import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { resetDb, prisma, makeProduct, seedSettings } from '../helpers/db'
import {
  enrollUser,
  getMembership,
  getUnlockProgress,
  syncTharaActivation,
  THARA_QUALIFYING_MIN_PAISE,
} from '@femi9/core/services/thara'

/**
 * Activation used to live ONLY on the payment path (markOrderPaid), which meant
 * the ordinary sequence — shop first, find the programme afterwards — could
 * never unlock: by the time the membership row existed, the qualifying order
 * was already in the past and nothing looked at it again. These cover the
 * backfill that closes that hole.
 */

const originalFlag = process.env.THARA_ENABLED

async function makeUser(email = `u-${Math.random().toString(36).slice(2, 8)}@t.local`) {
  return prisma.user.create({ data: { email, role: 'customer' } })
}

async function order(userId: string, subtotal: number, status: 'paid' | 'pending' = 'paid') {
  const { variant } = await makeProduct({ price: subtotal })
  return prisma.order.create({
    data: {
      orderNo: `TEST-${Math.random().toString(36).slice(2, 8)}`,
      userId,
      subtotal,
      total: subtotal,
      status,
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

describe('Thara activation backfill', () => {
  beforeEach(async () => {
    await resetDb()
    await seedSettings()
    process.env.THARA_ENABLED = 'true'
  })
  afterAll(() => {
    process.env.THARA_ENABLED = originalFlag
  })

  it('activates at enrolment when a qualifying order was already paid', async () => {
    const u = await makeUser()
    const past = await order(u.id, THARA_QUALIFYING_MIN_PAISE)

    const result = await enrollUser(u.id, 'v1')

    expect(result.status).toBe('active')
    const m = await getMembership(u.id)
    expect(m?.status).toBe('active')
    expect(m?.qualifyingOrderId).toBe(past.id)
    expect(m?.activatedAt).not.toBeNull()
  })

  it('stamps the OLDEST qualifying order as the one that unlocked the member', async () => {
    const u = await makeUser()
    const first = await order(u.id, 400_000)
    // Make the second order unambiguously later than the first.
    const second = await order(u.id, 900_000)
    await prisma.order.update({
      where: { id: second.id },
      data: { placedAt: new Date(Date.now() + 60_000) },
    })

    await enrollUser(u.id, 'v1')

    const m = await getMembership(u.id)
    expect(m?.qualifyingOrderId).toBe(first.id)
  })

  it('stays purchase_pending when past orders are all below the minimum', async () => {
    const u = await makeUser()
    // Two orders that TOGETHER clear ₹3,000 — they must not add up.
    await order(u.id, 200_000)
    await order(u.id, 200_000)

    const result = await enrollUser(u.id, 'v1')

    expect(result.status).toBe('purchase_pending')
    expect((await getMembership(u.id))?.qualifyingOrderId).toBeNull()
  })

  it('ignores an unpaid order of qualifying size', async () => {
    const u = await makeUser()
    await order(u.id, 500_000, 'pending')

    const result = await enrollUser(u.id, 'v1')

    expect(result.status).toBe('purchase_pending')
  })

  it('syncTharaActivation repairs a member already stuck in purchase_pending', async () => {
    const u = await makeUser()
    const { id } = await enrollUser(u.id, 'v1')
    expect((await getMembership(u.id))?.status).toBe('purchase_pending')

    // The order arrives afterwards, but through a path that never ran the
    // activation hook (e.g. an order marked paid by hand in the admin panel).
    const past = await order(u.id, 750_000)

    await syncTharaActivation(u.id)

    const m = await prisma.tharaMembership.findUnique({ where: { id } })
    expect(m?.status).toBe('active')
    expect(m?.qualifyingOrderId).toBe(past.id)
  })

  it('syncTharaActivation is a no-op for a non-member and for an active member', async () => {
    const stranger = await makeUser()
    await order(stranger.id, 900_000)
    await expect(syncTharaActivation(stranger.id)).resolves.toBeUndefined()
    expect(await getMembership(stranger.id)).toBeNull()

    const member = await makeUser()
    const qualifying = await order(member.id, 900_000)
    await enrollUser(member.id, 'v1')
    const before = await getMembership(member.id)

    await order(member.id, 950_000)
    await syncTharaActivation(member.id)

    const after = await getMembership(member.id)
    expect(after?.activatedAt?.getTime()).toBe(before?.activatedAt?.getTime())
    expect(after?.qualifyingOrderId).toBe(qualifying.id)
  })

  it('does not touch a suspended or deactivated membership', async () => {
    const u = await makeUser()
    const { id } = await enrollUser(u.id, 'v1')
    await prisma.tharaMembership.update({ where: { id }, data: { status: 'suspended' } })
    await order(u.id, 900_000)

    await syncTharaActivation(u.id)

    expect((await getMembership(u.id))?.status).toBe('suspended')
  })

  it('does nothing while the feature flag is off', async () => {
    process.env.THARA_ENABLED = 'false'
    const u = await makeUser()
    const { id } = await enrollUser(u.id, 'v1')
    await prisma.tharaMembership.update({ where: { id }, data: { status: 'purchase_pending' } })
    await order(u.id, 900_000)

    await syncTharaActivation(u.id)

    expect((await getMembership(u.id))?.status).toBe('purchase_pending')
  })
})

describe('getUnlockProgress', () => {
  beforeEach(async () => {
    await resetDb()
    await seedSettings()
    process.env.THARA_ENABLED = 'true'
  })

  it('reports the biggest SINGLE paid order, never the sum', async () => {
    const u = await makeUser()
    await order(u.id, 180_000)
    await order(u.id, 250_000)

    const p = await getUnlockProgress(u.id)

    expect(p.paidOrderCount).toBe(2)
    expect(p.bestOrderPaise).toBe(250_000)
    expect(p.qualified).toBe(false)
    expect(p.shortfallPaise).toBe(50_000)
  })

  it('is qualified with zero shortfall once a single order clears the bar', async () => {
    const u = await makeUser()
    const big = await order(u.id, 300_000)

    const p = await getUnlockProgress(u.id)

    expect(p.qualified).toBe(true)
    expect(p.shortfallPaise).toBe(0)
    expect(p.bestOrderNo).toBe(big.orderNo)
  })

  it('handles a shopper with no orders at all', async () => {
    const u = await makeUser()
    const p = await getUnlockProgress(u.id)
    expect(p).toMatchObject({
      bestOrderPaise: 0,
      bestOrderNo: null,
      paidOrderCount: 0,
      qualified: false,
      shortfallPaise: THARA_QUALIFYING_MIN_PAISE,
    })
  })
})
