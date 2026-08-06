import 'server-only'
import { cookies } from 'next/headers'
import { SignJWT, jwtVerify } from 'jose'

/**
 * Customer (storefront) session.
 *
 * Deliberately SEPARATE from admin-auth.ts: a shopper session lives in its own
 * cookie (SESSION_COOKIE) so signing into the storefront can never grant the ops
 * console, and vice-versa. Same mechanism though — a stateless HS256 JWT signed
 * with AUTH_SECRET via `jose` (edge-safe, so the middleware can re-verify inline
 * on the edge runtime while this Node-side module serves route handlers and
 * server components).
 *
 * The token is the identity; the sub claim is User.id. phone/email/name are
 * carried as convenience claims so common reads (greeting, prefill) don't need a
 * DB hit — anything trust-sensitive should re-read from the DB by sub.
 */

export const SESSION_COOKIE = 'femi9_session'

// 30 days, in seconds — the cookie Max-Age and the JWT expiry are kept in lockstep
// so a still-present cookie always carries a still-valid token.
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30

export interface CustomerSession {
  sub: string
  phone?: string
  email?: string
  name?: string
}

/** Secret key as bytes. Read per-call (cheap) so a rotated env is picked up. */
function secretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET
  if (!secret) throw new Error('AUTH_SECRET is not set')
  return new TextEncoder().encode(secret)
}

/** Sign a 30-day session token for the given customer identity. Only defined
 *  claims are written so an absent phone/email doesn't land as a null claim. */
export async function createSession(payload: CustomerSession): Promise<string> {
  return new SignJWT({
    ...(payload.phone ? { phone: payload.phone } : {}),
    ...(payload.email ? { email: payload.email } : {}),
    ...(payload.name ? { name: payload.name } : {}),
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.sub)
    .setAudience('femi9-customer')
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(secretKey())
}

/** Verify a token → the session, or null for expired/tampered/missing-sub. */
export async function verifySession(token: string): Promise<CustomerSession | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ['HS256'], audience: 'femi9-customer' })
    // A valid signature over a payload with no subject is not a usable identity.
    if (typeof payload.sub !== 'string') return null
    return {
      sub: payload.sub,
      phone: typeof payload.phone === 'string' ? payload.phone : undefined,
      email: typeof payload.email === 'string' ? payload.email : undefined,
      name: typeof payload.name === 'string' ? payload.name : undefined,
    }
  } catch {
    return null
  }
}

/** Server helper: read + verify the customer cookie on the current request. */
export async function getSession(): Promise<CustomerSession | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  if (!token) return null
  return verifySession(token)
}

/**
 * Guard for route handlers. Same semantics as getSession (returns the session or
 * null) but named for the call site — handlers do
 * `const u = await requireUser(); if (!u) return unauthorized()`.
 */
export async function requireUser(): Promise<CustomerSession | null> {
  return getSession()
}
