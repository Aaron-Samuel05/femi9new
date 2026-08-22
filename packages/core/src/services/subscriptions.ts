import 'server-only'
import { Prisma } from '@prisma/client'
import type { SubscriptionStatus } from '@prisma/client'
import { prisma } from '../db'
import { applyZonePrice, resolveZone } from './pricing'
import { getSettings } from './settings'

/**
 * Subscriptions service — real, per-user recurring orders, replacing the old
 * localStorage-only "Subscribe & save" toggle on the product page.
 *
 * A Subscription pins a ProductVariant + qty to a Cadence (cycle / 4w / 6w). The
 * customer-facing reads/writes here are all OWNERSHIP-CHECKED — every mutation is
 * scoped by { id, userId } so one shopper can never touch another's plan.
 *
 * Renewals are driven by generateDueOrders(), which the cron endpoint calls: it
 * turns each due subscription into a real pending Order (mirroring checkout's
 * order-creation shape) with the subscribe discount applied. Payment for renewals
 * is pay-later/pending per the roadmap, so no gateway/loyalty side-effects run
 * here — the order simply awaits collection like any unpaid order.
 */

// Flat courier fee below the free-shipping threshold. Mirrors checkout.SHIPPING_FEE
// (that constant isn't exported); kept here so renewal totals match a normal order.
const SHIPPING_FEE = 49

/** Cadence code (cycle/4w/6w) didn't resolve to a Cadence row. Route → 400. */
export class CadenceNotFoundError extends Error {
  constructor(code: string) {
    super(`Unknown cadence: ${code}`)
    this.name = 'CadenceNotFoundError'
  }
}

/** The chosen variant no longer exists. Route → 400 (stale product option). */
export class VariantNotFoundError extends Error {
  constructor(id: string) {
    super(`Variant not found: ${id}`)
    this.name = 'VariantNotFoundError'
  }
}

/** A renewal can't be fulfilled because the variant is out of stock. Internal —
 *  generateDueOrders catches it, leaves the sub due, and moves on. */
class RenewalOutOfStockError extends Error {
  constructor(itemName: string) {
    super(`Out of stock: ${itemName}`)
    this.name = 'RenewalOutOfStockError'
  }
}

// ── View model (serializable; what the API returns + Account.tsx reflects) ─────

export interface SubscriptionView {
  id: string
  product: string
  variantLabel: string
  qty: number
  cadenceCode: string
  frequency: string // cadence.label, e.g. "Every 4 weeks"
  nextDelivery: string // "18 Jun 2026" — matches the account read model's format
  status: SubscriptionStatus
  saved: number // savedTotal, rupees
}

// Relations every view/renewal needs: the product name + variant scalars (price,
// stock, label come free with `variant`) and the cadence (code/label/days).
const subInclude = {
  variant: { include: { product: { select: { name: true } } } },
  cadence: true,
} satisfies Prisma.SubscriptionInclude

type SubRow = Prisma.SubscriptionGetPayload<{ include: typeof subInclude }>

// ── Formatting helpers ─────────────────────────────────────────────────────────

// Built from parts so the output is a guaranteed "18 Jun 2026" regardless of the
// locale's default separators — identical to services/account.ts so the two
// subscription surfaces read the same date the same way.
const DMY = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
function fmtDate(d: Date): string {
  const parts = DMY.formatToParts(d)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return `${get('day')} ${get('month')} ${get('year')}`
}

/** now + n days. Cadence intervals are whole days, so plain ms arithmetic is exact. */
function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * 86_400_000)
}

function toView(s: SubRow): SubscriptionView {
  return {
    id: s.id,
    product: s.variant.product.name,
    variantLabel: s.variant.label,
    qty: s.qty,
    cadenceCode: s.cadence.code,
    frequency: s.cadence.label,
    nextDelivery: fmtDate(s.nextDeliveryAt),
    status: s.status,
    saved: s.savedTotal,
  }
}

// ── Customer reads/writes (all ownership-checked) ───────────────────────────────

export interface CreateSubscriptionInput {
  variantId: string
  qty: number
  cadenceCode: string
}

/**
 * Start a subscription for `userId`. nextDeliveryAt is seeded to now + cadence.days
 * (the first refill lands one interval out) and savedTotal starts at 0 — it only
 * accrues as renewals are generated. Rejects an unknown cadence/variant with a
 * typed error the route maps to a 400.
 */
export async function createSubscription(
  userId: string,
  input: CreateSubscriptionInput,
): Promise<SubscriptionView> {
  const cadence = await prisma.cadence.findUnique({ where: { code: input.cadenceCode } })
  if (!cadence) throw new CadenceNotFoundError(input.cadenceCode)

  const variant = await prisma.productVariant.findUnique({ where: { id: input.variantId } })
  if (!variant) throw new VariantNotFoundError(input.variantId)

  const qty = Math.max(1, Math.floor(input.qty) || 1)

  const sub = await prisma.subscription.create({
    data: {
      userId,
      variantId: variant.id,
      qty,
      cadenceId: cadence.id,
      status: 'active',
      nextDeliveryAt: addDays(new Date(), cadence.days),
      savedTotal: 0,
    },
    include: subInclude,
  })
  return toView(sub)
}

