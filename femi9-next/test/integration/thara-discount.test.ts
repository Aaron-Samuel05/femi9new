import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Same shim as checkout.test.ts — placeOrder calls next/headers cookies().
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (_name: string) => undefined }),
}))

import { resetDb, prisma, makeProduct, seedSettings, cartWith } from '../helpers/db'
import { placeOrder, type CheckoutCustomer } from '@/lib/services/checkout'
import {
  enrollUser,
  computeTharaDiscount,
  TharaDiscountSlabs,
} from '@/lib/services/thara'

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

async function activateMemberByPhone(phone: string) {
  const u = await prisma.user.upsert({
    where: { phone },
    update: {},
    create: { phone, role: 'customer' },
  })
  const { id } = await enrollUser(u.id, 'v1')
  await prisma.tharaMembership.update({
    where: { id },
    data: { status: 'active', activatedAt: new Date() },
  })
  return { userId: u.id, membershipId: id }
}

describe('Thara personal discount (sub-project B)', () => {
  const originalFlag = process.env.THARA_ENABLED

  beforeEach(async () => {
    await resetDb()
    await seedSettings()
    process.env.THARA_ENABLED = 'true'
  })
  afterEach(() => {
    process.env.THARA_ENABLED = originalFlag
  })

  it('applies 10% off when cart is ₹3,000 and buyer is an active member', async () => {
    const { variant } = await makeProduct({ price: 300_000, stock: 5 })
    const token = 'guest-b-01'
    await cartWith(token, variant.id, 1) // subtotal = ₹3,000
    await activateMemberByPhone('9000000101')

    const { orderNo } = await placeOrder(token, customer('9000000101'))
    const order = await prisma.order.findUnique({ where: { orderNo } })
    expect(order?.subtotal).toBe(300_000)
    expect(order?.discount).toBe(30_000) // 10% of 300 000
    expect(order?.total).toBe(300_000 - 30_000 + (order?.shipping ?? 0))
  })

  it('applies 15% off in the ₹6,000–₹8,999 slab', async () => {
    const { variant } = await makeProduct({ price: 600_000, stock: 5 })
    const token = 'guest-b-02'
    await cartWith(token, variant.id, 1)
    await activateMemberByPhone('9000000102')

    const { orderNo } = await placeOrder(token, customer('9000000102'))
    const order = await prisma.order.findUnique({ where: { orderNo } })
    expect(order?.discount).toBe(90_000) // 15% of 600 000
  })

  it('applies 20% off at ₹9,000 and above', async () => {
    const { variant } = await makeProduct({ price: 900_000, stock: 5 })
    const token = 'guest-b-03'
    await cartWith(token, variant.id, 1)
    await activateMemberByPhone('9000000103')

    const { orderNo } = await placeOrder(token, customer('9000000103'))
    const order = await prisma.order.findUnique({ where: { orderNo } })
    expect(order?.discount).toBe(180_000) // 20% of 900 000
  })

  it('applies no discount when cart is below ₹3,000, even for active members', async () => {
    const { variant } = await makeProduct({ price: 299_900, stock: 5 })
    const token = 'guest-b-04'
    await cartWith(token, variant.id, 1)
    await activateMemberByPhone('9000000104')

    const { orderNo } = await placeOrder(token, customer('9000000104'))
    const order = await prisma.order.findUnique({ where: { orderNo } })
    expect(order?.discount).toBe(0)
  })

  it('applies no discount to purchase_pending members (they haven\'t completed a qualifying order)', async () => {
    const { variant } = await makeProduct({ price: 500_000, stock: 5 })
    const token = 'guest-b-05'
    await cartWith(token, variant.id, 1)
    // Enroll but do NOT activate.
    const u = await prisma.user.upsert({
      where: { phone: '9000000105' },
      update: {},
      create: { phone: '9000000105', role: 'customer' },
    })
    await enrollUser(u.id, 'v1')

    const { orderNo } = await placeOrder(token, customer('9000000105'))
    const order = await prisma.order.findUnique({ where: { orderNo } })
    expect(order?.discount).toBe(0)
  })

  it('applies no discount to non-members', async () => {
    const { variant } = await makeProduct({ price: 500_000, stock: 5 })
    const token = 'guest-b-06'
    await cartWith(token, variant.id, 1)

    const { orderNo } = await placeOrder(token, customer('9000000106'))
    const order = await prisma.order.findUnique({ where: { orderNo } })
    expect(order?.discount).toBe(0)
  })

  it('applies no discount to suspended members', async () => {
    const { variant } = await makeProduct({ price: 500_000, stock: 5 })
    const token = 'guest-b-07'
    await cartWith(token, variant.id, 1)
    const { membershipId } = await activateMemberByPhone('9000000107')
    await prisma.tharaMembership.update({
      where: { id: membershipId },
      data: { status: 'suspended', suspendedAt: new Date() },
    })

    const { orderNo } = await placeOrder(token, customer('9000000107'))
    const order = await prisma.order.findUnique({ where: { orderNo } })
    expect(order?.discount).toBe(0)
  })

  it('applies no discount when THARA_ENABLED is off', async () => {
    const { variant } = await makeProduct({ price: 500_000, stock: 5 })
    const token = 'guest-b-08'
    await cartWith(token, variant.id, 1)
    await activateMemberByPhone('9000000108')

    process.env.THARA_ENABLED = 'false'

    const { orderNo } = await placeOrder(token, customer('9000000108'))
    const order = await prisma.order.findUnique({ where: { orderNo } })
    expect(order?.discount).toBe(0)
  })

  it('computeTharaDiscount picks the right slab at exact boundaries', async () => {
    const u = await prisma.user.create({ data: { email: 'boundary@t.local', role: 'customer' } })
    const { id } = await enrollUser(u.id, 'v1')
    await prisma.tharaMembership.update({ where: { id }, data: { status: 'active', activatedAt: new Date() } })

    await prisma.$transaction(async (tx) => {
      const at3000 = await computeTharaDiscount(tx, u.id, 300_000)
      expect(at3000.slab).toBe('10')
      const at5999 = await computeTharaDiscount(tx, u.id, 599_900)
      expect(at5999.slab).toBe('10')
      const at6000 = await computeTharaDiscount(tx, u.id, 600_000)
      expect(at6000.slab).toBe('15')
      const at8999 = await computeTharaDiscount(tx, u.id, 899_900)
      expect(at8999.slab).toBe('15')
      const at9000 = await computeTharaDiscount(tx, u.id, 900_000)
      expect(at9000.slab).toBe('20')
    })
  })
})
