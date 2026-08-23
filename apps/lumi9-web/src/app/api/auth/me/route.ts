import { handle, ok } from "@femi9/core/api";
import { getSession } from "@femi9/core/auth";
import { dbFor } from "@femi9/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/auth/me — the signed-in shopper, or `{ user: null }`.
 *
 * Always 200, so the client can branch on `user` rather than treating "signed
 * out" as an error. Re-reads the row by the session's subject instead of
 * trusting the JWT's claims, which are a convenience copy and can be stale.
 */
export async function GET() {
  return handle(async () => {
    const session = await getSession("lumi9");
    if (!session) return ok({ user: null });

    const user = await dbFor("lumi9").user.findUnique({
      where: { id: session.sub },
      select: { id: true, name: true, email: true, phone: true },
    });

    // A session whose user has since been deleted reads as signed out.
    return ok({ user: user ?? null });
  });
}
