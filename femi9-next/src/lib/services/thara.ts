import 'server-only'
import type { TharaMembership, TharaStatus, Prisma, User } from '@prisma/client'
import { prisma } from '@/lib/db'
import { generateReferralCode } from '@/lib/thara/codes'
import { verifyTharaRefCookie } from '@/lib/thara/cookies'

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
