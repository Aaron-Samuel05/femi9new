import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (_name: string) => undefined }),
}))

import { resetDb, prisma, makeProduct, seedSettings, cartWith } from '../helpers/db'
import { placeOrder, markOrderPaid, type CheckoutCustomer } from '@femi9/core/services/checkout'
import { refundOrder } from '@femi9/core/services/admin/orders'
import {
  enrollUser,
  accrueTharaCommission,
  applyTharaCredit,
  getTharaCreditBalance,
  reverseTharaCreditForRefund,
} from '@femi9/core/services/thara'

function customer(phone: string, overrides: Partial<CheckoutCustomer> = {}): CheckoutCustomer {
  return {
    name: 'Test Buyer',
    phone,
    line: '1 Test Street',
    city: 'Chennai',
    state: 'Tamil Nadu',
    pincode: '600001',
    email: `${phone}@t.local`,
    ...overrides,
  }
}

async function activeMemberByPhone(phone: string) {
  const u = await prisma.user.upsert({
    where: { phone },
    update: {},
    create: { phone, role: 'customer' },
  })
  const { id } = await enrollUser('femi9', u.id, 'v1')
  await prisma.tharaMembership.update({
    where: { id },
    data: { status: 'active', activatedAt: new Date() },
  })
  return { userId: u.id, membershipId: id }
}

