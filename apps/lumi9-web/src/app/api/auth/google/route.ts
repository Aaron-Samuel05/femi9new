import { NextResponse, type NextRequest } from "next/server";
import {
  googleConfigured,
  generateState,
  buildConsentUrl,
  callbackUrl,
} from "@femi9/core/google-oauth";
import { rateLimit, clientIp, tooManyRequests } from "@femi9/core/rate-limit";
import { mockProvidersAllowed } from "@femi9/core/runtime-mode";
import { safeNextPath } from "@/lib/safe-next";
import { authMethodEnabled } from "@/lib/auth-methods";
import {
  OAUTH_NEXT_COOKIE,
  OAUTH_STATE_COOKIE,
  OAUTH_STATE_MAX_AGE,
} from "@/lib/oauth-cookies";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/auth/google - begin "Continue with Google".
 *
 * The login card has had a Google button since it was written and it was wired
 * to nothing: a `<button type="button">` with no handler, beside an Apple one
 * with no implementation behind it at all. A control that visibly does nothing
 * is worse than an absent one - a shopper presses it twice, then leaves.
 *
 * Mint an anti-CSRF `state`, stash it in an httpOnly cookie, and 307 to Google.
 * In MOCK mode (no credentials configured) skip the network and bounce straight
 * to our own callback carrying the same state, so the whole flow is exercisable
 * locally. This is a top-level navigation, so every path here REDIRECTS.
 */
export async function GET(req: NextRequest) {
  const hit = await rateLimit("l9:google:start:" + clientIp(req), 20, 60_000);
  if (!hit.ok) return tooManyRequests(hit.retryAfterSec);

  /*
   * Prefer the configured site URL over the request origin.
   *
   * Behind the load balancer the standalone server binds HOSTNAME=0.0.0.0, so
   * `new URL(req.url).origin` is `http://0.0.0.0:3001`. `callbackUrl()` already
   * prefers the env var internally so the OAuth redirect_uri was never wrong -
   * but the error redirect below builds on this value, and on the raw origin it
   * would send the shopper to an unroutable host instead of the login page.
   */
  const origin = process.env.NEXT_PUBLIC_SITE_URL?.trim() || new URL(req.url).origin;

  /*
   * Switched off, or never configured.
   *
   * `authMethodEnabled` covers BOTH, and the first is the one that matters
   * here: `googleConfigured()` is true whenever a client id and secret exist,
   * which they do today - while `GOOGLE_REDIRECT_URI` still names Femi9's host,
   * so the consent screen answers `redirect_uri_mismatch`. Detection cannot see
   * that; `AUTH_GOOGLE_ENABLED=false` can.
   *
   * Hiding the button on /login is not enough on its own: this is a plain GET
   * that anyone who kept the URL can reach.
   */
  if (!authMethodEnabled("google")) {
    return NextResponse.redirect(new URL("/login?error=google-config", origin), 307);
  }

  if (!googleConfigured() && !mockProvidersAllowed()) {
    return NextResponse.redirect(new URL("/login?error=google-config", origin), 307);
  }

  const state = generateState();
  const redirectUri = callbackUrl(origin);
  const target = googleConfigured()
    ? buildConsentUrl(state, redirectUri)
    : // Mock: jump straight to our own callback with a marker and the same state.
      `${redirectUri}?mock=1&state=${state}`;

  const res = NextResponse.redirect(target, 307);
  const cookieOpts = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: OAUTH_STATE_MAX_AGE,
  };
  res.cookies.set(OAUTH_STATE_COOKIE, state, cookieOpts);

  /*
   * Park the destination for the callback.
   *
   * It cannot ride on the query string: Google echoes back only `code` and
   * `state`, and `state` is the CSRF nonce compared byte-for-byte, so widening
   * it to carry a payload would weaken that check. Validated on the way in AND
   * again on the way out - the cookie is httpOnly so a page script cannot forge
   * it, but re-checking costs nothing and keeps the guarantee local to the
   * redirect that relies on it.
   */
  const next = safeNextPath(new URL(req.url).searchParams.get("next"), "");
  if (next) res.cookies.set(OAUTH_NEXT_COOKIE, next, cookieOpts);

  return res;
}
