import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { sessionCookieName, verifySession } from "@femi9/core/customer-session";

/**
 * Route guard for Lumi9's signed-in surface.
 *
 * `proxy` rather than `middleware`: it is Next 16's convention and it runs on
 * the Node runtime, so it calls the SAME verifier the request handlers do.
 * Femi9's storefront middleware re-implements JWT verification inline because
 * it targets the edge — one check written twice, where changing one means
 * remembering the other. This app has one.
 *
 * Still the FIRST gate, not the only one: /account re-reads the session
 * server-side, because a matcher is a routing rule and not an authorisation.
 */
export const config = {
  matcher: ["/account/:path*"],
};

export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // Verified against Lumi9's customer audience, so a Femi9 cookie — or an admin
  // one — is inert here even though all three are signed with the same secret.
  const token = req.cookies.get(sessionCookieName("lumi9"))?.value;
  if (await verifySession("lumi9", token)) return NextResponse.next();

  const login = req.nextUrl.clone();
  login.pathname = "/login";
  login.search = "";
  // Carry the destination so signing in returns her where she was headed.
  // It is validated again by safeNextPath before it is ever used.
  login.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(login);
}
