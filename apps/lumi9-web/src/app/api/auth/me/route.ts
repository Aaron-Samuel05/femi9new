import { handle, ok } from "@femi9/core/api";
import { getSession } from "@femi9/core/auth";
import { missingProfileFields } from "@femi9/core/services/account";
import { dbFor } from "@femi9/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/auth/me — the signed-in shopper, or `{ user: null }`.
 *
 * Always 200, so the client can branch on `user` rather than treating "signed
 * out" as an error. Re-reads the row by the session's subject instead of
 * trusting the JWT's claims, which are a convenience copy and can be stale —
 * a name changed on /account would otherwise keep greeting her by the old one
 * until the 30-day token expired.
 *
 * `missing` rides along from the ONE shared definition of completeness, so
 * /welcome renders exactly the fields the /account gate is holding her on.
 */
export async function GET() {
  return handle(async () => {
    const session = await getSession("lumi9");
    if (!session) return ok({ user: null, profileComplete: false, missing: [] });

    const user = await dbFor("lumi9").user.findUnique({
      where: { id: session.sub },
      select: { id: true, name: true, email: true, phone: true, emailVerified: true, phoneVerified: true },
    });

    // A session whose user has since been deleted reads as signed out.
    if (!user) return ok({ user: null, profileComplete: false, missing: [] });

    const missing = missingProfileFields(user);
    return ok({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        emailVerified: user.emailVerified !== null,
        phoneVerified: user.phoneVerified !== null,
      },
      profileComplete: missing.length === 0,
      missing,
    });
  });
}
