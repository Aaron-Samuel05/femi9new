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

/**
 * The three buckets, and why the shape of them matters more than the numbers.
 *
 * There used to be two: per-IP, and one called `admin-login:global` — a single
 * constant key, 100 attempts per five minutes, shared by every admin, both
 * brands and every task, and consumed by EVERY request including successful
 * ones. So a hundred posts from anywhere, valid or not, locked the entire
 * company out of the console that refunds money and edits prices, for five
 * minutes, repeatable forever. The control meant to stop a distributed attack
 * WAS a denial of service, cheaper to run than the attack it prevented.
 *
 * What replaces it:
 *
 *  IP     — unchanged. Bounds one machine.
 *  EMAIL  — new, and the one that actually addresses credential stuffing. The
 *           per-IP limit alone is defeated by a botnet: a hundred hosts get a
 *           hundred guesses each against one account. This bounds the ACCOUNT,
 *           whoever is asking.
 *  GLOBAL — kept as a backstop, but consumed ONLY on failure and at a ceiling a
 *           legitimate work day cannot reach. A staff member signing in
 *           successfully must never spend from a bucket that can lock out a
 *           colleague.
 */
const IP_ATTEMPTS = 10
const EMAIL_ATTEMPTS = 10
const EMAIL_WINDOW_MS = 900_000
const GLOBAL_FAILURES = 500

export async function POST(req: NextRequest) {
  const ip = clientIp(req)
  const perIp = await rateLimit('admin-login:' + ip, IP_ATTEMPTS, 300_000)
  if (!perIp.ok) return tooManyRequests(perIp.retryAfterSec)

  const raw = await req.json().catch(() => null)
  const parsed = LoginSchema.safeParse(raw)
  // Deliberately the same message as a failed sign-in: a validation error that
  // reads differently still tells an attacker which field was wrong.
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
  }

  const { brand, email, password } = parsed.data

  // Per ACCOUNT, before the password is checked. Lowercased so the bucket is
  // the identity, not the spelling — `signInAdmin` normalises the same way, and
  // a limiter keyed on the raw string is bypassed by varying the case.
  const emailKey = email.trim().toLowerCase()
  const perEmail = await rateLimit('admin-login:email:' + emailKey, EMAIL_ATTEMPTS, EMAIL_WINDOW_MS)
  if (!perEmail.ok) return tooManyRequests(perEmail.retryAfterSec)

  const result = await signInAdmin(brand, email, password)

  if (!result.ok || !result.session) {
    // Only a FAILURE spends the global budget. See the note above: charging
    // successful sign-ins to a shared bucket is what turned this into a lockout.
    const global = await rateLimit('admin-login:global-failures', GLOBAL_FAILURES, 300_000)
    if (isBrand(brand)) {
      await audit({ adminUserId: null, brand, action: 'admin.login.failed', target: email, ip })
    }
    if (!global.ok) return tooManyRequests(global.retryAfterSec)
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
