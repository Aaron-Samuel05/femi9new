import type { NextRequest } from "next/server";
import {
  badRequest,
  conflict,
  handle,
  ok,
  serviceUnavailable,
  unauthorized,
} from "@femi9/core/api";
import { requireUser } from "@femi9/core/auth";
import { rateLimit, clientIp, tooManyRequests } from "@femi9/core/rate-limit";
import { ProviderConfigurationError } from "@femi9/core/runtime-mode";
import {
  assertIdentityFree,
  IdentityConflictError,
  InvalidPhoneError,
  normalizePhone,
  requestOtp,
} from "@femi9/core/services/auth";
import { identityConflictMessage } from "@/lib/identity-copy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/account/phone/request — { phone } → send a code to a number the
 * SIGNED-IN shopper wants to attach to her account.
 *
 * A magic-link or Google signup has no reachable number, so her orders have
 * nowhere to be delivered and no way to be confirmed. This is the first half of
 * closing that; /api/account/phone/verify is the second.
 *
 * Same rate-limit buckets as sign-in, deliberately: the abuse being prevented is
 * messages to one handset, and which endpoint sent them does not matter.
 */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const session = await requireUser("lumi9");
    if (!session) return unauthorized();

    const body = (await req.json().catch(() => ({}))) as { phone?: unknown };
    const phone = typeof body.phone === "string" ? body.phone : "";

    const ipHit = await rateLimit("l9:otp:req:ip:" + clientIp(req), 5, 60_000);
    if (!ipHit.ok) return tooManyRequests(ipHit.retryAfterSec);
    const phHit = await rateLimit("l9:otp:req:ph:" + normalizePhone(phone), 5, 3_600_000);
    if (!phHit.ok) return tooManyRequests(phHit.retryAfterSec);

    try {
      // Refuse a number owned by another account BEFORE spending an SMS on it.
      await assertIdentityFree("lumi9", session.sub, "phone", phone);
      const { mock, devCode } = await requestOtp("lumi9", phone);
      return ok({ ok: true, mock, ...(devCode ? { devCode } : {}) });
    } catch (err) {
      if (err instanceof IdentityConflictError) {
        return conflict(identityConflictMessage(err.field), {
          code: "identity_conflict",
          field: err.field,
        });
      }
      if (err instanceof InvalidPhoneError) return badRequest(err.message);
      if (err instanceof ProviderConfigurationError) {
        return serviceUnavailable("SMS verification is temporarily unavailable.");
      }
      throw err;
    }
  });
}
