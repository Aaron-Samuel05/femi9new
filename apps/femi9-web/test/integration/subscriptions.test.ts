import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, seedSettings, makeProduct, prisma } from '../helpers/db'
import {
  createSubscription,
  authorizationFor,
  listForUser,
  confirmMandate,
  pause,
  resume,
  skipNext,
  cancel,
  recordSubscriptionCharge,
  resumeDueSkips,
  syncGatewayStatus,
  generateDueOrders,
} from '@femi9/core/services/subscriptions'

/**
 * Subscriptions are billed by a Razorpay MANDATE: the gateway owns the calendar,
 * debits on its own schedule, and reports each success as `subscription.charged`.
 * The invariants under test are therefore the ones that decide money:
 *
 *  - A new plan is INERT until its mandate is authorised. It must not be active,
 *    must not appear due, and must never be renewed by the legacy cron.
 *  - One charge produces exactly ONE paid order, and a redelivered webhook
 *    produces none — Razorpay retries, and a non-idempotent handler would ship
 *    and bill twice for one debit.
 *  - A charge is NEVER refused. Once the bank has moved the money, a stock
 *    shortfall must still produce an order; refusing would lose a paid sale.
 *  - `generateDueOrders` touches legacy plans ONLY. A mandated plan renewed by
 *    cron as well as by the gateway means two boxes a cycle, one of them unpaid.
 *
 * Provider credentials are blank in vitest.config.ts with ALLOW_MOCK_PROVIDERS
 * set, so the gateway seam returns deterministic `mock_*` handles and no test
 * here touches the network.
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

/** A plan whose mandate has been authorised — the normal live state. */
async function makeActivePlan(opts?: { price?: number; stock?: number; qty?: number }) {
  await makeCadence('4w', 28)
  const { variant } = await makeProduct({ price: opts?.price ?? 400, stock: opts?.stock ?? 50 })
  const user = await makeUser()
  const { subscription, authorization } = await createSubscription('femi9', user.id, {
    variantId: variant.id,
    qty: opts?.qty ?? 1,
    cadenceCode: '4w',
  })
  await confirmMandate('femi9', authorization.razorpaySubscriptionId, 'authenticated')
  return { user, variant, subscription, authorization }
}

