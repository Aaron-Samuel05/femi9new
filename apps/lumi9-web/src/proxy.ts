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
/**
 * `/welcome` is guarded too, and it has to be: it is the onboarding step that
 * writes a name, an email and a phone onto the SESSION's user. An anonymous
 * request reaching it would render a form with nobody to save to.
 *
 * `/checkout` is guarded BY DECISION, not by necessity. Femi9 does not gate it
 * — its middleware matcher is `/account`, `/dashboard`, `/welcome`, its
 * checkout page prefills from a session and shrugs without one, and
 * `placeOrder` takes `userId: string | null` precisely so a guest can buy.
 * Lumi9 requires an account instead, so every order has a real identity behind
 * it from the first request rather than one reverse-engineered from the phone
 * number typed into the form. The two brands genuinely differ here; do not
 * "align" this back to Femi9 without asking, and do not assume the shared
 * services need changing — `placeOrder`'s guest path stays valid for Femi9.
 *
 * The cost is a redirect on the busiest click on the site, which is why the
 * cart CTAs point at /login themselves when the session is known to be absent:
 * this guard is the floor, not the route a shopper normally takes.
 *
 * `/order/:path*` is NOT here on purpose. An order confirmation is reachable by
 * a guest through the unguessable `?t=` capability token minted when the order
 * was placed — and orders placed BEFORE this gate existed belong to shoppers
 * who never had an account. That page authorises itself, by the token OR by a
 * session that owns the order.
 */
export const config = {
  matcher: ["/account/:path*", "/welcome", "/checkout"],
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
