import type { NextRequest } from "next/server";
import { ok, badRequest, handle, serviceUnavailable } from "@femi9/core/api";
import { requestMagicLink, InvalidEmailError, normalizeEmail } from "@femi9/core/services/auth";
import { rateLimit, clientIp, tooManyRequests } from "@femi9/core/rate-limit";
import { ProviderConfigurationError } from "@femi9/core/runtime-mode";
import { safeNextPath } from "@/lib/safe-next";
import { authMethodEnabled } from "@/lib/auth-methods";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/auth/email/request — { email } → mint and send a sign-in link.
 *
 * Lumi9 has no customer passwords, and neither does Femi9: the platform signs
 * shoppers in with a link or a phone OTP. That is why the login card asks for
 * an email and nothing else.
 *
 * Rate-limited on two axes BEFORE touching the database or the mail provider.
 * `requestMagicLink` will send to any syntactically valid address without
 * creating anything, so without a limit this endpoint is an unauthenticated
 * amplifier that delivers Lumi9-branded mail to arbitrary inboxes on demand:
 * per-IP stops one client bursting, per-address stops mail-bombing one inbox.
 */
export async function POST(req: NextRequest) {
  return handle(async () => {
    // Presentation hides the button; this is what actually closes the door.
    // A method switched off in the environment must not still be reachable by
    // anyone who kept the URL or read the bundle.
    if (!authMethodEnabled("email")) {
      return serviceUnavailable("Email sign-in is not available right now.");
    }

    const body = (await req.json().catch(() => ({}))) as { email?: unknown; next?: unknown };
    const email = typeof body.email === "string" ? body.email : "";
    // Validated here as well as on the way back in — this is about to be baked
    // into a URL we email out, so it must never leave as an off-site link.
    const next = safeNextPath(typeof body.next === "string" ? body.next : null, "/account");

    const ipHit = await rateLimit("l9:email:req:ip:" + clientIp(req), 5, 60_000);
    if (!ipHit.ok) return tooManyRequests(ipHit.retryAfterSec);
    const addrHit = await rateLimit("l9:email:req:addr:" + normalizeEmail(email), 5, 3_600_000);
    if (!addrHit.ok) return tooManyRequests(addrHit.retryAfterSec);

    try {
      // `devLink` comes back only in mock mode, so the flow is testable before
      // real mail is configured.
      const { mock, devLink } = await requestMagicLink("lumi9", email, next);
      return ok({ ok: true, mock, ...(devLink ? { devLink } : {}) });
    } catch (err) {
      if (err instanceof InvalidEmailError) return badRequest(err.message);
      if (err instanceof ProviderConfigurationError) {
        return serviceUnavailable("Email sign-in is temporarily unavailable.");
      }
      throw err;
    }
  });
}
