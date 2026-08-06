import { NextResponse, type NextRequest } from 'next/server'
import { REF_COOKIE, logClick } from '@/lib/services/affiliate'

/**
 * GET /r/[code] — a creator's shareable link.
 *
 * Records a click for the code, drops the referral cookie so a later checkout
 * can attribute the order back to the creator, then bounces to the storefront
 * home. The cookie is set unconditionally (even for an unknown code); checkout's
 * attribution is itself a no-op for anything but an approved code, so a bogus
 * link simply carries a cookie that never earns anything.
 */

// 30-day attribution window, matching the cookie the checkout hook reads.
const THIRTY_DAYS = 60 * 60 * 24 * 30

export async function GET(req: NextRequest, props: { params: Promise<{ code: string }> }) {
  const params = await props.params;
  const code = params.code.trim()

  // Best-effort tracking — a logging hiccup must never block the redirect.
  await logClick(code).catch(() => {})

  const res = NextResponse.redirect(new URL('/', req.url), 307)
  res.cookies.set(REF_COOKIE, code, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: THIRTY_DAYS,
  })
  return res
}
