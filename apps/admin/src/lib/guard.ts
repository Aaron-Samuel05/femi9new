import 'server-only'
import { notFound, redirect } from 'next/navigation'
import { isBrand, type Brand } from '@femi9/db'
import { getAdminSession, type AdminSession } from '@femi9/core/admin-identity'
import { hasModule, type AdminModule } from '@femi9/core/brands'

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

  // A module this brand does not have is 404, never 403: Lumi9's staff should
  // not learn that Thara exists by guessing a URL, and 403 tells them it does.
  if (moduleName && !hasModule(brand, moduleName)) notFound()

  return { brand, session }
}
