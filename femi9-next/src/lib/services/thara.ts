import 'server-only'
import type { TharaMembership, TharaStatus, Prisma, User } from '@prisma/client'
import { prisma } from '@/lib/db'
import { generateReferralCode } from '@/lib/thara/codes'
import { verifyTharaRefCookie } from '@/lib/thara/cookies'
import { isTharaEnabled } from '@/lib/thara/feature'

/**
 * Thara Model service.
 *
 * Sub-project A covers enrolment lifecycle and attribution. Later sub-projects
 * append to this file (activate, suspend, and further helpers used by the
 * checkout/payment paths and admin routes).
 *
 * State machine:
 *   (none) -> purchase_pending -> active -> suspended -> active
 *                                       \-> deactivated (terminal for a user)
 */

export class TharaDeactivatedError extends Error {
  constructor() {
    super('This account previously opted out of the Thara program.')
    this.name = 'TharaDeactivatedError'
  }
}

const CODE_MAX_TRIES = 5

async function issueUniqueCode(tx: Prisma.TransactionClient): Promise<string> {
  for (let attempt = 0; attempt < CODE_MAX_TRIES; attempt++) {
    const candidate = generateReferralCode()
    const clash = await tx.tharaMembership.findUnique({
      where: { referralCode: candidate },
      select: { id: true },
    })
    if (!clash) return candidate
  }
  throw new Error('Could not issue a unique referral code after 5 tries')
}

export async function enrollUser(
  userId: string,
  termsVersion: string,
): Promise<{ id: string; status: TharaStatus; referralCode: string }> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.tharaMembership.findUnique({ where: { userId } })
    if (existing) {
      if (existing.status === 'deactivated') throw new TharaDeactivatedError()
      return { id: existing.id, status: existing.status, referralCode: existing.referralCode }
    }
    const referralCode = await issueUniqueCode(tx)
    const created = await tx.tharaMembership.create({
      data: {
        userId,
        status: 'purchase_pending',
        referralCode,
        termsAcceptedAt: new Date(),
        termsVersion,
      },
    })
    return { id: created.id, status: created.status, referralCode: created.referralCode }
  })
}

export async function optOutUser(userId: string): Promise<void> {
  await prisma.tharaMembership.update({
    where: { userId },
    data: { status: 'deactivated', deactivatedAt: new Date() },
  })
}

export async function getMembership(userId: string): Promise<TharaMembership | null> {
  return prisma.tharaMembership.findUnique({ where: { userId } })
}

type AttributionReason =
  | 'no-cookie'
  | 'bad-cookie'
  | 'referrer-not-found'
  | 'referrer-not-eligible'
  | 'self-referral'
  | 'dup-email'
  | 'dup-phone'
  | 'already-attributed'

export interface AttributionInput {
  cookieToken: string | null
  ip: string | null
  ua: string | null
}

/**
 * Called from every sign-in path after a User is upserted. Silently no-ops
 * for any reject reason so sign-in never fails because of attribution.
 */
export async function attributeReferralIfPresent(
  user: User,
  input: AttributionInput,
): Promise<{ attributed: boolean; reason?: AttributionReason }> {
  if (!input.cookieToken) return { attributed: false, reason: 'no-cookie' }
  const claim = await verifyTharaRefCookie(input.cookieToken)
  if (!claim) return { attributed: false, reason: 'bad-cookie' }

  const referrer = await prisma.tharaMembership.findUnique({
    where: { id: claim.referrerMembershipId },
    include: { user: { select: { id: true, email: true, phone: true } } },
  })
  if (!referrer) return { attributed: false, reason: 'referrer-not-found' }
  if (referrer.status === 'suspended' || referrer.status === 'deactivated') {
    return { attributed: false, reason: 'referrer-not-eligible' }
  }

  if (referrer.user.id === user.id) return { attributed: false, reason: 'self-referral' }
  if (
    user.email &&
    referrer.user.email &&
    user.email.toLowerCase() === referrer.user.email.toLowerCase()
  ) {
    return { attributed: false, reason: 'dup-email' }
  }
  if (user.phone && referrer.user.phone && user.phone === referrer.user.phone) {
    return { attributed: false, reason: 'dup-phone' }
  }

  try {
    await prisma.tharaReferral.create({
      data: {
        referrerId: referrer.id,
        referredUserId: user.id,
        invitedByLink: true,
        ipAtSignup: input.ip ?? undefined,
        uaAtSignup: input.ua ?? undefined,
      },
    })
    return { attributed: true }
  } catch (e: unknown) {
    if (typeof e === 'object' && e && 'code' in e && (e as { code?: string }).code === 'P2002') {
      return { attributed: false, reason: 'already-attributed' }
    }
    throw e
  }
}

