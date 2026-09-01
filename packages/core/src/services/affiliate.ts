import 'server-only'
import { Prisma, type AffiliateStatus } from '@prisma/client'
import { dbFor, type Brand } from '@femi9/db'
import { brandConfig } from '../brands'
import { logger } from '../logger'
import { sendEmailNotification } from './notifications'

/**
 * Affiliate (creator) program — server-tracked application, click attribution
 * and order commission. Replaces the old client-side "generate a code in the
 * browser + localStorage" flow so codes, clicks and earnings are real DB state.
 *
 * Two facts from the schema shape this file:
 *  - `Affiliate.promoCode` is REQUIRED and @unique, yet a real, shareable code
 *    isn't allocated until an admin approves the application. We therefore park a
 *    unique, non-user-facing PLACEHOLDER at apply time (keyed to the unique
 *    userId) and swap in the real code on approval. `isPlaceholder` keeps that
 *    detail in one place so no read surface ever leaks a placeholder as a usable
 *    code.
 *  - Attribution only ever fires for an APPROVED affiliate — click logging and
 *    order commission are silent no-ops for pending/suspended/unknown codes, so a
 *    stale or guessed link can never create tracking noise.
 */

/**
 * Cookie the creator referral redirect (/a/[code]) drops so checkout can
 * attribute a later purchase back to the referring creator. Shared here so the
 * setter and the reader agree on one name. (/r/[code] is the separate Thara
 * membership referral and uses its own signed cookie.)
 *
 * Per brand, for the same reason `sessionCookieName` is: the two storefronts
 * are separate hosts in production, but they are the SAME host in development
 * and in the E2E suites (cookies ignore the port), so one shared `femi9_ref`
 * would follow a shopper from one brand's referral link into the other brand's
 * checkout. The affiliate tables live in per-brand Postgres schemas, so the
 * stray code would resolve to nothing and attribute nothing — but "it happens
 * to miss" is not isolation. The name derives to exactly what Femi9 already
 * issues, so no live referral cookie was invalidated by making this
 * brand-aware.
 */
export function refCookieName(brand: Brand): string {
  return `${brand}_ref`
}

/** @deprecated Femi9's cookie name. Use `refCookieName(brand)`. */
export const REF_COOKIE = 'femi9_ref'

/** Commission paid to the creator on an attributed order, as a fraction of the
 *  order SUBTOTAL. The marketing page quotes a headline rate; the program spec
 *  fixes attribution at 10% — one constant so checkout and reporting never drift. */
const COMMISSION_RATE = 0.1

/** Prefix marking a not-yet-allocated placeholder promoCode (see file header). */
const PLACEHOLDER_PREFIX = 'PENDING-'

/** A promoCode that is only a placeholder — never a real, shareable code. */
export function isPlaceholder(code: string): boolean {
  return code.startsWith(PLACEHOLDER_PREFIX)
}

/** Build the unique placeholder for a freshly-applied affiliate. Keyed to the
 *  (unique) userId so it satisfies the @unique index without any coordination. */
export function placeholderCode(userId: string): string {
  return `${PLACEHOLDER_PREFIX}${userId}`
}

/** Reads/writes here accept either the shared client or a transaction client, so
 *  checkout can attribute an order inside its own atomic transaction. The full
 *  PrismaClient is assignable to TransactionClient, so `prisma` is a valid default. */
type Db = Prisma.TransactionClient

/** Codes are matched case-insensitively; canonicalise to trimmed uppercase. */
function normalizeCode(code: string): string {
  return code.trim().toUpperCase()
}

export interface AffiliateApplication {
  name: string
  handle: string
  platform?: string
  followerBand?: string
  email: string
}

/**
 * Register (or refresh) a creator application.
 *
 * Upserts a User by email — mirroring how checkout upserts a customer by phone —
 * then upserts the Affiliate keyed to that user. Re-applying updates only the
 * application details; it deliberately leaves `status` and `promoCode` untouched
 * so an already-approved creator can never be demoted or lose their live code by
 * resubmitting the form.
 */
