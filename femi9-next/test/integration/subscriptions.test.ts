import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, seedSettings, makeProduct, prisma } from '../helpers/db'
import { createSubscription, pause, resume, generateDueOrders } from '@/lib/services/subscriptions'

/**
 * Subscriptions drive real recurring orders. The correctness invariant under test
 * is the renewal CLAIM: generateDueOrders atomically advances nextDeliveryAt as it
 * generates, so a due sub yields exactly ONE renewal order and a second immediate
 * run generates nothing. A reverted claim would let overlapping runs double-charge.
 */

async function makeCadence(code = '4w', days = 28) {
  return prisma.cadence.create({
    data: { code, label: 'Every 4 weeks', sub: 'Refill every 4 weeks', days },
  })
}

async function makeUser() {
  return prisma.user.create({
    data: { email: `u-${Math.random().toString(36).slice(2, 10)}@test.dev` },
  })
}

describe('subscriptions (integration)', () => {
  beforeEach(async () => {
    await resetDb()
    await seedSettings() // generateDueOrders reads subscribeSavePct / freeShipThreshold
  })

  it('createSubscription creates an active plan with nextDeliveryAt in the future', async () => {
    await makeCadence('4w', 28)
    const { variant } = await makeProduct({ stock: 20 })
    const user = await makeUser()

    const view = await createSubscription(user.id, { variantId: variant.id, qty: 2, cadenceCode: '4w' })

    expect(view.status).toBe('active')
    expect(view.qty).toBe(2)
    expect(view.cadenceCode).toBe('4w')

    const row = await prisma.subscription.findUniqueOrThrow({ where: { id: view.id } })
    expect(row.status).toBe('active')
    expect(row.qty).toBe(2)
    // Seeded to now + cadence.days — the first refill lands one interval out.
    expect(row.nextDeliveryAt.getTime()).toBeGreaterThan(Date.now())
  })

  it('pause then resume toggles status', async () => {
    await makeCadence('4w', 28)
    const { variant } = await makeProduct()
    const user = await makeUser()
    const view = await createSubscription(user.id, { variantId: variant.id, qty: 1, cadenceCode: '4w' })

    const paused = await pause(view.id, user.id)
    expect(paused?.status).toBe('paused')
    expect((await prisma.subscription.findUniqueOrThrow({ where: { id: view.id } })).status).toBe('paused')

    const resumed = await resume(view.id, user.id)
    expect(resumed?.status).toBe('active')
    expect((await prisma.subscription.findUniqueOrThrow({ where: { id: view.id } })).status).toBe('active')
  })

  it('generateDueOrders creates exactly one renewal for a due sub, and is idempotent', async () => {
    await makeCadence('4w', 28)
    const { variant } = await makeProduct({ price: 200, stock: 20 })
    const user = await makeUser()
    const view = await createSubscription(user.id, { variantId: variant.id, qty: 1, cadenceCode: '4w' })

    // Make it due: push nextDeliveryAt into the recent past. Advancing by 28 days
    // will land it back in the future, so it can only ever be claimed once here.
    await prisma.subscription.update({
      where: { id: view.id },
      data: { nextDeliveryAt: new Date(Date.now() - 86_400_000) },
    })

    // First run: one due sub → exactly one pending renewal order.
    const firstRun = await generateDueOrders()
    expect(firstRun).toBe(1)
    expect(await prisma.order.count()).toBe(1)

    const order = await prisma.order.findFirstOrThrow({ include: { items: true } })
    expect(order.userId).toBe(user.id)
    expect(order.status).toBe('pending')
    expect(order.items).toHaveLength(1)
    expect(order.items[0]!.variantId).toBe(variant.id)

    // The claim advanced nextDeliveryAt into the future → no longer due.
    const advanced = await prisma.subscription.findUniqueOrThrow({ where: { id: view.id } })
    expect(advanced.nextDeliveryAt.getTime()).toBeGreaterThan(Date.now())

    // Second run immediately after: ZERO additional orders (idempotent claim).
    const secondRun = await generateDueOrders()
    expect(secondRun).toBe(0)
    expect(await prisma.order.count()).toBe(1)
  })
})
