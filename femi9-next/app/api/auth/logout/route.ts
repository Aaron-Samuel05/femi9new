import { handle, ok } from '@/lib/api'
import { SESSION_COOKIE } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/** POST /api/auth/logout — drop the customer session cookie. */
export async function POST() {
  return handle(async () => {
    const res = ok({ ok: true })
    // maxAge 0 expires the cookie immediately so the browser discards it.
    res.cookies.set(SESSION_COOKIE, '', {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 0,
    })
    return res
  })
}
