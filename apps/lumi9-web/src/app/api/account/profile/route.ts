import { z } from "zod";
import { badRequest, conflict, handle, notFound, ok, unauthorized } from "@femi9/core/api";
import { requireUser } from "@femi9/core/auth";
import { updateProfile } from "@femi9/core/services/account";
import { IdentityConflictError } from "@femi9/core/services/auth";
import { identityConflictMessage } from "@/lib/identity-copy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PATCH /api/account/profile - edit name, email or mobile.
 *
 * The account page had no profile surface at all: three read-only tabs and a
 * sign-out. A shopper who signed in with a magic link could not add a phone
 * number, and one who signed in with an OTP could not add an email - so
 * checkout asked for the missing half on every single order and nothing was
 * ever kept.
 *
 * All three keys are optional individually, but sending none of them is a
 * request the client should not be making, so an empty patch is a 400 rather
 * than a silent no-op.
 */
const ProfileSchema = z
  .object({
    name: z.string().trim().min(2, "Enter your full name").max(120).optional(),
    email: z.string().trim().toLowerCase().email("Enter a valid email address").optional(),
    /*
     * Canonicalised exactly as `normalizePhone` does - strip non-digits, keep
     * the last 10 - so a pasted "+91 98842 30571" compares equal to the stored
     * value instead of reading as a change and being bounced into the OTP
     * challenge the shopper has no reason to expect.
     */
    phone: z
      .string()
      .trim()
      .transform((value) => {
        const digits = value.replace(/\D/g, "");
        return digits.length > 10 ? digits.slice(-10) : digits;
      })
      .refine((value) => value.length === 10, "Enter a valid 10-digit mobile number")
      .optional(),
  })
  .refine((v) => v.name !== undefined || v.email !== undefined || v.phone !== undefined, {
    message: "Nothing to update.",
  });

export async function PATCH(req: Request) {
  return handle(async () => {
    // Guarded twice, deliberately: `proxy.ts` is a routing rule, not an
    // authorisation, and this handler writes somebody's identity.
    const session = await requireUser("lumi9");
    if (!session) return unauthorized();

    const parsed = ProfileSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return badRequest("Check the details you entered.", parsed.error.flatten());

    try {
      const result = await updateProfile("lumi9", session.sub, parsed.data);
      if (result.status === "not-found") return notFound("User not found");
      if (result.status === "phone-requires-verification") {
        // A contact channel that reaches a customer's orders is never settable
        // by an unverified PATCH. `next` tells the form where to continue.
        return badRequest("Verify your mobile number to change it.", undefined, {
          code: "phone_requires_verification",
          field: "phone",
          next: "/api/account/phone/request",
        });
      }

      const { user } = result;
      return ok({
        ok: true,
        profileComplete: user.profileComplete,
        missing: user.missing,
        user: {
          name: user.name,
          email: user.email,
          emailVerified: user.emailVerified,
          phone: user.phone,
          phoneVerified: user.phoneVerified,
        },
      });
    } catch (err) {
      if (err instanceof IdentityConflictError) {
        // Never `err.message`: the shared class builds its sentence eagerly and
        // that sentence names the other brand.
        return conflict(identityConflictMessage(err.field), {
          code: "identity_conflict",
          field: err.field,
        });
      }
      throw err;
    }
  });
}
