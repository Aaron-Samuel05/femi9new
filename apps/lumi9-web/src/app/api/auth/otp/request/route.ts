import type { NextRequest } from "next/server";
import { ok, badRequest, handle, serviceUnavailable } from "@femi9/core/api";
import { requestOtp, InvalidPhoneError, normalizePhone } from "@femi9/core/services/auth";
import { rateLimit, clientIp, tooManyRequests } from "@femi9/core/rate-limit";
import { ProviderConfigurationError } from "@femi9/core/runtime-mode";
import { authMethodEnabled } from "@/lib/auth-methods";

// node:crypto (through the OTP seam) needs the Node runtime; cookies and the
// database make it dynamic.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/auth/otp/request — { phone } → mint and send a sign-in code.
 *
 * Phone is the PRIMARY sign-in method on this storefront, matching what
 * lumi9.in already asks for: a +91 mobile, an OTP, done. The emailed link
 * stays as the secondary path for shoppers who would rather not give a number.
 *
 * Rate-limited on two axes BEFORE the database or the SMS provider is touched.
 * `requestOtp` will send to any well-formed number without creating anything,
 * so without a limit this is an unauthenticated way to have Lumi9 text an
 * arbitrary phone on demand: per-IP stops one client bursting, per-number stops
 * SMS-bombing one handset. The per-number bucket is keyed on the SAME canonical
 * value the service uses, or `+91 98842 30571` and `9884230571` would get a
 * bucket each.
 *
 * The buckets are shared with /api/account/phone/request on purpose — the abuse
 * being blunted is messages to one number, and it does not matter which
 * endpoint sent them.
 */
export async function POST(req: NextRequest) {
  return handle(async () => {
    // Presentation hides the button; this is what actually closes the door.
    // A method switched off in the environment must not still be reachable by
    // anyone who kept the URL or read the bundle.
    if (!authMethodEnabled("phone")) {
      return serviceUnavailable("Mobile sign-in is not available right now.");
    }

    const body = (await req.json().catch(() => ({}))) as { phone?: unknown };
    const phone = typeof body.phone === "string" ? body.phone : "";

    const ipHit = await rateLimit("l9:otp:req:ip:" + clientIp(req), 5, 60_000);
    if (!ipHit.ok) return tooManyRequests(ipHit.retryAfterSec);
    const phHit = await rateLimit("l9:otp:req:ph:" + normalizePhone(phone), 5, 3_600_000);
    if (!phHit.ok) return tooManyRequests(phHit.retryAfterSec);

    try {
      // `devCode` comes back only in mock mode, so the whole flow is testable
      // before a real SMS provider is configured.
      const { mock, devCode } = await requestOtp("lumi9", phone);
      return ok({ ok: true, mock, ...(devCode ? { devCode } : {}) });
    } catch (err) {
      if (err instanceof InvalidPhoneError) return badRequest(err.message);
      if (err instanceof ProviderConfigurationError) {
        return serviceUnavailable("SMS sign-in is temporarily unavailable.");
      }
      throw err;
    }
  });
}
