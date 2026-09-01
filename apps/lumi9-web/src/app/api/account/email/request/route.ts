import type { NextRequest } from "next/server";
import { badRequest, conflict, handle, ok, serviceUnavailable, unauthorized } from "@femi9/core/api";
import { requireUser } from "@femi9/core/auth";
import { clientIp, rateLimit, tooManyRequests } from "@femi9/core/rate-limit";
import { ProviderConfigurationError } from "@femi9/core/runtime-mode";
import {
  assertIdentityFree,
  IdentityConflictError,
  InvalidEmailError,
  normalizeEmail,
  requestAttachEmailLink,
} from "@femi9/core/services/auth";
import { identityConflictMessage } from "@/lib/identity-copy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/account/email/request — { email } → send the confirmation link that
 * turns an unverified address into a verified one, or attaches a first address
 * to an account created by phone OTP.
 *
 * The other half of `../verify`. Both were missing here while
 * `requestAttachEmailLink` was already being called from
 * `/api/account/complete-profile`, so Lumi9 could START this flow and had
 * nowhere for a shopper to finish it and no way for her to ask for a new link
 * when one expired.
 *
 * The link is minted under the `attach-email:<userId>:<email>` namespace, so
 * the SIGN-IN verifier can never redeem it to mint a session for a different
 * account.
 *
 * Rate limited on both axes like every other mail-sending route here — IP
 * bounds a script, address bounds what one person can be sent from anywhere.
 * `l9:` keys this brand's buckets apart from Femi9's, which share the process.
 */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const session = await requireUser("lumi9");
    if (!session) return unauthorized();

    const body = (await req.json().catch(() => ({}))) as { email?: unknown };
    const email = typeof body.email === "string" ? body.email : "";

    const ipHit = await rateLimit("l9:email:req:ip:" + clientIp(req), 5, 60_000);
    if (!ipHit.ok) return tooManyRequests(ipHit.retryAfterSec);
    const addrHit = await rateLimit("l9:email:req:addr:" + normalizeEmail(email), 5, 3_600_000);
    if (!addrHit.ok) return tooManyRequests(addrHit.retryAfterSec);

    try {
      // Refuse an address that belongs to another account BEFORE sending
      // anything — otherwise this route mails a confirmation for a claim it is
      // going to reject, and tells the sender that the address is taken.
      await assertIdentityFree("lumi9", session.sub, "email", email);
      const { mock, devLink } = await requestAttachEmailLink("lumi9", session.sub, email);
      return ok({ ok: true, mock, ...(devLink ? { devLink } : {}) });
    } catch (err) {
      if (err instanceof IdentityConflictError) {
        // Never `err.message` — that sentence names Femi9. See lib/identity-copy.
        return conflict(identityConflictMessage(err.field), {
          code: "identity_conflict",
          field: err.field,
        });
      }
      if (err instanceof InvalidEmailError) return badRequest(err.message);
      if (err instanceof ProviderConfigurationError) {
        return serviceUnavailable("Email verification is temporarily unavailable.");
      }
      throw err;
    }
  });
}
