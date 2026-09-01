import { handle, notFound, ok, unauthorized } from "@femi9/core/api";
import { requireUser } from "@femi9/core/auth";
import { getForUser } from "@femi9/core/services/affiliate";

/**
 * GET /api/affiliate/me - the signed-in Lumi9 creator's own metrics.
 *
 * Owner-scoped on purpose: a promo code is a shareable marketing string, not a
 * credential, so it must never be the thing that unlocks somebody's earnings.
 * The session decides whose numbers these are.
 *
 * `requireUser("lumi9")` reads the `lumi9_session` cookie and verifies it
 * against the `lumi9-customer` audience, and `getForUser("lumi9", …)` looks the
 * affiliate up in the `lumi9` schema. A shopper signed into Femi9 has no
 * session here and no row here; the two programmes never resolve each other.
 *
 * 404 rather than an empty payload for a shopper who has no approved account -
 * including one whose application is still pending, because `getForUser`
 * refuses to hand back a placeholder code that cannot be shared yet.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    const user = await requireUser("lumi9");
    if (!user) return unauthorized();

    const stats = await getForUser("lumi9", user.sub);
    if (!stats) return notFound("No approved creator account was found.");

    return ok(stats);
  });
}
