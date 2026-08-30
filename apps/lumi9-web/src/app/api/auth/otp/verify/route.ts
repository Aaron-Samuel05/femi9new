import type { NextRequest } from "next/server";
import { ok, badRequest, handle , serviceUnavailable } from "@femi9/core/api";
import {
  verifyOtp,
  InvalidOtpError,
  InvalidPhoneError,
  normalizePhone,
} from "@femi9/core/services/auth";
import { missingProfileFields } from "@femi9/core/services/account";
import { createSession, sessionCookieName, SESSION_MAX_AGE } from "@femi9/core/auth";
import { rateLimit, clientIp, tooManyRequests } from "@femi9/core/rate-limit";
import { mergeGuestCartIntoUser } from "@femi9/core/services/cart";
import { GUEST_COOKIE } from "@/lib/session";
import { authMethodEnabled } from "@/lib/auth-methods";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/auth/otp/verify — { phone, code } → set the session cookie.
 *
 * Rate-limited to blunt online brute force: per-IP for the burst and per-number
 * for the sustained attempt. This COMPLEMENTS the per-code failure counter
 * inside `verifyOtp` rather than replacing it — that one is scoped to a single
 * challenge, and an attacker who can request fresh codes resets it at will.
 *
 * The guest cart is merged into the shopper's account before the response, so a
 * basket built while signed out survives signing in. Without it, signing in to
 * check out silently empties the bag that prompted the sign-in.
 */
export async function POST(req: NextRequest) {
  return handle(async () => {
    // Presentation hides the button; this is what actually closes the door.
    // A method switched off in the environment must not still be reachable by
    // anyone who kept the URL or read the bundle.
    if (!authMethodEnabled("phone")) {
      return serviceUnavailable("Mobile sign-in is not available right now.");
    }

    const body = (await req.json().catch(() => ({}))) as { phone?: unknown; code?: unknown };
    const phone = typeof body.phone === "string" ? body.phone : "";
    const code = typeof body.code === "string" ? body.code : "";

    const ipHit = await rateLimit("l9:otp:verify:ip:" + clientIp(req), 10, 60_000);
    if (!ipHit.ok) return tooManyRequests(ipHit.retryAfterSec);
    const phHit = await rateLimit("l9:otp:verify:ph:" + normalizePhone(phone), 10, 60_000);
    if (!phHit.ok) return tooManyRequests(phHit.retryAfterSec);

    try {
      const user = await verifyOtp("lumi9", phone, code, {
        // Lumi9 has no referral programme, so there is no attribution cookie to
        // consume — the context is still passed because the service signature
        // takes one, and null is the honest value.
        cookieToken: null,
        ip: clientIp(req),
        ua: req.headers.get("user-agent") ?? null,
      });

      await mergeGuestCartIntoUser("lumi9", req.cookies.get(GUEST_COOKIE)?.value ?? null, user.id);

      const token = await createSession("lumi9", {
        sub: user.id,
        phone: user.phone ?? undefined,
        email: user.email ?? undefined,
        name: user.name ?? undefined,
      });

      /*
       * A phone signup captures a phone and nothing else — no name to greet
       * her by, no email to send a receipt to. The client needs to know whether
       * to land on /account or route through /welcome first.
       *
       * `verifyOtp` stays a pure challenge verifier; completeness is derived
       * here from the ONE shared definition, so the gate on /account and the
       * screen it gates can never disagree about what "complete" means.
       */
      const missing = missingProfileFields(user);
      const res = ok({
        ok: true,
        user: { name: user.name, phone: user.phone },
        needsProfile: missing.length > 0,
        missing,
      });
      res.cookies.set(sessionCookieName("lumi9"), token, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: SESSION_MAX_AGE,
      });
      return res;
    } catch (err) {
      if (err instanceof InvalidOtpError || err instanceof InvalidPhoneError) {
        return badRequest(err.message);
      }
      throw err;
    }
  });
}
