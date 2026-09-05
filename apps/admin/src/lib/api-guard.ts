import 'server-only'
import { NextResponse } from 'next/server'
import { isBrand, type Brand } from '@femi9/db'
import { getAdminSession, hasAtLeast, type AdminRole, type AdminSession } from '@femi9/core/admin-identity'
import { roleCanOnModule, roleHasModule } from '@femi9/core/admin-policy'
import type { AdminModule } from '@femi9/core/brands'

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
 *
 * ── The role argument ───────────────────────────────────────────────────────
 * `create-admin` has issued four roles since it was written — owner, manager,
 * support, readonly — and `hasAtLeast()` has existed to compare them. Nothing
 * called it. Every authenticated session, whatever its role, could refund an
 * order, rewrite a price, adjust a loyalty balance and change a customer's
 * account role: `readonly` was a label in the header and nothing more, which is
 * worse than no roles at all, because the console's own UI implies a limit that
 * the API does not impose.
 *
 * So `requireConsoleApi` now takes the minimum role for the operation. Reads
 * pass `'readonly'` (the default, and what every GET wants); ordinary writes
 * pass `'support'`; anything that moves money or changes who can do what passes
 * `'manager'`.
 *
 * The refusal is 403, not 404 — deliberately the opposite call to `hasModule`.
 * Hiding Thara from Lumi9's staff hides a PROGRAMME they should not know
 * exists; hiding "refund" from a support agent hides a button they can already
 * see in a console they are legitimately signed into. Telling them it is not
 * theirs is the honest answer, and pretending the endpoint does not exist would
 * only send them to ask why a page they can see returns nothing.
 */
export type ConsoleAuth =
  | { ok: true; brand: Brand; session: AdminSession }
  | { ok: false; response: NextResponse }

/** Routes name a legacy tier (readonly/support/manager/owner) as their bar.
 *  Business roles are consulted via the per-module policy when the caller
 *  also passes a moduleName; otherwise `hasAtLeast` compares only against
 *  the legacy tier and business roles fail closed (they have rank -1). */
export type MinTier = 'owner' | 'manager' | 'support' | 'readonly'

export async function requireConsoleApi(
  brandParam: string,
  minRole: MinTier = 'readonly',
  moduleName?: AdminModule,
): Promise<ConsoleAuth> {
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
  // When a route names its module, use the per-module policy (which handles
  // both the tier check AND the no-access-at-all case for business roles like
  // `finance`/`content_manager`). When a route doesn't name a module, fall
  // back to the legacy linear tier — every existing call site stays valid.
  if (moduleName) {
    // Role-can-see-module first: matches the page guard's 404-not-403 stance
    // so an endpoint doesn't confirm a module exists to a role that shouldn't
    // know it does.
    if (!roleHasModule(session.role, moduleName)) {
      return { ok: false, response: new NextResponse(null, { status: 404 }) }
    }
    if (!roleCanOnModule(session.role, moduleName, minRole)) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: 'Your role does not allow this action.' },
          { status: 403 },
        ),
      }
    }
  } else if (!hasAtLeast(session.role, minRole)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Your role does not allow this action.' },
        { status: 403 },
      ),
    }
  }
  return { ok: true, brand: session.brand, session }
}

/** Module gate for an API route, mirroring `requireConsole` for pages. */
export function moduleGate(allowed: boolean): NextResponse | null {
  return allowed ? null : new NextResponse(null, { status: 404 })
}