export async function apply(brand: Brand, input: AffiliateApplication): Promise<void> {
  const prisma = dbFor(brand)
  const email = input.email.trim()
  const handle = input.handle.replace(/^@+/, '').trim()
  const platform = input.platform?.trim() || null
  const followerBand = input.followerBand?.trim() || null

  // role 'affiliate' is intentional on create: creator accounts are a distinct
  // identity from shoppers (and are excluded from the customers admin). We never
  // change role on update, so an existing customer applying keeps their role.
  const user = await prisma.user.upsert({
    where: { email },
    update: { name: input.name },
    create: { email, name: input.name, role: 'affiliate' },
  })

  const affiliate = await prisma.affiliate.upsert({
    where: { userId: user.id },
    update: { handle, platform, followerBand },
    create: {
      userId: user.id,
      handle,
      platform,
      followerBand,
      status: 'pending',
      promoCode: placeholderCode(user.id), // real code allocated on approval
    },
    select: { id: true },
  })

  // Tell ops a creator is waiting. Mirrors services/partner.ts — an application
  // that lands in a table nobody watches is the same as no application. Never
  // throws: a mail outage must not fail the applicant's submission.
  const opsEmail = process.env.PARTNER_OPS_EMAIL?.trim()
  if (!opsEmail) {
    logger.warn('affiliate_application_no_ops_recipient', { affiliateId: affiliate.id })
    return
  }
  try {
    await sendEmailNotification(brand, {
      to: opsEmail,
      subject: `New ${brandConfig(brand).name} creator application: @${handle}`,
      text: `${input.name} (@${handle}${platform ? `, ${platform}` : ''}${followerBand ? `, ${followerBand}` : ''}) applied. Review in the admin console.`,
      html: `<p><strong>${input.name}</strong> (@${handle}${platform ? `, ${platform}` : ''}${followerBand ? `, ${followerBand}` : ''}) applied. Review in the admin console.</p>`,
      template: 'affiliate-application-ops',
      dedupeKey: `affiliate-application:${affiliate.id}:ops`,
    })
  } catch (err) {
    logger.error('affiliate_application_ops_mail_failed', { affiliateId: affiliate.id, err: String(err) })
  }
}

export interface AffiliateStats {
  status: AffiliateStatus
  promoCode: string
  clicks: number
  orders: number
  earnings: number
}

/**
 * Public stats for a code — clicks, attributed orders and total commission,
 * aggregated from AffiliateEvent. Returns null for an unknown code. Because the
 * lookup is uppercased, placeholder (mixed-case) codes never resolve here, so a
 * pending application's internal code can't be probed.
 */
export async function getByCode(brand: Brand, promoCode: string): Promise<AffiliateStats | null> {
  const prisma = dbFor(brand)
  const code = normalizeCode(promoCode)
  const affiliate = await prisma.affiliate.findUnique({
    where: { promoCode: code },
    select: { id: true, status: true, promoCode: true },
  })
  if (!affiliate) return null

  const [clicks, orderAgg] = await Promise.all([
    prisma.affiliateEvent.count({ where: { affiliateId: affiliate.id, type: 'click' } }),
    prisma.affiliateEvent.aggregate({
      where: { affiliateId: affiliate.id, type: 'order' },
      _count: { _all: true },
      _sum: { commission: true },
    }),
  ])

  return {
    status: affiliate.status,
    promoCode: affiliate.promoCode,
    clicks,
    orders: orderAgg._count._all,
    earnings: orderAgg._sum.commission ?? 0,
  }
}

/** Owner-scoped affiliate dashboard. Promo codes are public; earnings are not. */
export async function getForUser(brand: Brand, userId: string): Promise<AffiliateStats | null> {
  const prisma = dbFor(brand)
  const affiliate = await prisma.affiliate.findUnique({
    where: { userId },
    select: { id: true, status: true, promoCode: true },
  })
  if (!affiliate || isPlaceholder(affiliate.promoCode)) return null
  const [clicks, orderAgg] = await Promise.all([
    prisma.affiliateEvent.count({ where: { affiliateId: affiliate.id, type: 'click' } }),
    prisma.affiliateEvent.aggregate({
      where: { affiliateId: affiliate.id, type: 'order' },
      _count: { _all: true },
      _sum: { commission: true },
    }),
  ])
  return {
    status: affiliate.status,
    promoCode: affiliate.promoCode,
    clicks,
    orders: orderAgg._count._all,
    earnings: orderAgg._sum.commission ?? 0,
  }
}

/**
 * Record a click for an approved code — called by the /a/[code] redirect.
 * Silently ignores unknown/pending/suspended codes so a bad link is harmless.
 */
export async function logClick(brand: Brand, promoCode: string): Promise<void> {
  const prisma = dbFor(brand)
  const code = normalizeCode(promoCode)
  const affiliate = await prisma.affiliate.findUnique({
    where: { promoCode: code },
    select: { id: true, status: true },
  })
  if (!affiliate || affiliate.status !== 'approved') return

  await prisma.affiliateEvent.create({
    data: { affiliateId: affiliate.id, type: 'click' },
  })
}

/**
 * Attribute an order to the creator that owns `promoCode` and record the
 * commission (10% of subtotal). Returns the affiliate id so the caller can stamp
 * `order.affiliateId`, or null when the code doesn't map to an approved creator.
 *
 * Accepts an optional transaction client so checkout can run this inside the same
 * atomic transaction that created the order — the AffiliateEvent's orderId FK
 * would otherwise reference an order not yet visible to a separate connection.
 */
export async function attributeOrder(
  brand: Brand,
  promoCode: string,
  orderId: string,
  subtotal: number,
  db: Db = dbFor(brand),
): Promise<string | null> {
  const code = normalizeCode(promoCode)
  const affiliate = await db.affiliate.findUnique({
    where: { promoCode: code },
    select: { id: true, status: true },
  })
  if (!affiliate || affiliate.status !== 'approved') return null

  const commission = Math.round(subtotal * COMMISSION_RATE)
  await db.affiliateEvent.create({
    data: { affiliateId: affiliate.id, type: 'order', orderId, amount: subtotal, commission },
  })
  return affiliate.id
}
