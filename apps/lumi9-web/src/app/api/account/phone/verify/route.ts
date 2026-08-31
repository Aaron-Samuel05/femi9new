import type { NextRequest } from "next/server";
import { badRequest, conflict, handle, notFound, ok, unauthorized } from "@femi9/core/api";
import { requireUser } from "@femi9/core/auth";
import { rateLimit, clientIp, tooManyRequests } from "@femi9/core/rate-limit";
import {
  attachIdentity,
  IdentityConflictError,
  InvalidOtpError,
  InvalidPhoneError,
  normalizePhone,
  verifyPhoneChallenge,
} from "@femi9/core/services/auth";
import { missingProfileFields } from "@femi9/core/services/account";
import { dbFor } from "@femi9/db";
import { identityConflictMessage } from "@/lib/identity-copy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/account/phone/verify - { phone, code } → attach the number to the
 * SIGNED-IN account and stamp `phoneVerified`.
 *
 * `verifyPhoneChallenge` deliberately does not upsert a User the way sign-in
 * does. Keying on the phone here would mint a SECOND row and split the
 * shopper's identity in two - which is exactly what leaves an email-signup
 * customer's orders invisible from her own account page. The challenge is
 * verified; the attachment is a separate, explicit write against the session's
 * user id.
 */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const session = await requireUser("lumi9");
    if (!session) return unauthorized();

    const body = (await req.json().catch(() => ({}))) as { phone?: unknown; code?: unknown };
    const phone = typeof body.phone === "string" ? body.phone : "";
    const code = typeof body.code === "string" ? body.code : "";

    const ipHit = await rateLimit("l9:otp:verify:ip:" + clientIp(req), 10, 60_000);
    if (!ipHit.ok) return tooManyRequests(ipHit.retryAfterSec);
    const phHit = await rateLimit("l9:otp:verify:ph:" + normalizePhone(phone), 10, 60_000);
    if (!phHit.ok) return tooManyRequests(phHit.retryAfterSec);

    const db = dbFor("lumi9");

    try {
      const normalized = await verifyPhoneChallenge("lumi9", phone, code);
      await attachIdentity(db, session.sub, { phone: normalized, phoneVerified: new Date() });

      const fresh = await db.user.findUnique({
        where: { id: session.sub },
        select: { name: true, email: true, phone: true },
      });
      if (!fresh) return notFound("User not found");
      const missing = missingProfileFields(fresh);

      return ok({ ok: true, profileComplete: missing.length === 0, missing, phone: normalized });
    } catch (err) {
      if (err instanceof IdentityConflictError) {
        return conflict(identityConflictMessage(err.field), {
          code: "identity_conflict",
          field: err.field,
        });
      }
      if (err instanceof InvalidOtpError || err instanceof InvalidPhoneError) {
        return badRequest(err.message);
      }
      throw err;
    }
  });
}