describe('subscriptions (integration)', () => {
  beforeEach(async () => {
    await resetDb()
    await seedSettings() // the money path reads subscribeSavePct / freeShipThreshold
  })

  it('createSubscription leaves the plan INERT until the mandate is authorised', async () => {
    await makeCadence('4w', 28)
    const { variant } = await makeProduct({ price: 400, stock: 20 })
    const user = await makeUser()

    const { subscription, authorization } = await createSubscription('femi9', user.id, {
      variantId: variant.id,
      qty: 2,
      cadenceCode: '4w',
    })

    expect(subscription.status).toBe('pending_mandate')
    expect(subscription.mandateActive).toBe(false)
    expect(subscription.qty).toBe(2)
    // 400 × 2 = 800, less the seeded 15% subscribe saving = 680, under the 999
    // free-ship threshold so +49 courier.
    expect(subscription.chargeAmount).toBe(729)
    expect(authorization.razorpaySubscriptionId).toMatch(/^mock_sub_/)

    // Nothing has been charged and nothing has been ordered.
    expect(await prisma.order.count()).toBe(0)
    expect(await prisma.payment.count()).toBe(0)

    const row = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } })
    expect(row.status).toBe('pending_mandate')
    expect(row.mandateAuthedAt).toBeNull()
    expect(row.razorpaySubscriptionId).toBe(authorization.razorpaySubscriptionId)
  })

  it('confirmMandate activates the plan, and is idempotent', async () => {
    const { subscription, authorization } = await makeActivePlan()

    const row = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } })
    expect(row.status).toBe('active')
    expect(row.mandateAuthedAt).not.toBeNull()

    // The webhook confirms the same mandate independently of the sync return.
    // A second confirmation must not move mandateAuthedAt or re-activate a plan
    // the customer has since cancelled.
    const firstAuthedAt = row.mandateAuthedAt
    await confirmMandate('femi9', authorization.razorpaySubscriptionId, 'active')
    const again = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } })
    expect(again.mandateAuthedAt).toEqual(firstAuthedAt)
  })

  it('reuses one Razorpay plan for two subscriptions billing the same amount', async () => {
    await makeCadence('4w', 28)
    const { variant } = await makeProduct({ price: 400, stock: 50 })
    const a = await makeUser()
    const b = await makeUser()

    const first = await createSubscription('femi9', a.id, {
      variantId: variant.id,
      qty: 1,
      cadenceCode: '4w',
    })
    const second = await createSubscription('femi9', b.id, {
      variantId: variant.id,
      qty: 1,
      cadenceCode: '4w',
    })

    // Same amount, same rhythm ⇒ one cached plan, not one per subscribe click.
    expect(await prisma.razorpayPlan.count()).toBe(1)
    const rows = await prisma.subscription.findMany({
      where: { id: { in: [first.subscription.id, second.subscription.id] } },
      select: { razorpayPlanId: true },
    })
    expect(rows[0]!.razorpayPlanId).toBe(rows[1]!.razorpayPlanId)
  })

  it('recordSubscriptionCharge creates ONE paid order, and redelivery creates none', async () => {
    const { user, variant, subscription, authorization } = await makeActivePlan({
      price: 400,
      stock: 10,
    })
    const charge = {
      razorpaySubscriptionId: authorization.razorpaySubscriptionId,
      razorpayPaymentId: 'pay_test_0001',
      razorpayOrderId: 'order_test_0001',
      amountPaise: 729_00,
      method: 'upi',
    }

    const first = await recordSubscriptionCharge('femi9', charge)
    expect(first?.alreadyRecorded).toBe(false)
    expect(await prisma.order.count()).toBe(1)

    const order = await prisma.order.findFirstOrThrow({ include: { items: true, payments: true } })
    // Born PAID — this is the whole point of the mandate design. The previous
    // pay-later renewal created a `pending` order with no Payment row that
    // nobody was ever asked to pay.
    expect(order.status).toBe('paid')
    expect(order.total).toBe(729)
    expect(order.userId).toBe(user.id)
    expect(order.subscriptionId).toBe(subscription.id)
    expect(order.payments).toHaveLength(1)
    expect(order.payments[0]!.razorpayPaymentId).toBe('pay_test_0001')
    expect(order.items[0]!.variantId).toBe(variant.id)

    // Stock was reserved once.
    expect((await prisma.productVariant.findUniqueOrThrow({ where: { id: variant.id } })).stock).toBe(9)

    // Razorpay redelivers webhooks. The same payment id must not bill twice.
    const replay = await recordSubscriptionCharge('femi9', charge)
    expect(replay?.alreadyRecorded).toBe(true)
    expect(await prisma.order.count()).toBe(1)
    expect((await prisma.productVariant.findUniqueOrThrow({ where: { id: variant.id } })).stock).toBe(9)
  })

  it('never refuses a charge that is out of stock — the money is already taken', async () => {
    const { variant, authorization } = await makeActivePlan({ price: 400, stock: 0 })

    const result = await recordSubscriptionCharge('femi9', {
      razorpaySubscriptionId: authorization.razorpaySubscriptionId,
      razorpayPaymentId: 'pay_test_oos',
      razorpayOrderId: 'order_test_oos',
      amountPaise: 729_00,
    })

    // The order EXISTS and is paid. Refusing it would mean the bank had moved
    // the money and we had recorded nothing.
    expect(result?.alreadyRecorded).toBe(false)
    const order = await prisma.order.findFirstOrThrow()
    expect(order.status).toBe('paid')
    expect(order.total).toBe(729)
    // Stock is floored, never negative.
    expect((await prisma.productVariant.findUniqueOrThrow({ where: { id: variant.id } })).stock).toBe(0)
  })

  it('books what the bank actually took when the catalogue price has moved', async () => {
    const { variant, authorization } = await makeActivePlan({ price: 400, stock: 10 })
    // The shelf price rises after the mandate was authorised. Razorpay keeps
    // debiting the plan amount — an authorised mandate cannot be re-priced.
    await prisma.productVariant.update({ where: { id: variant.id }, data: { price: 500 } })

    await recordSubscriptionCharge('femi9', {
      razorpaySubscriptionId: authorization.razorpaySubscriptionId,
      razorpayPaymentId: 'pay_test_drift',
      razorpayOrderId: 'order_test_drift',
      amountPaise: 729_00,
    })

    const order = await prisma.order.findFirstOrThrow()
    // The order total is the charge, not the recomputed quote (500 - 15% + 49 = 474).
    expect(order.total).toBe(729)
    // …and it still balances: subtotal - discount + shipping === total.
    expect(order.subtotal - order.discount + order.shipping).toBe(order.total)
  })

  it('pause / resume / cancel move the local row', async () => {
    const { user, subscription } = await makeActivePlan()

    expect((await pause('femi9', subscription.id, user.id))?.status).toBe('paused')
    expect(
      (await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } })).status,
    ).toBe('paused')

    expect((await resume('femi9', subscription.id, user.id))?.status).toBe('active')
    expect((await cancel('femi9', subscription.id, user.id))?.status).toBe('cancelled')
  })

  it('skipNext pauses the mandate and schedules the resume the cron performs', async () => {
    const { user, subscription } = await makeActivePlan()

    const skipped = await skipNext('femi9', subscription.id, user.id)
    expect(skipped?.status).toBe('paused')

    // Razorpay has no skip-one-cycle primitive, so a skip is a pause plus a
    // scheduled resume. Without `resumeAt` the pause would be permanent.
    const row = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } })
    expect(row.resumeAt).not.toBeNull()
    expect(row.resumeAt!.getTime()).toBeGreaterThan(Date.now())

    // Not yet due → the cron leaves it alone.
    expect(await resumeDueSkips('femi9')).toBe(0)

    // Once the skipped cycle has passed, it comes back on its own.
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { resumeAt: new Date(Date.now() - 1000) },
    })
    expect(await resumeDueSkips('femi9')).toBe(1)
    const resumed = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } })
    expect(resumed.status).toBe('active')
    expect(resumed.resumeAt).toBeNull()
  })

  it('a manual pause is never woken up by the skip cron', async () => {
    const { user, subscription } = await makeActivePlan()
    await skipNext('femi9', subscription.id, user.id)
    // She then decides to pause indefinitely. That must clear the pending skip,
    // or the cron un-pauses a plan she deliberately stopped.
    await pause('femi9', subscription.id, user.id)

    expect(
      (await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } })).resumeAt,
    ).toBeNull()
    expect(await resumeDueSkips('femi9')).toBe(0)
  })

  it('distinguishes "needs a mandate" from "has no mandate" (legacy plans)', async () => {
    await makeCadence('4w', 28)
    const { variant } = await makeProduct({ price: 400, stock: 10 })
    const user = await makeUser()

    // Abandoned at the Checkout sheet: there IS an authorisation to re-open.
    const { subscription } = await createSubscription('femi9', user.id, {
      variantId: variant.id,
      qty: 1,
      cadenceCode: '4w',
    })
    let mine = await listForUser('femi9', user.id)
    expect(mine[0]!.mandateActive).toBe(false)
    expect(mine[0]!.needsMandate).toBe(true)
    expect(await authorizationFor('femi9', subscription.id, user.id)).not.toBeNull()

    // A LEGACY pay-later plan ALSO has no mandate — and nothing to authorise.
    // Rendering the "Set up auto-pay" CTA from `!mandateActive` would put a
    // button on every plan that predates mandates, and it would 404.
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { razorpaySubscriptionId: null, razorpayPlanId: null, chargeAmount: null },
    })
    mine = await listForUser('femi9', user.id)
    expect(mine[0]!.mandateActive).toBe(false)
    expect(mine[0]!.needsMandate).toBe(false)
    expect(await authorizationFor('femi9', subscription.id, user.id)).toBeNull()
  })

  it('refuses pause / resume / skip on a mandate the bank never approved', async () => {
    await makeCadence('4w', 28)
    const { variant } = await makeProduct({ price: 400, stock: 10 })
    const user = await makeUser()
    // Deliberately NOT confirmed — she closed the Checkout sheet.
    const { subscription } = await createSubscription('femi9', user.id, {
      variantId: variant.id,
      qty: 1,
      cadenceCode: '4w',
    })

    // The storefront hides these controls, but the storefront is not the gate:
    // asking Razorpay to pause a mandate it has never authorised fails with a
    // gateway error that reads to a customer like an outage.
    expect(await pause('femi9', subscription.id, user.id)).toBeNull()
    expect(await resume('femi9', subscription.id, user.id)).toBeNull()
    expect(await skipNext('femi9', subscription.id, user.id)).toBeNull()

    // Cancelling is the exception — abandoning an unauthorised plan must work.
    expect((await cancel('femi9', subscription.id, user.id))?.status).toBe('cancelled')
  })

  it('a charge on a cancelled plan is recorded but does not resurrect it', async () => {
    const { user, subscription, authorization } = await makeActivePlan({ price: 400, stock: 10 })
    await cancel('femi9', subscription.id, user.id)

    await recordSubscriptionCharge('femi9', {
      razorpaySubscriptionId: authorization.razorpaySubscriptionId,
      razorpayPaymentId: 'pay_test_after_cancel',
      razorpayOrderId: 'order_test_after_cancel',
      amountPaise: 729_00,
    })

    // She paid for it, so it must ship…
    const order = await prisma.order.findFirstOrThrow()
    expect(order.status).toBe('paid')
    // …but the plan she ended stays ended.
    expect(
      (await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } })).status,
    ).toBe('cancelled')
  })

  it('syncGatewayStatus halts a plan Razorpay gave up on', async () => {
    const { subscription, authorization } = await makeActivePlan()

    await syncGatewayStatus('femi9', authorization.razorpaySubscriptionId, 'halted')

    const row = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } })
    expect(row.status).toBe('halted')
    expect(row.gatewayStatus).toBe('halted')
    // A halted plan must never be renewed by the legacy cron either.
    expect(await generateDueOrders('femi9')).toBe(0)
  })

  it('generateDueOrders IGNORES gateway-managed plans', async () => {
    const { subscription } = await makeActivePlan({ price: 200, stock: 20 })

    // Force it due. A mandated plan must still generate nothing here: Razorpay
    // is already debiting it, and a cron renewal on top would mean two boxes a
    // cycle, one of them unpaid and holding stock forever.
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { nextDeliveryAt: new Date(Date.now() - 86_400_000) },
    })

    expect(await generateDueOrders('femi9')).toBe(0)
    expect(await prisma.order.count()).toBe(0)
  })

  it('generateDueOrders still renews a LEGACY pay-later plan, and is idempotent', async () => {
    const { subscription } = await makeActivePlan({ price: 200, stock: 20 })
    // Strip the mandate to make it look like a plan created before this change.
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        razorpaySubscriptionId: null,
        razorpayPlanId: null,
        chargeAmount: null,
        nextDeliveryAt: new Date(Date.now() - 86_400_000),
      },
    })

    // First run: one due sub → exactly one PENDING renewal order (unchanged
    // legacy behaviour — these plans never had a mandate to charge).
    expect(await generateDueOrders('femi9')).toBe(1)
    expect(await prisma.order.count()).toBe(1)
    const order = await prisma.order.findFirstOrThrow({ include: { items: true } })
    expect(order.status).toBe('pending')
    expect(order.items).toHaveLength(1)

    // The claim advanced nextDeliveryAt into the future → no longer due.
    const advanced = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } })
    expect(advanced.nextDeliveryAt.getTime()).toBeGreaterThan(Date.now())

    // Second run immediately after: ZERO additional orders (idempotent claim).
    expect(await generateDueOrders('femi9')).toBe(0)
    expect(await prisma.order.count()).toBe(1)
  })
})
