import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { isBrand } from '@femi9/db'
import { adminCookieName } from '@femi9/core/admin-session'

/**
 * POST /api/auth/logout?brand=… — clear ONE brand's session.
 *
 * Scoped to a single brand on purpose: someone signed into both consoles in two
 * tabs expects leaving one to leave the other alone.
 */
export async function POST(req: NextRequest) {
  const brand = req.nextUrl.searchParams.get('brand')
  if (!isBrand(brand)) {
    return NextResponse.json({ error: 'Unknown brand' }, { status: 400 })
  }
  const res = NextResponse.json({ ok: true })
  res.cookies.set(adminCookieName(brand), '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  })
  return res
}
