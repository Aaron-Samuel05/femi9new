import { NextResponse, type NextRequest } from "next/server";
import { verifyMagicLink } from "@femi9/core/services/auth";
import { createSession, sessionCookieName, SESSION_MAX_AGE } from "@femi9/core/auth";
import { clientIp } from "@femi9/core/rate-limit";
import { mergeGuestCartIntoUser } from "@femi9/core/services/cart";
import { safeNextPath } from "@/lib/safe-next";
import { GUEST_COOKIE } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/auth/email/verify?token=…&email=… — where the emailed link lands.
 *
 * This is a top-level navigation from an inbox, so it must REDIRECT on every
 * path, never return JSON. A failure bounces to /login?error=link rather than
 * explaining itself: the difference between "expired" and "never existed" is
 * information about who has an account here.
 *
 * The guest cart is merged into the shopper's before the redirect, so a basket
 * built while signed out survives signing in — otherwise the sign-in link
 * silently empties it.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token") ?? "";
  const email = url.searchParams.get("email") ?? "";
  const next = safeNextPath(url.searchParams.get("next"), "/account");
  const base = process.env.NEXT_PUBLIC_SITE_URL || url.origin;

  try {
    const user = await verifyMagicLink("lumi9", email, token, {
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

    const res = NextResponse.redirect(new URL(next, base));
    res.cookies.set(sessionCookieName("lumi9"), jwt, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SESSION_MAX_AGE,
    });
    return res;
  } catch {
    // One outcome for every failure — expired, already used, wrong address.
    return NextResponse.redirect(new URL("/login?error=link", base));
  }
}
