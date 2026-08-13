import { NextResponse, type NextRequest } from 'next/server'
import {
  googleConfigured,
  generateState,
  buildConsentUrl,
  callbackUrl,
  OAUTH_STATE_COOKIE,
  OAUTH_NEXT_COOKIE,
} from '@/lib/google-oauth'
import { rateLimit, clientIp, tooManyRequests } from '@/lib/rate-limit'
import { mockProvidersAllowed } from '@/lib/runtime-mode'
import { safeNextPath } from '@/lib/safe-next'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const STATE_MAX_AGE = 10 * 60 // 10 minutes: a consent screen isn't left open longer

/**
 * GET /api/auth/google — begin "Continue with Google".
 *
 * Mint an anti-CSRF `state`, stash it in an httpOnly cookie, and 307 to Google's
 * consent screen. In MOCK mode (no Google credentials) we skip the network and
 * bounce straight to our own callback with the same state, so the whole flow is
 * exercised locally. This is a top-level navigation, so it always redirects.
 */
export async function GET(req: NextRequest) {
  // Cheap abuse guard on the redirect initiator.
  const hit = await rateLimit('google:start:' + clientIp(req), 20, 60_000)
  if (!hit.ok) return tooManyRequests(hit.retryAfterSec)

  const origin = new URL(req.url).origin
  if (!googleConfigured() && !mockProvidersAllowed()) {
    return NextResponse.redirect(new URL('/login?error=google-config', origin), 307)
  }
  const state = generateState()
  const redirectUri = callbackUrl(origin)

  const target = googleConfigured()
    ? buildConsentUrl(state, redirectUri)
    : // Mock: jump to our callback with a marker + the same state.
      `${redirectUri}?mock=1&state=${state}`

  const res = NextResponse.redirect(target, 307)
  const cookieOpts = {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: STATE_MAX_AGE,
  }
  res.cookies.set(OAUTH_STATE_COOKIE, state, cookieOpts)

  // Park the destination for the callback. Validated on the way in AND on the way
  // out: the cookie is httpOnly so a page script cannot forge it, but re-checking
  // costs nothing and keeps the guarantee local to the redirect that uses it.
  const next = safeNextPath(new URL(req.url).searchParams.get('next'), '')
  if (next) res.cookies.set(OAUTH_NEXT_COOKIE, next, cookieOpts)

  return res
}
