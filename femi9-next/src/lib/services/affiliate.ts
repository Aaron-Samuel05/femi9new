import 'server-only'
import { Prisma, type AffiliateStatus } from '@prisma/client'
import { prisma } from '@/lib/db'

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

/** Cookie the storefront redirect (/r/[code]) drops so checkout can attribute
 *  a later purchase back to the referring creator. Shared here so the setter and
 *  the reader agree on one name. */
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
export async function apply(input: AffiliateApplication): Promise<void> {
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

  await prisma.affiliate.upsert({
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
  })
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
export async function getByCode(promoCode: string): Promise<AffiliateStats | null> {
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

/**
 * Record a click for an approved code (the /r/[code] redirect calls this).
 * Silently ignores unknown/pending/suspended codes so a bad link is harmless.
 */
export async function logClick(promoCode: string): Promise<void> {
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
  promoCode: string,
  orderId: string,
  subtotal: number,
  db: Db = prisma,
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