/** Every subscription for the signed-in customer, newest first. */
export async function listForUser(userId: string): Promise<SubscriptionView[]> {
  const subs = await prisma.subscription.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    include: subInclude,
  })
  return subs.map(toView)
}

/** Re-read a subscription scoped to its owner → view, or null (not owned/gone). */
async function ownedView(id: string, userId: string): Promise<SubscriptionView | null> {
  const sub = await prisma.subscription.findFirst({ where: { id, userId }, include: subInclude })
  return sub ? toView(sub) : null
}

/**
 * Flip status, ownership-scoped. updateMany's `where: { id, userId }` is the guard
 * (count 0 ⇒ not the owner or gone ⇒ null ⇒ 404 at the route) so we never leak the
 * existence of another user's subscription.
 */
async function setStatus(
  id: string,
  userId: string,
  status: SubscriptionStatus,
): Promise<SubscriptionView | null> {
  const res = await prisma.subscription.updateMany({ where: { id, userId }, data: { status } })
  if (res.count === 0) return null
  return ownedView(id, userId)
}

export function pause(id: string, userId: string): Promise<SubscriptionView | null> {
  return setStatus(id, userId, 'paused')
}

export function resume(id: string, userId: string): Promise<SubscriptionView | null> {
  return setStatus(id, userId, 'active')
}

export function cancel(id: string, userId: string): Promise<SubscriptionView | null> {
  return setStatus(id, userId, 'cancelled')
}

/**
 * Skip the next delivery: push nextDeliveryAt out by one cadence interval. Reads
 * the sub scoped to its owner first (so we have the current date + cadence.days),
 * then advances — returns null when it isn't the caller's subscription.
 */
export async function skipNext(id: string, userId: string): Promise<SubscriptionView | null> {
  const sub = await prisma.subscription.findFirst({
    where: { id, userId },
    include: { cadence: true },
  })
  if (!sub) return null
  await prisma.subscription.update({
    where: { id: sub.id },
    data: { nextDeliveryAt: addDays(sub.nextDeliveryAt, sub.cadence.days) },
  })
  return ownedView(id, userId)
}

// ── Renewals (cron) ─────────────────────────────────────────────────────────────

/** True when a write hit a unique-constraint violation (e.g. two concurrent
 *  renewals derived the same orderNo). Retryable. */
function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
}

/** Next sequential FM-order number, continuing past the current max. Mirrors
 *  checkout's generator so subscription orders share the same numbering space. */
async function nextOrderNo(tx: Prisma.TransactionClient): Promise<string> {
  const last = await tx.order.findFirst({
    where: { orderNo: { startsWith: 'FM-' } },
    orderBy: { orderNo: 'desc' },
    select: { orderNo: true },
  })
  const lastNum = last ? Number.parseInt(last.orderNo.slice(3), 10) : 0
  const nextNum = (Number.isFinite(lastNum) ? lastNum : 0) + 1
  return 'FM-' + String(nextNum).padStart(5, '0')
}

/**
 * Turn one due subscription into a pending Order. The whole thing (stock re-read,
 * order write, stock decrement, cadence advance + savedTotal accrual) runs in a
 * single transaction so a mid-flight failure can never leave a half-created order
 * or a double-decremented variant. Throws RenewalOutOfStockError when the variant
 * can't cover the qty, which leaves the subscription untouched (still due) to retry
 * on a later run once restocked.
 */
async function createRenewalOrder(
  sub: SubRow,
  subscribeSavePct: number,
  freeShipThreshold: number,
): Promise<void> {
  // Two concurrent generations (overlapping/retried cron runs) can derive the
  // same FM- orderNo — max-scan + create isn't atomic against a peer, so the
  // unique index rejects the loser with P2002. Retry the whole transaction: the
  // atomic claim below still guards against double-generating, and nextOrderNo
  // re-scans for a fresh number on the retry.
  const MAX_ATTEMPTS = 5
  for (let attempt = 1; ; attempt++) {
    try {
      await runRenewalTxn(sub, subscribeSavePct, freeShipThreshold)
      return
    } catch (err) {
      if (isUniqueViolation(err) && attempt < MAX_ATTEMPTS) continue
      throw err
    }
  }
}

