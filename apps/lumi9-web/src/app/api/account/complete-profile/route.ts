import type { NextRequest } from "next/server";
import { z } from "zod";
import {
  badRequest,
  conflict,
  handle,
  notFound,
  ok,
  serviceUnavailable,
  unauthorized,
} from "@femi9/core/api";
import { requireUser } from "@femi9/core/auth";
import { rateLimit, tooManyRequests } from "@femi9/core/rate-limit";
import { ProviderConfigurationError } from "@femi9/core/runtime-mode";
import {
  assertIdentityFree,
  attachIdentity,
  dispatchEmailVerification,
  IdentityConflictError,
  InvalidPhoneError,
  requestOtp,
} from "@femi9/core/services/auth";
import { missingProfileFields } from "@femi9/core/services/account";
import { dbFor } from "@femi9/db";
import { identityConflictMessage } from "@/lib/identity-copy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/account/complete-profile — the onboarding step behind /welcome.
 *
 * Every sign-in path mints a session BEFORE it knows who the shopper is: phone
 * OTP writes a number and nothing else, the magic link writes an address and
 * nothing else, Google writes a name and an address but never a number. This is
 * where those gaps close.
 *
 * Every field is optional in the SCHEMA and required by the DATA. /welcome is
 * driven by `missing` from /api/auth/me, and the email path has to save step A
 * (the name) before the step B phone challenge resolves. Whatever arrives is
 * persisted immediately, which is what makes an abandoned onboarding resumable
 * rather than a restart.
 */
const CompleteProfileSchema = z.object({
  name: z.string().trim().min(2, "Enter your full name").max(120).optional(),
  email: z.string().trim().toLowerCase().email("Enter a valid email address").optional(),
  // Same canonicalisation `normalizePhone` applies, so the value this schema
  // yields is byte-identical to the one `attachIdentity` looks rows up by.
  phone: z
    .string()
    .trim()
    .transform((value) => {
      const digits = value.replace(/\D/g, "");
      return digits.length > 10 ? digits.slice(-10) : digits;
    })
    .refine((value) => value.length === 10, "Enter a valid 10-digit mobile number")
    .optional(),
});

export async function POST(req: NextRequest) {
  return handle(async () => {
    const session = await requireUser("lumi9");
    if (!session) return unauthorized();

    // Keyed per USER, not per IP: this is an authenticated endpoint and the only
    // abuse worth blunting is one account driving repeated OTP sends through it.
    const hit = await rateLimit(`l9:profile:complete:${session.sub}`, 10, 10 * 60_000);
    if (!hit.ok) return tooManyRequests(hit.retryAfterSec);

    const parsed = CompleteProfileSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return badRequest("Check the details you entered.", parsed.error.flatten());

    const db = dbFor("lumi9");
    const current = await db.user.findUnique({ where: { id: session.sub } });
    if (!current) return notFound("User not found");

    const { name, email, phone } = parsed.data;

    try {
      // 1. Name — no uniqueness and no verification concern, so written directly.
      if (name && name !== current.name) {
        await db.user.update({ where: { id: session.sub }, data: { name } });
      }

      // 2. Email — written UNVERIFIED with a confirmation link dispatched behind
      //    it. Safe because checkout adopts the session user, so an address is
      //    not an identity key for attaching an order, and a collision is a
      //    clean 409 rather than a P2002 500.
      if (email && !current.email) {
        await attachIdentity(db, session.sub, { email, emailVerified: null });
        dispatchEmailVerification("lumi9", session.sub, email);
      }

      // 3. Phone — NOT written here. An unverified number on User is worse than
      //    none: it is what a parcel and every delivery SMS go to. This only
      //    STARTS the challenge, and ownership is checked first so we never
      //    spend an SMS on a number we are about to refuse.
      let phoneVerificationRequired = false;
      let otp: { mock: boolean; devCode?: string } | null = null;
      if (phone && !current.phone) {
        await assertIdentityFree("lumi9", session.sub, "phone", phone);
        otp = await requestOtp("lumi9", phone);
        phoneVerificationRequired = true;
      }

      const fresh = await db.user.findUnique({
        where: { id: session.sub },
        select: { name: true, email: true, phone: true },
      });
      if (!fresh) return notFound("User not found");
      const missing = missingProfileFields(fresh);

      return ok({
        ok: true,
        profileComplete: missing.length === 0,
        missing,
        phoneVerificationRequired,
        ...(otp ? { mock: otp.mock, ...(otp.devCode ? { devCode: otp.devCode } : {}) } : {}),
      });
    } catch (err) {
      if (err instanceof IdentityConflictError) {
        return conflict(identityConflictMessage(err.field), {
          code: "identity_conflict",
          field: err.field,
        });
      }
      if (err instanceof InvalidPhoneError) {
        return badRequest(err.message, { fieldErrors: { phone: [err.message] } });
      }
      if (err instanceof ProviderConfigurationError) {
        return serviceUnavailable("SMS verification is temporarily unavailable.");
      }
      throw err;
    }
  });
}
