import 'server-only'
import type { TharaMembership, TharaStatus, Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { generateReferralCode } from '@/lib/thara/codes'

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
