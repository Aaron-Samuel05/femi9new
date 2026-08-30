import { NextResponse, type NextRequest } from "next/server";
import {
  googleConfigured,
  exchangeCodeForProfile,
  mockProfile,
  callbackUrl,
  type GoogleProfile,
} from "@femi9/core/google-oauth";
import { signInWithGoogle } from "@femi9/core/services/auth";
import { missingProfileFields } from "@femi9/core/services/account";
import { createSession, sessionCookieName, SESSION_MAX_AGE } from "@femi9/core/auth";
import { mockProvidersAllowed } from "@femi9/core/runtime-mode";
import { clientIp } from "@femi9/core/rate-limit";
import { mergeGuestCartIntoUser } from "@femi9/core/services/cart";
import { safeNextPath } from "@/lib/safe-next";
import { GUEST_COOKIE } from "@/lib/session";
import { OAUTH_NEXT_COOKIE, OAUTH_STATE_COOKIE } from "@/lib/oauth-cookies";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/auth/google/callback — where Google (or, in mock mode, our own start
 * route) sends the shopper back.
 *
 * Verify the anti-CSRF state against the cookie, resolve the verified profile,
 * find-or-create the customer, merge her guest bag, set the session cookie, and
 * 307 onward. Any failure bounces to /login?error=google with the same message
 * regardless of cause — the difference between "state mismatch" and "that
 * address has no account" is information about who shops here.
 *
 * Always a redirect: this is a top-level navigation, never a fetch.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const base = process.env.NEXT_PUBLIC_SITE_URL || url.origin;

  // Both handshake cookies are single-use. Cleared on EVERY exit path so an
  // abandoned attempt cannot leave a stale destination behind for the next one.
  const clearHandshake = (res: NextResponse) => {
    const expire = {
      httpOnly: true,
      sameSite: "lax" as const,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 0,
    };
    res.cookies.set(OAUTH_STATE_COOKIE, "", expire);
    res.cookies.set(OAUTH_NEXT_COOKIE, "", expire);
    return res;
  };

  const fail = (reason: string) => {
    if (reason) console.error("[auth] google callback failed:", reason);
    return clearHandshake(NextResponse.redirect(new URL("/login?error=google", base), 307));
  };

  // 1. CSRF: the state in the query must match the one we set at the start.
  const state = url.searchParams.get("state");
  const cookieState = req.cookies.get(OAUTH_STATE_COOKIE)?.value;
  if (!state || !cookieState || state !== cookieState) return fail("state mismatch");

  // Google surfaces a declined consent or a misconfigured client as ?error=…
  const oauthError = url.searchParams.get("error");
  if (oauthError) return fail(`google returned error=${oauthError}`);

  try {
    // 2. Resolve the verified profile — a live exchange, or the mock identity.
    let profile: GoogleProfile;
    if (googleConfigured()) {
      const code = url.searchParams.get("code");
      if (!code) return fail("missing code");
      profile = await exchangeCodeForProfile(code, callbackUrl(url.origin));
    } else {
      if (!mockProvidersAllowed()) return fail("Google is not configured");
      if (url.searchParams.get("mock") !== "1") return fail("mock marker missing");
      profile = mockProfile();
    }

    // 3. Find-or-create the customer in the LUMI9 schema and mint OUR session.
    const user = await signInWithGoogle("lumi9", profile, {
      cookieToken: null,
      ip: clientIp(req),
      ua: req.headers.get("user-agent") ?? null,
    });
    await mergeGuestCartIntoUser("lumi9", req.cookies.get(GUEST_COOKIE)?.value ?? null, user.id);

    const jwt = await createSession("lumi9", {
      sub: user.id,
      email: user.email ?? undefined,
      phone: user.phone ?? undefined,
      name: user.name ?? undefined,
    });

    /*
     * Google gives a name and an email and never a phone, so a first-time
     * Google shopper is still incomplete — and this storefront delivers
     * parcels, which needs a number. She lands on /welcome, where the rendered
     * fields are driven by `missing`, i.e. just the mobile step. Either way the
     * destination she was originally headed for survives the detour.
     */
    const next = safeNextPath(req.cookies.get(OAUTH_NEXT_COOKIE)?.value, "/account");
    const incomplete = missingProfileFields(user).length > 0;
    const target = incomplete
      ? `/welcome${next !== "/account" ? `?next=${encodeURIComponent(next)}` : ""}`
      : next;

    const res = NextResponse.redirect(new URL(target, base), 307);
    res.cookies.set(sessionCookieName("lumi9"), jwt, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SESSION_MAX_AGE,
    });
    return clearHandshake(res);
  } catch (err) {
    return fail(err instanceof Error ? err.message : "unknown error");
  }
}
