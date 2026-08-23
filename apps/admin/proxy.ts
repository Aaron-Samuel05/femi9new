import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { isBrand } from '@femi9/db'
import { adminCookieName, verifyAdminSession } from '@femi9/core/admin-session'

/**
 * The console's route guard.
 *
 * This is `proxy`, not `middleware`, which is Next 16's convention and here also
 * a deliberate improvement: `proxy` runs on the Node runtime, so it calls the
 * SAME `verifyAdminSession` the request handlers do. Femi9's storefront
 * middleware has to re-implement its verification inline because it runs on the
 * edge — one check written twice, where changing one means remembering the
 * other. This app has one verifier.
 *
 * Guarding is still done twice, though, in the other sense: this is the first
 * gate, not the only one. Every page and route handler re-reads the session,
 * because a matcher is a routing rule and not an authorisation.
 */

export const config = {
  // Everything except the login screen, the auth endpoints, and static assets.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|login|api/auth).*)'],
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl

  // The root is a chooser, not a console. It decides where to send you.
  if (pathname === '/') {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  // The group view is the ONE path that is not brand-scoped. It decides for
  // itself which brands the visitor may see (the intersection of what they are
  // signed into and what they hold a role in), so it only needs to get past
  // this guard — which is why it is allowed through rather than matched to a
  // brand that does not exist.
  if (pathname === '/group' || pathname.startsWith('/group/')) {
    return NextResponse.next()
  }

  // Every other console path is /<brand>/…  — the brand is the first segment.
  const [, brandSegment, ...rest] = pathname.split('/')

  // An unknown first segment is not a brand and never will be. 404 rather than
  // redirect: a redirect to /login would confirm that /lumi9 means something
  // and /acme does not.
  if (!isBrand(brandSegment)) {
    return new NextResponse(null, { status: 404 })
  }

  const token = req.cookies.get(adminCookieName(brandSegment))?.value
  const session = await verifyAdminSession(token, brandSegment)

  if (session) return NextResponse.next()

  // Unauthenticated. APIs get JSON; pages go to the login screen with the brand
  // preselected and the destination remembered.
  if (rest[0] === 'api') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const loginUrl = req.nextUrl.clone()
  loginUrl.pathname = '/login'
  loginUrl.search = ''
  loginUrl.searchParams.set('brand', brandSegment)
  // `next` is re-validated on the way back out — it must be a same-origin path
  // under this brand, so it cannot be turned into an open redirect.
  loginUrl.searchParams.set('next', pathname)
  return NextResponse.redirect(loginUrl)
}
