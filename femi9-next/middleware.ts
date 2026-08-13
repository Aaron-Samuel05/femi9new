import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * Edge guard for the two authenticated surfaces: the admin console and the
 * customer account area. Both verify an HS256 session cookie with Web Crypto
 * (no Node/server-only imports) so this stays edge-compatible. Guarded server
 * layouts and route handlers verify again in the Node runtime.
 *
 * The two cookies are distinct on purpose — an admin session never satisfies the
 * customer guard and vice-versa.
 */

const ADMIN_COOKIE = 'femi9_admin'
const SESSION_COOKIE = 'femi9_session'

// Reachable without an admin session: the login screen and the auth endpoints.
const ADMIN_PUBLIC_PATHS = new Set(['/admin/login', '/api/admin/login', '/api/admin/logout'])

export const config = {
  // Customer /api/auth/* is intentionally NOT matched here — those endpoints must
  // stay public (they're how you obtain a session in the first place). /welcome
  // joins the list because onboarding writes to the signed-in user's own row:
  // it needs a session, but NOT a complete profile (that check can't happen at
  // the edge — it's a DB read — so it lives in the /account and /dashboard
  // server pages, which redirect here while the profile is incomplete).
  //
  // Nothing outside these four prefixes is matched, so static assets, /_next
  // and every storefront route stay untouched.
  matcher: ['/admin/:path*', '/api/admin/:path*', '/account/:path*', '/dashboard/:path*', '/welcome/:path*'],
}

/** Verify a session JWT against AUTH_SECRET, bound to the given audience so a
 *  token minted for the other surface is rejected. Any failure (bad sig, expiry,
 *  wrong audience, missing secret, absent token) reads as "not signed in". */
async function isValidToken(token: string | undefined, audience: string): Promise<boolean> {
  if (!token || !process.env.AUTH_SECRET) return false
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return false
    const [headerPart, payloadPart, signaturePart] = parts as [string, string, string]
    const header = JSON.parse(new TextDecoder().decode(base64urlBytes(headerPart))) as {
      alg?: unknown
    }
    if (header.alg !== 'HS256') return false
    const payload = JSON.parse(new TextDecoder().decode(base64urlBytes(payloadPart))) as {
      aud?: unknown
      exp?: unknown
      nbf?: unknown
      sub?: unknown
    }
    const now = Math.floor(Date.now() / 1000)
    const audienceMatches =
      payload.aud === audience ||
      (Array.isArray(payload.aud) && payload.aud.some((value) => value === audience))
    if (
      !audienceMatches ||
      typeof payload.sub !== 'string' ||
      typeof payload.exp !== 'number' ||
      payload.exp <= now ||
      (typeof payload.nbf === 'number' && payload.nbf > now)
    ) {
      return false
    }

    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(process.env.AUTH_SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    )
    return crypto.subtle.verify(
      'HMAC',
      key,
      base64urlBytes(signaturePart),
      new TextEncoder().encode(`${headerPart}.${payloadPart}`),
    )
  } catch {
    return false
  }
}

function base64urlBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=')
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl

  // ── Admin surface ───────────────────────────────────────────────────────────
  if (pathname.startsWith('/admin') || pathname.startsWith('/api/admin')) {
    if (ADMIN_PUBLIC_PATHS.has(pathname)) return NextResponse.next()

    if (await isValidToken(req.cookies.get(ADMIN_COOKIE)?.value, 'femi9-admin')) {
      return NextResponse.next()
    }

    // Unauthenticated: APIs get a JSON 401; pages bounce to the login screen.
    if (pathname.startsWith('/api/admin')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // A shopper who followed a stray /admin link is not staff and never will be
    // — the admin cookie is a different name with a different audience, so the
    // ops sign-in form is a dead end for her. Send her to her own account
    // instead of showing her a staff login screen.
    if (await isValidToken(req.cookies.get(SESSION_COOKIE)?.value, 'femi9-customer')) {
      const accountUrl = req.nextUrl.clone()
      accountUrl.pathname = '/account'
      accountUrl.search = ''
      return NextResponse.redirect(accountUrl)
    }

    const loginUrl = req.nextUrl.clone()
    loginUrl.pathname = '/admin/login'
    loginUrl.search = ''
    return NextResponse.redirect(loginUrl)
  }

  // ── Customer surface (/account, /dashboard, /welcome) ───────────────────────
  if (await isValidToken(req.cookies.get(SESSION_COOKIE)?.value, 'femi9-customer')) {
    return NextResponse.next()
  }

  // Carry the requested path across sign-in so the shopper lands where she was
  // headed. The clone keeps the original query string, so it is cleared before
  // `next` is written — otherwise /account?verified=email would arrive at
  // /login carrying a stray `verified` param. /login validates `next` again
  // (must be a same-origin path, never /api and never /welcome) before using it.
  const loginUrl = req.nextUrl.clone()
  loginUrl.pathname = '/login'
  loginUrl.search = ''
  loginUrl.searchParams.set('next', `${pathname}${search}`)
  return NextResponse.redirect(loginUrl)
}
