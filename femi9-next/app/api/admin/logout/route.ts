import { handle, ok } from '@/lib/api'
import { ADMIN_COOKIE } from '@/lib/admin-auth'

/** POST /api/admin/logout — drop the session cookie. */
export async function POST() {
  return handle(async () => {
    const res = ok({ ok: true })
    // maxAge 0 expires the cookie immediately so the browser discards it.
    res.cookies.set(ADMIN_COOKIE, '', {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 0,
    })
    return res
  })
}
