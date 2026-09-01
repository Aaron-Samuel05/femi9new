import { NextResponse, type NextRequest } from "next/server";
import { refCookieName, logClick } from "@femi9/core/services/affiliate";
import { SITE_URL } from "@/lib/seo";

/**
 * GET /a/[code] - Lumi9 creator (affiliate) referral link entry point.
 *
 * `placeOrder` has always read the referral cookie and called `attributeOrder`
 * for whichever brand it was placing for, so the ATTRIBUTION half of the Lumi9
 * programme has worked since the shared checkout existed. Nothing on this
 * storefront ever wrote the cookie, though, so it could never fire: a Lumi9
 * creator's clicks, orders and earnings were permanently zero.
 *
 * ── Lumi9's creators are not Femi9's ────────────────────────────────────────
 * Every call here passes `"lumi9"`, so `logClick` resolves the code against the
 * `lumi9` schema and no other. A Femi9 creator's code is simply not a row this
 * query can see, and the cookie it drops is `lumi9_ref` - a different name from
 * Femi9's `femi9_ref`, which matters because the two storefronts share a
 * hostname in development and in the E2E suites even though production splits
 * them across domains. One shared cookie name would let a Femi9 referral follow
 * a shopper into a Lumi9 checkout; the per-brand schema would then refuse to
 * resolve it, but relying on a lookup to miss is not the same as not asking.
 *
 * An unknown, pending or suspended code still redirects home - a stale link must
 * be harmless, never an error page - and `logClick` no-ops for it, so a guessed
 * code cannot manufacture tracking noise.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 30 days, in seconds - the window the creator terms describe. */
const REF_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

export async function GET(req: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  // `req.url` is `http://0.0.0.0:3001/...` behind the ALB, because the
  // standalone server binds HOSTNAME=0.0.0.0 - redirecting to it sends the
  // visitor to an unroutable address. `SITE_URL` is this app's configured
  // origin and is the same value every canonical link is built from.
  const home = new URL("/", SITE_URL || req.url);
  const { code: raw } = await ctx.params;
  const code = (raw ?? "").trim().toUpperCase();

  // Length guard before touching the database: the code column is short, and an
  // arbitrarily long path segment should not become a query.
  if (!code || code.length > 40) return NextResponse.redirect(home);

  // Awaited, but never allowed to cost the visitor her redirect - she followed
  // this link to reach the shop, not to be told the tracking failed.
  await logClick("lumi9", code).catch(() => {});

  const res = NextResponse.redirect(home);
  res.cookies.set(refCookieName("lumi9"), code, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: REF_COOKIE_MAX_AGE,
    path: "/",
  });
  return res;
}
