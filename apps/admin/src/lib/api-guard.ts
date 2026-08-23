import 'server-only'
import { NextResponse } from 'next/server'
import { isBrand, type Brand } from '@femi9/db'
import { getAdminSession, type AdminSession } from '@femi9/core/admin-identity'

/**
 * The guard every console API route calls.
 *
 * `proxy.ts` checked the session already, but that is a routing rule and not an
 * authorisation — a matcher change or a route added outside the pattern would
 * silently unguard an endpoint that can refund money. Handlers re-check.
 *
 * Returns the SESSION's brand, never the URL's. The two agree (the guard
 * rejects a mismatch) but services must be handed the authenticated one, so
 * that a future routing change cannot turn a path segment into a data selector.
 */
export type ConsoleAuth =
  | { ok: true; brand: Brand; session: AdminSession }
  | { ok: false; response: NextResponse }

export async function requireConsoleApi(brandParam: string): Promise<ConsoleAuth> {
  if (!isBrand(brandParam)) {
    // Not a brand: 404, so the endpoint set is not enumerable by response code.
    return { ok: false, response: new NextResponse(null, { status: 404 }) }
  }
  const session = await getAdminSession(brandParam)
  if (!session) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    }
  }
  return { ok: true, brand: session.brand, session }
}

/** Module gate for an API route, mirroring `requireConsole` for pages. */
export function moduleGate(allowed: boolean): NextResponse | null {
  return allowed ? null : new NextResponse(null, { status: 404 })
}