export const THARA_QUALIFYING_MIN_PAISE = 300_000 // ₹3,000

/**
 * Called INSIDE the markOrderPaid transaction, so any failure rolls the whole
 * order-paid commit back. Two independent side-effects:
 *  1) If the buyer has a purchase_pending membership and this order is >= ₹3,000,
 *     promote to active and stamp the qualifying order.
 *  2) If the buyer has an incoming, unlocked referral and this order is >= ₹3,000,
 *     set lockedAt = now — permanent from that instant.
 */
export async function activateAndLockIfEligible(
  tx: Prisma.TransactionClient,
  orderId: string,
): Promise<void> {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    select: { id: true, userId: true, subtotal: true },
  })
  if (!order || !order.userId) return
  if (order.subtotal < THARA_QUALIFYING_MIN_PAISE) return

  await tx.tharaMembership.updateMany({
    where: { userId: order.userId, status: 'purchase_pending' },
    data: { status: 'active', activatedAt: new Date(), qualifyingOrderId: order.id },
  })

  await tx.tharaReferral.updateMany({
    where: { referredUserId: order.userId, lockedAt: null },
    data: { lockedAt: new Date() },
  })
}

export class TharaNotFoundError extends Error {
  constructor() {
    super('Thara membership not found.')
    this.name = 'TharaNotFoundError'
  }
}

export async function suspendMembership(
  id: string,
  reason: string,
): Promise<TharaMembership> {
  const existing = await prisma.tharaMembership.findUnique({ where: { id } })
  if (!existing) throw new TharaNotFoundError()
  if (existing.status === 'suspended') return existing
  return prisma.tharaMembership.update({
    where: { id },
    data: {
      status: 'suspended',
      suspendedAt: new Date(),
      suspendedReason: reason,
      statusBeforeSuspend: existing.status,
    },
  })
}

export async function unsuspendMembership(id: string): Promise<TharaMembership> {
  const existing = await prisma.tharaMembership.findUnique({ where: { id } })
  if (!existing) throw new TharaNotFoundError()
  if (existing.status !== 'suspended') return existing
  return prisma.tharaMembership.update({
    where: { id },
    data: {
      status: existing.statusBeforeSuspend ?? 'purchase_pending',
      suspendedAt: null,
      suspendedReason: null,
      statusBeforeSuspend: null,
    },
  })
}

export async function getMembershipById(id: string): Promise<TharaMembership | null> {
  return prisma.tharaMembership.findUnique({ where: { id } })
}

// ─────────────────────── Sub-project E: invite emails ─────────────────────

import { renderInviteEmail, sendTharaInviteEmail } from '@/lib/thara/invite'

