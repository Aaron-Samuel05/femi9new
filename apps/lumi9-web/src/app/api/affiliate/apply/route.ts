import type { NextRequest } from "next/server";
import { z } from "zod";
import { badRequest, created, handle } from "@femi9/core/api";
import { clientIp, rateLimit, tooManyRequests } from "@femi9/core/rate-limit";
import { apply } from "@femi9/core/services/affiliate";

/**
 * POST /api/affiliate/apply - a creator applies to the Lumi9 programme.
 *
 * The application lands in the `lumi9` schema and is reviewed in the console's
 * Lumi9 affiliates page. Applying here does NOT make somebody a Femi9 creator,
 * and a Femi9 creator is not one here: the two programmes are separate rows in
 * separate schemas, reached by passing the brand to a service that resolves its
 * own client from it.
 *
 * The response is deliberately contentless beyond `{ ok: true }` - no code is
 * issued at apply time. An admin approves the application and allocates a real,
 * shareable code then; until that happens the row carries a non-user-facing
 * placeholder, and `/api/affiliate/me` refuses to return it.
 */

export const runtime = "nodejs";

// Empty optional text fields arrive as '' from the form; normalise to undefined
// so `.optional()` accepts a box the applicant simply left blank.
const blankToUndef = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

const ApplySchema = z.object({
  name: z.string().trim().min(1, "Please enter your name").max(120),
  handle: z.string().trim().min(1, "Please add your social handle").max(60),
  platform: z.preprocess(blankToUndef, z.string().trim().max(80).optional()),
  followerBand: z.preprocess(blankToUndef, z.string().trim().max(40).optional()),
  // Lowercased at the boundary, matching `normalizeEmail` in the auth service.
  // Without it "Priya@Gmail.com" is a different `User.email` from the one every
  // sign-in path writes, so an approved creator with a live promo code could not
  // reach her own dashboard — the affiliate row hung off a user she could never
  // sign in as. `apply()` normalises too; both, because a schema is where a
  // boundary value should be made canonical and the service must not depend on
  // its only caller having done so.
  email: z.string().trim().toLowerCase().email("Enter a valid email").max(200),
});

export async function POST(req: NextRequest) {
  return handle(async () => {
    // An application writes a User and an Affiliate row and sends ops a mail.
    // Five per five minutes per IP is generous for a person and useless for a
    // script. `l9:` keys this brand's bucket apart from Femi9's.
    const rl = await rateLimit(`l9:affiliate-apply:${clientIp(req)}`, 5, 300_000);
    if (!rl.ok) return tooManyRequests(rl.retryAfterSec);

    const raw = await req.json().catch(() => null);
    const parsed = ApplySchema.safeParse(raw);
    if (!parsed.success) return badRequest("Please fix the errors below", parsed.error.flatten());

    await apply("lumi9", parsed.data);
    return created({ ok: true });
  });
}
