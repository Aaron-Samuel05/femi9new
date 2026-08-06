import { handle, ok } from '@/lib/api'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/auth/me — the signed-in customer, or { user: null }.
 * Re-reads the User by the session subject so name/phone/email reflect the DB,
 * not the (possibly stale) JWT claims. Always 200 so the client can branch on
 * `user` without treating "logged out" as an error.
 */
export async function GET() {
  return handle(async () => {
    const session = await getSession()
    if (!session) return ok({ user: null })

    const user = await prisma.user.findUnique({
      where: { id: session.sub },
      select: { id: true, name: true, phone: true, email: true },
    })
    return ok({ user: user ?? null })
  })
}
