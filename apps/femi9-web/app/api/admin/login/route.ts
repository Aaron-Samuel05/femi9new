import type { NextRequest } from 'next/server'
import { createHash, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { badRequest, handle, ok, unauthorized } from '@femi9/core/api'
import { prisma } from '@femi9/core/db'
import { ADMIN_COOKIE, createSession } from '@femi9/core/admin-auth'
import { rateLimit, clientIp, tooManyRequests } from '@femi9/core/rate-limit'

/** Constant-time string equality. Hashing first yields fixed-length (32-byte)
 *  buffers so timingSafeEqual never sees a length mismatch and the comparison
 *  leaks neither the value nor its length via early return / char-by-char short
 *  circuit (unlike `!==`). */
function timingSafeEqualStr(a: string, b: string): boolean {
  const ah = createHash('sha256').update(a, 'utf8').digest()
  const bh = createHash('sha256').update(b, 'utf8').digest()
  return timingSafeEqual(ah, bh)
}

/**
 * POST /api/admin/login — interim single-admin sign in.
 *
 * Credentials live in env (ADMIN_EMAIL / ADMIN_PASSWORD), not the DB. On a match
 * we look up the admin User only to give the session a friendly name + stable id
 * (falling back to the email when no admin row exists yet).
 */

const SEVEN_DAYS = 60 * 60 * 24 * 7

const LoginSchema = z.object({
  email: z.string().min(1),
  password: z.string().min(1),
})

export async function POST(req: NextRequest) {
  return handle(async () => {
    // Throttle credential-stuffing / brute-force: per-IP, plus a global cap so an
    // attacker can't spread the attack across many IPs unbounded.
    const ipHit = await rateLimit('login:' + clientIp(req), 10, 300_000)
    if (!ipHit.ok) return tooManyRequests(ipHit.retryAfterSec)
    const globalHit = await rateLimit('login:global', 100, 300_000)
    if (!globalHit.ok) return tooManyRequests(globalHit.retryAfterSec)

    const raw = await req.json().catch(() => null)
    const parsed = LoginSchema.safeParse(raw)
    if (!parsed.success) return badRequest('Invalid request', parsed.error.flatten())

    const { email, password } = parsed.data

    // Constant-time compare on the password so a timing side channel can't leak
    // it. Both checks are evaluated before branching; the response is identical
    // whichever field is wrong.
    const emailOk = email === process.env.ADMIN_EMAIL
    const passwordOk = timingSafeEqualStr(password, process.env.ADMIN_PASSWORD ?? '')
    if (!emailOk || !passwordOk) {
      return unauthorized('Invalid email or password')
    }

    const admin = await prisma.user.findFirst({ where: { role: 'admin' } })

    const token = await createSession({
      sub: admin?.id ?? email,
      email,
      name: admin?.name ?? email,
    })

    const res = ok({ ok: true })
    res.cookies.set(ADMIN_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: SEVEN_DAYS,
    })
    return res
  })
}