async function paidOrderForUser(userId: string, subtotal: number) {
  const { variant } = await makeProduct({ price: subtotal, stock: 5 })
  const order = await prisma.order.create({
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
  return order
}

describe('Thara wallet credit (sub-project C)', () => {
  const originalFlag = process.env.THARA_ENABLED

  beforeEach(async () => {
    await resetDb()
    await seedSettings()
    process.env.THARA_ENABLED = 'true'
  })
  afterEach(() => {
    process.env.THARA_ENABLED = originalFlag
  })

  it('accrueTharaCommission credits 10% of a locked downline order to the referrer', async () => {
    const referrer = await activeMemberByPhone('9000000201')
    const referredUser = await prisma.user.create({ data: { email: 'ref-b@t.local', role: 'customer' } })
    await prisma.tharaReferral.create({
      data: { referrerId: referrer.membershipId, referredUserId: referredUser.id, lockedAt: new Date() },
    })
    const order = await paidOrderForUser(referredUser.id, 300_000) // ₹3,000

    await prisma.$transaction((tx) => accrueTharaCommission(tx, order.id))

    const balance = await getTharaCreditBalance(prisma, referrer.userId)
    expect(balance).toBe(30_000) // 10% of ₹3,000 = ₹300 = 30 000 paise
  })

  it('does not accrue commission on a referral that has not been locked yet', async () => {
    const referrer = await activeMemberByPhone('9000000202')
    const referredUser = await prisma.user.create({ data: { email: 'ref-c@t.local', role: 'customer' } })
    await prisma.tharaReferral.create({
      data: { referrerId: referrer.membershipId, referredUserId: referredUser.id, lockedAt: null },
    })
    const order = await paidOrderForUser(referredUser.id, 500_000)

    await prisma.$transaction((tx) => accrueTharaCommission(tx, order.id))

    expect(await getTharaCreditBalance(prisma, referrer.userId)).toBe(0)
  })

  it('does not accrue when the referrer is not active (still purchase_pending)', async () => {
    const referrerUser = await prisma.user.create({ data: { email: 'pp@t.local', role: 'customer' } })
    const { id: refMemId } = await enrollUser('femi9', referrerUser.id, 'v1') // stays purchase_pending
    const referredUser = await prisma.user.create({ data: { email: 'ref-d@t.local', role: 'customer' } })
    await prisma.tharaReferral.create({
      data: { referrerId: refMemId, referredUserId: referredUser.id, lockedAt: new Date() },
    })
    const order = await paidOrderForUser(referredUser.id, 400_000)

    await prisma.$transaction((tx) => accrueTharaCommission(tx, order.id))

    expect(await getTharaCreditBalance(prisma, referrerUser.id)).toBe(0)
  })

  it('does not accrue when the referrer is suspended', async () => {
    const referrer = await activeMemberByPhone('9000000203')
    await prisma.tharaMembership.update({
      where: { id: referrer.membershipId },
      data: { status: 'suspended', suspendedAt: new Date() },
    })
    const referredUser = await prisma.user.create({ data: { email: 'ref-e@t.local', role: 'customer' } })
    await prisma.tharaReferral.create({
      data: { referrerId: referrer.membershipId, referredUserId: referredUser.id, lockedAt: new Date() },
    })
    const order = await paidOrderForUser(referredUser.id, 400_000)

    await prisma.$transaction((tx) => accrueTharaCommission(tx, order.id))

    expect(await getTharaCreditBalance(prisma, referrer.userId)).toBe(0)
  })

  it('applyTharaCredit reduces balance by up to wantPaise', async () => {
    const u = await prisma.user.create({ data: { email: 'balance@t.local', role: 'customer' } })
    // Seed a positive balance manually.
    await prisma.tharaCreditLedger.create({
      data: { userId: u.id, delta: 50_000, reason: 'referral-commission', balanceAfter: 50_000 },
    })
    const order = await paidOrderForUser(u.id, 100_000)

    const applied = await prisma.$transaction((tx) => applyTharaCredit(tx, u.id, order.id, 30_000))
    expect(applied).toBe(30_000)
    expect(await getTharaCreditBalance(prisma, u.id)).toBe(20_000)
  })

  it('applyTharaCredit caps at available balance', async () => {
    const u = await prisma.user.create({ data: { email: 'balance-b@t.local', role: 'customer' } })
    await prisma.tharaCreditLedger.create({
      data: { userId: u.id, delta: 20_000, reason: 'referral-commission', balanceAfter: 20_000 },
    })
    const order = await paidOrderForUser(u.id, 100_000)

    const applied = await prisma.$transaction((tx) => applyTharaCredit(tx, u.id, order.id, 100_000))
    expect(applied).toBe(20_000) // capped at available
    expect(await getTharaCreditBalance(prisma, u.id)).toBe(0)
  })

  it('placeOrder auto-applies existing credit to the current cart', async () => {
    const activeMember = await activeMemberByPhone('9000000210')
    // Seed the member with credit as if they had earned it earlier.
    await prisma.tharaCreditLedger.create({
      data: { userId: activeMember.userId, delta: 20_000, reason: 'referral-commission', balanceAfter: 20_000 },
    })

    const { variant } = await makeProduct({ price: 100_000, stock: 5 })
    const token = 'guest-c-01'
    await cartWith(token, variant.id, 1)

    const { orderNo } = await placeOrder('femi9', token, customer('9000000210'))
    const order = await prisma.order.findUnique({ where: { orderNo } })
    // Subtotal ₹1,000 = 100 000 paise, below discount slab so no personal discount,
    // credit of ₹200 should apply.
    expect(order?.subtotal).toBe(100_000)
    expect(order?.discount).toBe(20_000)
    expect(order?.total).toBe(100_000 - 20_000 + (order?.shipping ?? 0))
    expect(await getTharaCreditBalance(prisma, activeMember.userId)).toBe(0)
  })

  it('reverseTharaCreditForRefund reverses commission on the referrer and gives credit back to the buyer', async () => {
    const referrer = await activeMemberByPhone('9000000220')
    const referredUser = await prisma.user.create({ data: { email: 'refbuy@t.local', role: 'customer' } })
    await prisma.tharaReferral.create({
      data: { referrerId: referrer.membershipId, referredUserId: referredUser.id, lockedAt: new Date() },
    })
    // Seed buyer with credit + apply it during the paid order.
    await prisma.tharaCreditLedger.create({
      data: { userId: referredUser.id, delta: 10_000, reason: 'referral-commission', balanceAfter: 10_000 },
    })
    const order = await paidOrderForUser(referredUser.id, 500_000)
    await prisma.$transaction(async (tx) => {
      await accrueTharaCommission(tx, order.id) // referrer earns 50 000
      await applyTharaCredit(tx, referredUser.id, order.id, 10_000) // buyer spends 10 000
    })
    expect(await getTharaCreditBalance(prisma, referrer.userId)).toBe(50_000)
    expect(await getTharaCreditBalance(prisma, referredUser.id)).toBe(0)

    await prisma.$transaction((tx) => reverseTharaCreditForRefund(tx, order.id))

    expect(await getTharaCreditBalance(prisma, referrer.userId)).toBe(0) // commission reversed
    expect(await getTharaCreditBalance(prisma, referredUser.id)).toBe(10_000) // credit restored
  })

  it('does nothing on refund of an order with no Thara ledger rows', async () => {
    const u = await prisma.user.create({ data: { email: 'plain@t.local', role: 'customer' } })
    const order = await paidOrderForUser(u.id, 500_000)
    await expect(
      prisma.$transaction((tx) => reverseTharaCreditForRefund(tx, order.id)),
    ).resolves.not.toThrow()
  })
})
