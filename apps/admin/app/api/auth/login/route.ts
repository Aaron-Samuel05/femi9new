import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { isBrand } from '@femi9/db'
import { signInAdmin, createAdminSession, adminCookieName, audit, SESSION_SECONDS } from '@femi9/core/admin-identity'
import { rateLimit, clientIp, tooManyRequests } from '@femi9/core/rate-limit'

/**
 * POST /api/auth/login — brand-scoped admin sign in.
 *
 * `brand` arrives from the login form's segmented toggle. It is untrusted input
 * like any other field: narrowed here, and authorised by an AdminBrandRole row
 * inside `signInAdmin`. The toggle chooses which console to ASK for.
 */

const LoginSchema = z.object({
  brand: z.string().min(1),
  email: z.string().min(1).max(320),
  password: z.string().min(1).max(1024),
})

export async function POST(req: NextRequest) {
  // Throttle credential stuffing per IP, plus a global cap so an attacker
  // cannot simply spread the same attack across many addresses.
  const ip = clientIp(req)
  const perIp = await rateLimit('admin-login:' + ip, 10, 300_000)
  if (!perIp.ok) return tooManyRequests(perIp.retryAfterSec)
  const global = await rateLimit('admin-login:global', 100, 300_000)
  if (!global.ok) return tooManyRequests(global.retryAfterSec)

  const raw = await req.json().catch(() => null)
  const parsed = LoginSchema.safeParse(raw)
  // Deliberately the same message as a failed sign-in: a validation error that
  // reads differently still tells an attacker which field was wrong.
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
  }

  const { brand, email, password } = parsed.data
  const result = await signInAdmin(brand, email, password)

  if (!result.ok || !result.session) {
    if (isBrand(brand)) {
      await audit({ adminUserId: null, brand, action: 'admin.login.failed', target: email, ip })
    }
    // ONE message for every way of failing: wrong password, unknown email,
    // disabled account, or no role in this brand.
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
  }

  const session = result.session
  const token = await createAdminSession(session)

  await audit({ adminUserId: session.sub, brand: session.brand, action: 'admin.login', ip })

  const res = NextResponse.json({ ok: true, brand: session.brand })
  res.cookies.set(adminCookieName(session.brand), token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_SECONDS,
  })
  return res
}