export class TharaInviteNotEligibleError extends Error {
  constructor() {
    super('Only enrolled Thara members can send invites.')
    this.name = 'TharaInviteNotEligibleError'
  }
}
export class TharaInviteBadEmailError extends Error {
  constructor() {
    super('That does not look like a valid email address.')
    this.name = 'TharaInviteBadEmailError'
  }
}
export class TharaInviteSelfError extends Error {
  constructor() {
    super("You can't invite yourself.")
    this.name = 'TharaInviteSelfError'
  }
}
export class TharaInviteSuppressedError extends Error {
  constructor() {
    super("That address opted out of our emails. Share your link some other way.")
    this.name = 'TharaInviteSuppressedError'
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Send a referral invite to a friend's email. Requires the sender to be a
 * Thara member (either purchase_pending or active), refuses suppressed
 * addresses, refuses self-invites. Rate limiting lives at the route layer.
 */
export async function sendTharaInvite(
  referrerUserId: string,
  toEmail: string,
): Promise<{ mock: boolean }> {
  const to = toEmail.trim().toLowerCase()
  if (!EMAIL_RE.test(to)) throw new TharaInviteBadEmailError()

  const membership = await prisma.tharaMembership.findUnique({
    where: { userId: referrerUserId },
    include: { user: { select: { name: true, email: true } } },
  })
  if (!membership) throw new TharaInviteNotEligibleError()
  if (membership.status !== 'active' && membership.status !== 'purchase_pending') {
    throw new TharaInviteNotEligibleError()
  }
  if (membership.user.email && membership.user.email.toLowerCase() === to) {
    throw new TharaInviteSelfError()
  }

  const suppressed = await prisma.tharaSuppressedEmail.findUnique({ where: { email: to } })
  if (suppressed) throw new TharaInviteSuppressedError()

  const base = process.env.NEXT_PUBLIC_SITE_URL ?? ''
  const referralUrl = base ? `${base}/r/${membership.referralCode}` : `/r/${membership.referralCode}`
  const { subject, html, text } = renderInviteEmail({
    referrerName: membership.user.name ?? null,
    referralCode: membership.referralCode,
    referralUrl,
  })
  return sendTharaInviteEmail({ to, subject, html, text })
}

export async function suppressEmail(email: string, reason: 'hard_bounce' | 'complaint' | 'manual'): Promise<void> {
  const key = email.trim().toLowerCase()
  if (!EMAIL_RE.test(key)) return
  await prisma.tharaSuppressedEmail.upsert({
    where: { email: key },
    update: { reason },
    create: { email: key, reason },
  })
}

// ─────────────────────── Sub-project C: wallet credit ──────────────────────

export const TharaCreditReason = {
  REFERRAL_COMMISSION: 'referral-commission',
  CHECKOUT_SPEND: 'checkout-spend',
  REFUND_REVERSAL: 'refund-reversal',
} as const

export const THARA_COMMISSION_PCT = 10 // 10% of downline paid subtotal

/**
 * Called inside markOrderPaid. When the paid order was placed by a referred
 * user with a permanent (locked) referral to an active Thara member, credit
 * 10% of the subtotal to the referrer's Femi9 store-credit ledger.
 */
export async function accrueTharaCommission(
  tx: Prisma.TransactionClient,
  orderId: string,
): Promise<void> {
  if (!isTharaEnabled()) return

  const order = await tx.order.findUnique({
    where: { id: orderId },
    select: { id: true, userId: true, subtotal: true },
  })
  if (!order || !order.userId) return

  const referral = await tx.tharaReferral.findUnique({
    where: { referredUserId: order.userId },
    select: {
      lockedAt: true,
      referrer: { select: { userId: true, status: true } },
    },
  })
  if (!referral || !referral.lockedAt) return
  if (referral.referrer.status !== 'active') return

  const delta = Math.floor((order.subtotal * THARA_COMMISSION_PCT) / 100)
  if (delta <= 0) return

  const prior = await tx.tharaCreditLedger.aggregate({
    where: { userId: referral.referrer.userId },
    _sum: { delta: true },
  })
  const balanceAfter = (prior._sum.delta ?? 0) + delta
  await tx.tharaCreditLedger.create({
    data: {
      userId: referral.referrer.userId,
      delta,
      reason: TharaCreditReason.REFERRAL_COMMISSION,
      sourceOrderId: order.id,
      balanceAfter,
    },
  })
}

/** Current spendable balance for a user. Clamped to ≥ 0 (a negative running
 *  balance from a refund clawback cannot be spent). */
export async function getTharaCreditBalance(
  tx: Prisma.TransactionClient | typeof prisma,
  userId: string,
): Promise<number> {
  const agg = await tx.tharaCreditLedger.aggregate({
    where: { userId },
    _sum: { delta: true },
  })
  return Math.max(0, agg._sum.delta ?? 0)
}

/**
 * Debit up to `wantPaise` from the buyer's credit balance and return the
 * actual amount applied. Called from placeOrder INSIDE the same transaction
 * so a concurrent checkout can't double-spend the same balance.
 */
export async function applyTharaCredit(
  tx: Prisma.TransactionClient,
  userId: string,
  orderId: string,
  wantPaise: number,
): Promise<number> {
  if (!isTharaEnabled()) return 0
  if (wantPaise <= 0) return 0

  const balance = await getTharaCreditBalance(tx, userId)
  const apply = Math.min(balance, wantPaise)
  if (apply <= 0) return 0

  const prior = await tx.tharaCreditLedger.aggregate({
    where: { userId },
    _sum: { delta: true },
  })
  const balanceAfter = (prior._sum.delta ?? 0) - apply
  await tx.tharaCreditLedger.create({
    data: {
      userId,
      delta: -apply,
      reason: TharaCreditReason.CHECKOUT_SPEND,
      sourceOrderId: orderId,
      balanceAfter,
    },
  })
  return apply
}

/**
 * Called inside refundOrder's transaction. For every ledger row that
 * references this order (an earned commission on the referrer, or a spent
 * credit on the buyer), write a mirror-signed reversal row.
 *
 * Because refundOrder gates on status === 'paid', it runs at most once per
 * order, so we can safely reverse every source row without re-checking for
 * prior reversals.
 */
export async function reverseTharaCreditForRefund(
  tx: Prisma.TransactionClient,
  orderId: string,
): Promise<void> {
  const rows = await tx.tharaCreditLedger.findMany({
    where: {
      sourceOrderId: orderId,
      reason: { in: [TharaCreditReason.REFERRAL_COMMISSION, TharaCreditReason.CHECKOUT_SPEND] },
    },
    orderBy: { createdAt: 'asc' },
  })
  for (const row of rows) {
    const reversedDelta = -row.delta
    const prior = await tx.tharaCreditLedger.aggregate({
      where: { userId: row.userId },
      _sum: { delta: true },
    })
    const balanceAfter = (prior._sum.delta ?? 0) + reversedDelta
    await tx.tharaCreditLedger.create({
      data: {
        userId: row.userId,
        delta: reversedDelta,
        reason: TharaCreditReason.REFUND_REVERSAL,
        sourceOrderId: orderId,
        balanceAfter,
      },
    })
  }
}

// ─────────────────────── Sub-project B: personal discount ──────────────────

/** Slab thresholds in paise. Matches PROGRAM.md §5 and the PRD's §6 slab table. */
export const TharaDiscountSlabs = {
  SLAB_1_MIN: 300_000, // ₹3,000 — 10% off
  SLAB_2_MIN: 600_000, // ₹6,000 — 15% off
  SLAB_3_MIN: 900_000, // ₹9,000 — 20% off
} as const

export type TharaDiscountSlab = '10' | '15' | '20'

export interface TharaDiscountResult {
  /** True only when the flag is on, the user is an active member, AND subtotal ≥ ₹3,000. */
  eligible: boolean
  slab: TharaDiscountSlab | null
  /** Integer paise. Zero when not eligible. */
  discountPaise: number
}

/**
 * Compute the personal-discount amount for a checkout. Called from placeOrder
 * inside the checkout transaction (uses the tx client so a rollback wipes the
 * membership read too — cheap consistency).
 *
 * Discount is applied ONLY when:
 *  - THARA_ENABLED is true
 *  - The user has a TharaMembership in status='active' (not purchase_pending,
 *    not suspended, not deactivated)
 *  - Cart subtotal ≥ ₹3,000
 */
export async function computeTharaDiscount(
  tx: Prisma.TransactionClient,
  userId: string | null | undefined,
  subtotalPaise: number,
): Promise<TharaDiscountResult> {
  const zero: TharaDiscountResult = { eligible: false, slab: null, discountPaise: 0 }
  if (!isTharaEnabled()) return zero
  if (!userId || subtotalPaise < TharaDiscountSlabs.SLAB_1_MIN) return zero

  const membership = await tx.tharaMembership.findUnique({
    where: { userId },
    select: { status: true },
  })
  if (!membership || membership.status !== 'active') return zero

  let pct: number
  let slab: TharaDiscountSlab
  if (subtotalPaise >= TharaDiscountSlabs.SLAB_3_MIN) {
    pct = 20
    slab = '20'
  } else if (subtotalPaise >= TharaDiscountSlabs.SLAB_2_MIN) {
    pct = 15
    slab = '15'
  } else {
    pct = 10
    slab = '10'
  }
  // floor so we never round up and end up giving MORE discount than the slab says
  const discountPaise = Math.floor((subtotalPaise * pct) / 100)
  return { eligible: true, slab, discountPaise }
}

export async function listMemberships(filter: {
  status?: TharaStatus
  q?: string
  take: number
  skip: number
}): Promise<{ rows: TharaMembership[]; total: number }> {
  const where: Prisma.TharaMembershipWhereInput = {
    ...(filter.status ? { status: filter.status } : {}),
    ...(filter.q
      ? {
          OR: [
            { referralCode: { contains: filter.q.toUpperCase() } },
            { user: { email: { contains: filter.q.toLowerCase() } } },
          ],
        }
      : {}),
  }
  const [rows, total] = await Promise.all([
    prisma.tharaMembership.findMany({
      where,
      take: filter.take,
      skip: filter.skip,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.tharaMembership.count({ where }),
  ])
  return { rows, total }
}
