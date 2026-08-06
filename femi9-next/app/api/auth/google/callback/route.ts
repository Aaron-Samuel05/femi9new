import { NextResponse, type NextRequest } from 'next/server'
import {
  googleConfigured,
  exchangeCodeForProfile,
  mockProfile,
  callbackUrl,
  OAUTH_STATE_COOKIE,
  type GoogleProfile,
} from '@/lib/google-oauth'
import { signInWithGoogle } from '@/lib/services/auth'
import { createSession, SESSION_COOKIE, SESSION_MAX_AGE } from '@/lib/auth'
import { mockProvidersAllowed } from '@/lib/runtime-mode'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/auth/google/callback — where Google (or, in mock mode, our own start
 * route) sends the user back. Verify the anti-CSRF state against the cookie,
 * resolve the verified profile, find-or-create the customer, set the session
 * cookie, and 307 to /account. Any failure bounces to /login?error=google. Always
 * a redirect — this is a top-level navigation, never a fetch.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const base = process.env.NEXT_PUBLIC_SITE_URL || url.origin
  const fail = (reason: string) => {
    if (reason) console.error('[auth] google callback failed:', reason)
    const res = NextResponse.redirect(new URL('/login?error=google', base), 307)
    res.cookies.set(OAUTH_STATE_COOKIE, '', {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 0,
    })
    return res
  }

  // 1. CSRF: the state in the query must match the one we set at start.
  const state = url.searchParams.get('state')
  const cookieState = req.cookies.get(OAUTH_STATE_COOKIE)?.value
  if (!state || !cookieState || state !== cookieState) return fail('state mismatch')

  // Google surfaces user-declined / config errors as ?error=...
  const oauthError = url.searchParams.get('error')
  if (oauthError) return fail(`google returned error=${oauthError}`)

  try {
    // 2. Resolve the verified profile — live exchange, or the mock identity.
    let profile: GoogleProfile
    if (googleConfigured()) {
      const code = url.searchParams.get('code')
      if (!code) return fail('missing code')
      profile = await exchangeCodeForProfile(code, callbackUrl(url.origin))
    } else {
      if (!mockProvidersAllowed()) return fail('Google is not configured')
      if (url.searchParams.get('mock') !== '1') return fail('mock marker missing')
      profile = mockProfile()
    }

    // 3. Find-or-create the customer and mint OUR session.
    const user = await signInWithGoogle(profile)
    const jwt = await createSession({
      sub: user.id,
      email: user.email ?? undefined,
      phone: user.phone ?? undefined,
      name: user.name ?? undefined,
    })

    const res = NextResponse.redirect(new URL('/account', base), 307)
    res.cookies.set(SESSION_COOKIE, jwt, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: SESSION_MAX_AGE,
    })
    res.cookies.set(OAUTH_STATE_COOKIE, '', {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 0,
    })
    return res
  } catch (err) {
    return fail(err instanceof Error ? err.message : 'unknown error')
  }
}