async function runRenewalTxn(
  sub: SubRow,
  subscribeSavePct: number,
  freeShipThreshold: number,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // ── CLAIM ──────────────────────────────────────────────────────────────
    // Atomically claim this due subscription before generating anything. This
    // conditional advance is a compare-and-swap on the exact due instant we read:
    // the updateMany row-locks, so the first cron run to reach the row wins and
    // moves nextDeliveryAt forward; a concurrent/retried run then sees the value
    // changed (count 0) and bails — overlapping schedules can't double-generate.
    const claim = await tx.subscription.updateMany({
      where: { id: sub.id, status: 'active', nextDeliveryAt: sub.nextDeliveryAt },
      data: { nextDeliveryAt: addDays(sub.nextDeliveryAt, sub.cadence.days) },
    })
    if (claim.count === 0) return // already claimed by another run — skip

    // Re-read stock under the txn so a concurrent order can't oversell the variant.
    const variant = await tx.productVariant.findUnique({
      where: { id: sub.variantId },
      include: { product: { select: { name: true } } },
    })
    if (!variant) throw new VariantNotFoundError(sub.variantId)

    const qty = sub.qty
    const displayName = `${variant.product.name} - ${variant.label}`
    if (variant.stock < qty) throw new RenewalOutOfStockError(displayName)

    // Ship to the customer's primary address when they have one, so the renewal is
    // actionable in ops; nullable addressId keeps it valid when they don't. Read
    // BEFORE pricing: this address is also the regional-pricing signal, and a
    // renewal must be priced the same way a manual checkout to the same address
    // would be. (A renewal runs from cron, so there is no request to infer geo
    // from — the stored address is the only signal there is.)
    const address = await tx.address.findFirst({
      where: { userId: sub.userId },
      orderBy: [{ isPrimary: 'desc' }, { id: 'asc' }],
      select: { id: true, state: true, pincode: true },
    })
    const zone = address
      ? await resolveZone({ state: address.state, pincode: address.pincode }, tx)
      : null

    // The subscribe discount is applied per unit (mirrors data/products.subPrice),
    // then represented at the order level: OrderItem carries the full catalogue
    // price snapshot (subtotal = Σ lineTotals, as in checkout), and Order.discount
    // captures the saving so total = subtotal − discount + shipping.
    //
    // The two discounts compose in a fixed order — region first, then subscribe —
    // so `subtotal` is the regional shelf price and `discount` stays exactly the
    // subscribe saving the customer was promised.
    const fullUnit = applyZonePrice(variant.price, zone, { variantId: variant.id })
    const discountedUnit = Math.round((fullUnit * (100 - subscribeSavePct)) / 100)
    const subtotal = fullUnit * qty
    const discount = (fullUnit - discountedUnit) * qty
    const discountedSubtotal = subtotal - discount
    const shipping = discountedSubtotal >= freeShipThreshold ? 0 : SHIPPING_FEE
    const total = discountedSubtotal + shipping

    const orderNo = await nextOrderNo(tx)

    await tx.order.create({
      data: {
        orderNo,
        userId: sub.userId,
        addressId: address?.id ?? null,
        status: 'pending', // pay-later renewal per the roadmap
        channel: 'web',
        subtotal,
        discount,
        shipping,
        total,
        items: {
          create: [
            {
              variantId: variant.id,
              productName: variant.product.name,
              variantLabel: variant.label,
              unitPrice: fullUnit,
              qty,
              lineTotal: subtotal,
            },
          ],
        },
      },
    })

    // Reserve stock with an ATOMIC conditional decrement (mirrors checkout): the
    // WHERE stock>=qty guard makes the read-and-decrement a single statement, so
    // a concurrent order/renewal can't oversell the variant under READ COMMITTED.
    // count 0 ⇒ stock slipped below qty since the re-read ⇒ treat as out of stock,
    // which rolls the txn back (including the claim) and leaves the sub due.
    const reserved = await tx.productVariant.updateMany({
      where: { id: variant.id, stock: { gte: qty } },
      data: { stock: { decrement: qty } },
    })
    if (reserved.count === 0) throw new RenewalOutOfStockError(displayName)

    // nextDeliveryAt was already advanced by the CLAIM above (kept on a fixed grid
    // from the DUE date, not `now`); here we only accrue the saving so the account
    // "Saved so far" figure grows.
    await tx.subscription.update({
      where: { id: sub.id },
      data: { savedTotal: { increment: discount } },
    })
  })
}

/**
 * Generate renewal orders for every active subscription whose next delivery is due
 * (nextDeliveryAt <= now). Each is processed in its own transaction; one failure
 * (e.g. out of stock) is logged and skipped so it can't abort the whole batch.
 * Returns the number of orders actually created.
 *
 * In production this is invoked by AWS EventBridge Scheduler via the cron route.
 */
export async function generateDueOrders(): Promise<number> {
  const now = new Date()
  const { subscribeSavePct, freeShipThreshold } = await getSettings()

  const due = await prisma.subscription.findMany({
    where: { status: 'active', nextDeliveryAt: { lte: now } },
    include: subInclude,
  })

  let generated = 0
  for (const sub of due) {
    try {
      await createRenewalOrder(sub, subscribeSavePct, freeShipThreshold)
      generated += 1
    } catch (err) {
      // Isolate per-subscription failures — the batch continues; the sub stays due.
      console.error('[subscriptions] renewal failed for', sub.id, err)
    }
  }
  return generated
}
