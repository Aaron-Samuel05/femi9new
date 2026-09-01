import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@femi9/core/auth";
import { dbFor } from "@femi9/db";
import {
  attachIdentity,
  IdentityConflictError,
  verifyAttachEmailToken,
} from "@femi9/core/services/auth";
import { logger } from "@femi9/core/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/account/email/verify?token=RAW&email=EMAIL — where the "confirm your
 * email" link lands.
 *
 * ── Why this file had to exist ──────────────────────────────────────────────
 * `requestAttachEmailLink` in `@femi9/core` builds the emailed URL as
 * `${base}/api/account/email/verify?...`, and Lumi9 calls it from
 * `/api/account/complete-profile` and from the profile panel. Femi9 has that
 * route; this app did not. So every confirmation link Lumi9 has ever sent
 * pointed at a path that answered 404 on its own domain.
 *
 * Nothing reported it. The request succeeded, the mail was delivered, the
 * shopper clicked, and only she saw the failure — as a not-found page, from us,
 * on the one step that turns her address into a verified one. `emailVerified`
 * therefore stayed null for every Lumi9 account that arrived by phone OTP or
 * Google without a confirmed address.
 *
 * It is a top-level navigation from an inbox, so it always REDIRECTS and never
 * returns JSON: a shopper who clicks a link in her mail app must end up on a
 * page, whatever happened.
 *
 * Unlike the sign-in magic link this does NOT mint a session. The token is
 * namespaced to a specific userId (`attach-email:<userId>:<email>`), and
 * redeeming it only ever stamps `emailVerified` on THAT row — so a link
 * forwarded to somebody else is inert rather than an account takeover. A
 * signed-out click is bounced through /login and back to the same URL, which is
 * why an unauthenticated visit is a detour and not an error.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token") ?? "";
  const email = url.searchParams.get("email") ?? "";
  // `url.origin` is the fallback, not the primary: behind CloudFront the origin
  // is the internal host, and a redirect to it would leave the site.
  const base = process.env.NEXT_PUBLIC_SITE_URL || url.origin;

  const session = await getSession("lumi9");
  if (!session) {
    // Sign in first, then come back to this exact link, so a click from a
    // browser that is not signed in still completes instead of dead-ending.
    // `safeNextPath` on the other side is what keeps this from being a redirect
    // primitive: it only accepts a same-origin path.
    const next = encodeURIComponent(`/api/account/email/verify${url.search}`);
    return NextResponse.redirect(new URL(`/login?next=${next}`, base), 307);
  }

  try {
    const normalized = await verifyAttachEmailToken("lumi9", session.sub, email, token);
    await attachIdentity(dbFor("lumi9"), session.sub, {
      email: normalized,
      emailVerified: new Date(),
    });
    return NextResponse.redirect(new URL("/account?verified=email", base), 307);
  } catch (err) {
    // A conflict (the address is on another account) and an expired or already
    // used link are both ordinary outcomes a shopper can cause, so neither is
    // logged as an error. Anything else is a real fault worth seeing.
    const expected =
      err instanceof IdentityConflictError ||
      (err instanceof Error && err.name === "InvalidMagicLinkError");
    if (!expected) {
      logger.error("account_email_verify_failed", { err: String(err) });
    }
    return NextResponse.redirect(new URL("/account?error=link", base), 307);
  }
}
