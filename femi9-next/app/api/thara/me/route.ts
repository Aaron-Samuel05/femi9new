import { handle, ok, unauthorized, notFound } from '@/lib/api'
import { getSession } from '@/lib/auth'
import { getMembership } from '@/lib/services/thara'
import { isTharaEnabled } from '@/lib/thara/feature'
import { prisma } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  return handle(async () => {
    if (!isTharaEnabled()) return notFound()

    const session = await getSession()
    if (!session) return unauthorized()

    const m = await getMembership(session.sub)
    if (!m) return ok({ enrolled: false })

    const incomingRef = await prisma.tharaReferral.findUnique({
      where: { referredUserId: session.sub },
      include: { referrer: { select: { referralCode: true } } },
    })
    const base = process.env.NEXT_PUBLIC_SITE_URL ?? ''
    return ok({
      enrolled: true,
      status: m.status,
      referralCode: m.referralCode,
      referralUrl: base ? `${base}/r/${m.referralCode}` : null,
      enrolledAt: m.enrolledAt,
      activatedAt: m.activatedAt,
      referrerCode: incomingRef?.referrer.referralCode ?? null,
    })
  })
}
