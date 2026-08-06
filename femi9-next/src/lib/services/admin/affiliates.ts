import 'server-only'
import type { AffiliateStatus, PayoutStatus } from '@prisma/client'
import { prisma } from '@/lib/db'
import { isPlaceholder } from '@/lib/services/affiliate'

/**
 * Admin affiliate service — the seam between the DB and the creator-program
 * console. Reads roll clicks/orders/earnings up from AffiliateEvent; the writes
 * are the review actions (approve / suspend) and payout logging.
 *
 * Approval is where a real, shareable promoCode is minted — until then the row
 * carries an internal placeholder (see services/affiliate.ts), which this module
 * never surfaces as a code.
 */

/** One creator row for the admin table. `promoCode` is null until approved. */
export interface AffiliateListItem {
  id: string
  handle: string
  email: string | null
  platform: string | null
  followerBand: string | null
  promoCode: string | null
  status: AffiliateStatus
  clicks: number
  orders: number
  earnings: number
  createdAt: Date
}

/** A logged payout, shaped for the admin payout panel. */
export interface PayoutListItem {
  id: string
  affiliateId: string
  amount: number
  status: PayoutStatus
  periodStart: Date
  periodEnd: Date
  reference: string | null
  paidAt: Date | null
  createdAt: Date
}

/** Per-affiliate event rollup: clicks, attributed orders, total commission. */
interface EventTotals {
  clicks: number
  orders: number
  earnings: number
}

const ZERO_TOTALS: EventTotals = { clicks: 0, orders: 0, earnings: 0 }

/** Roll one affiliate's events up into clicks/orders/earnings. */
async function totalsFor(affiliateId: string): Promise<EventTotals> {
  const rows = await prisma.affiliateEvent.groupBy({
    by: ['type'],
    where: { affiliateId },
    _count: { _all: true },
    _sum: { commission: true },
  })
  const totals: EventTotals = { ...ZERO_TOTALS }
  for (const r of rows) {
    if (r.type === 'click') totals.clicks = r._count._all
    else if (r.type === 'order') {
      totals.orders = r._count._all
      totals.earnings = r._sum.commission ?? 0
    }
  }
  return totals
}

/** Shape a single affiliate (with email + totals) into a list item. Placeholder
 *  codes are surfaced as null so the console never shows a non-shareable code. */
function toListItem(
  a: { id: string; handle: string; platform: string | null; followerBand: string | null; promoCode: string; status: AffiliateStatus; createdAt: Date; user: { email: string | null } },
  totals: EventTotals,
): AffiliateListItem {
  return {
    id: a.id,
    handle: a.handle,
    email: a.user.email,
    platform: a.platform,
    followerBand: a.followerBand,
    promoCode: isPlaceholder(a.promoCode) ? null : a.promoCode,
    status: a.status,
    clicks: totals.clicks,
    orders: totals.orders,
    earnings: totals.earnings,
    createdAt: a.createdAt,
  }
}

// ─────────────────────────────── Reads ──────────────────────────────────

/** Every creator, newest first, with computed clicks/orders/earnings + email. */
export async function listAffiliates(): Promise<AffiliateListItem[]> {
  const affiliates = await prisma.affiliate.findMany({
    orderBy: { createdAt: 'desc' },
    include: { user: { select: { email: true } } },
  })

  // One groupBy over all events, then fold per affiliate — avoids an N+1 of a
  // rollup query per creator.
  const grouped = await prisma.affiliateEvent.groupBy({
    by: ['affiliateId', 'type'],
    _count: { _all: true },
    _sum: { commission: true },
  })
  const totalsByAff = new Map<string, EventTotals>()
  for (const g of grouped) {
    const t = totalsByAff.get(g.affiliateId) ?? { ...ZERO_TOTALS }
    if (g.type === 'click') t.clicks = g._count._all
    else if (g.type === 'order') {
      t.orders = g._count._all
      t.earnings = g._sum.commission ?? 0
    }
    totalsByAff.set(g.affiliateId, t)
  }

  return affiliates.map((a) => toListItem(a, totalsByAff.get(a.id) ?? { ...ZERO_TOTALS }))
}

/** Refresh one row (used after a status change) or null if it's gone. */
async function listItem(id: string): Promise<AffiliateListItem | null> {
  const a = await prisma.affiliate.findUnique({
    where: { id },
    include: { user: { select: { email: true } } },
  })
  if (!a) return null
  return toListItem(a, await totalsFor(id))
}

/** Payouts, newest first — all, or scoped to one affiliate. */
export async function listPayouts(affiliateId?: string): Promise<PayoutListItem[]> {
  const rows = await prisma.affiliatePayout.findMany({
    where: affiliateId ? { affiliateId } : {},
    orderBy: { createdAt: 'desc' },
  })
  return rows.map((p) => ({
    id: p.id,
    affiliateId: p.affiliateId,
    amount: p.amount,
    status: p.status,
    periodStart: p.periodStart,
    periodEnd: p.periodEnd,
    reference: p.reference,
    paidAt: p.paidAt,
    createdAt: p.createdAt,
  }))
}

// ─────────────────────────────── Writes ─────────────────────────────────

/** Build a unique promoCode from the handle: uppercase alphanumerics, deduped
 *  with a numeric suffix. The DB @unique on promoCode is the real backstop; this
 *  loop just avoids the collision in the common case. */
async function allocateCode(handle: string): Promise<string> {
  const base = handle.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 12) || 'CREATOR'
  let candidate = base
  let n = 1
  // eslint-disable-next-line no-await-in-loop -- collisions are rare; loop is bounded in practice
  while (await prisma.affiliate.findUnique({ where: { promoCode: candidate }, select: { id: true } })) {
    n += 1
    candidate = `${base}${n}`
  }
  return candidate
}

/**
 * Approve a creator: flip to 'approved' and allocate their real promoCode. If
 * they already hold a real code (e.g. re-approving after a suspension) it's kept
 * so their live links keep working. Returns the refreshed row, or null if gone.
 */
export async function approve(id: string): Promise<AffiliateListItem | null> {
  const current = await prisma.affiliate.findUnique({
    where: { id },
    select: { handle: true, promoCode: true },
  })
  if (!current) return null

  const promoCode = isPlaceholder(current.promoCode)
    ? await allocateCode(current.handle)
    : current.promoCode

  await prisma.affiliate.update({
    where: { id },
    data: { status: 'approved', promoCode },
  })
  return listItem(id)
}

/** Suspend a creator (their code stops attributing). Null if the row is gone. */
export async function suspend(id: string): Promise<AffiliateListItem | null> {
  const res = await prisma.affiliate.updateMany({ where: { id }, data: { status: 'suspended' } })
  if (res.count === 0) return null
  return listItem(id)
}

/**
 * Log a payout for a period. Records the admin's statement that commission was
 * (or is being) paid; status defaults to 'pending' per the schema.
 */
export async function createPayout(
  affiliateId: string,
  amount: number,
  periodStart: Date,
  periodEnd: Date,
  reference?: string,
): Promise<PayoutListItem> {
  const p = await prisma.affiliatePayout.create({
    data: {
      affiliateId,
      amount,
      periodStart,
      periodEnd,
      reference: reference?.trim() || null,
    },
  })
  return {
    id: p.id,
    affiliateId: p.affiliateId,
    amount: p.amount,
    status: p.status,
    periodStart: p.periodStart,
    periodEnd: p.periodEnd,
    reference: p.reference,
    paidAt: p.paidAt,
    createdAt: p.createdAt,
  }
}
