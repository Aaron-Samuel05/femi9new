import 'server-only'
import { notFound, redirect } from 'next/navigation'
import { isBrand, type Brand } from '@femi9/db'
import { getAdminSession, type AdminSession } from '@femi9/core/admin-identity'
import { hasModule, type AdminModule } from '@femi9/core/brands'
import { roleHasModule } from '@femi9/core/admin-policy'

/**
 * The guard every console page calls.
 *
 * `proxy.ts` already checked the session, but that is a routing rule, not an
 * authorisation — a matcher change, a rewrite, or a route added outside the
 * pattern would silently unguard a page. Pages re-check. It costs a cookie
 * verify.
 */
export async function requireConsole(
  brandParam: string,
  moduleName?: AdminModule,
): Promise<{ brand: Brand; session: AdminSession }> {
  // Not a brand at all: 404, not a redirect. A redirect to /login would confirm
  // which first segments are real.
  if (!isBrand(brandParam)) notFound()
  const brand: Brand = brandParam

  const session = await getAdminSession(brand)
  if (!session) redirect(`/login?brand=${brand}`)

  if (moduleName) {
    // A module this brand does not have is 404, never 403: Lumi9's staff should
    // not learn that Thara exists by guessing a URL.
    if (!hasModule(brand, moduleName)) notFound()
    // A module this ROLE cannot see is also 404 for the same reason — a Finance
    // admin should not learn from a 403 that "Blog" is a real thing the console
    // exposes, only that "there's no such page for me".
    if (!roleHasModule(session.role, moduleName)) notFound()
  }

  return { brand, session }
}
