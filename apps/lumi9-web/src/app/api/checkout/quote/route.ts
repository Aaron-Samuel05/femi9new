import type { NextRequest } from "next/server";
import { handle, ok } from "@femi9/core/api";
import { getSession } from "@femi9/core/auth";
import {
  quoteCart,
  couponCookieName,
  COUPON_COOKIE_MAX_AGE,
} from "@femi9/core/services/checkout";
import { clientIp, rateLimit, tooManyRequests } from "@femi9/core/rate-limit";
import { getGuestToken } from "@/lib/session";

/**
 * GET /api/checkout/quote - what this basket will actually cost.
 *
 * The checkout summary used to compute its own totals from constants in
 * `src/lib/catalog.ts`: a hardcoded ₹999 free-shipping threshold, a ₹49
 * standard fee, and a ₹79 "Express delivery" the backend had never heard of.
 * The server recomputes everything at placement from `Settings` and the
 * catalogue, so the number beside "Total" and the number Razorpay charged were
 * two independent calculations that happened to agree - until the console moved
 * the threshold, or the shopper picked express.
 *
 * `?coupon=` also makes the cart's promo box real. That box used to answer
 * every code with "isn't a valid code right now" from a hardcoded string, while
 * the console could mint coupons nobody could ever redeem.
 *
 * ── The three states of `?coupon=` ──────────────────────────────────────────
 * The parameter is deliberately read as three values, not two:
 *
 *   ABSENT  (`null`) → "I have not said" - fall back to the cookie.
 *   EMPTY   (`""`)   → "remove it" - drop the coupon AND clear the cookie.
 *   A VALUE          → try this code, and remember it if it works.
 *
 * Collapsing empty into absent is what makes the Remove button impossible to
 * write: the request to clear the coupon looks exactly like the request that
 * restores it from the cookie, so the code comes straight back.
 *
 * The cookie is written only when the server actually applied the code, so an
 * expired or mistyped one never persists - and it stores the CODE, never a
 * price. Every quote re-asks what that code is worth against this basket and
 * this shopper, so a coupon that has since been spent or deactivated comes back
 * refused rather than shown as money the shopper will not get.
 *
 * Read-only as far as the DATABASE is concerned: nothing here creates an order,
 * decrements stock, or spends a coupon use. Placement re-checks and claims
 * atomically.
 */

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // A coupon lookup is a code oracle: without a limit, this endpoint would let
  // anyone enumerate the coupon table a guess at a time. The response is
  // deliberately identical for every reason a code fails, and this caps how
  // fast the guesses can come.
  const rl = await rateLimit("l9:quote:" + clientIp(req), 40, 60_000);
  if (!rl.ok) return tooManyRequests(rl.retryAfterSec);

  return handle(async () => {
    const token = await getGuestToken();
    const session = await getSession("lumi9");
    const cookieName = couponCookieName("lumi9");

    // `null` when the caller said nothing; `""` when they asked to remove it.
    const asked = req.nextUrl.searchParams.get("coupon");
    const remembered = req.cookies.get(cookieName)?.value ?? null;

    // Trimmed and length-capped before it reaches a `where` clause; the coupon
    // column is short and a megabyte of query string is not a lookup.
    const requested = asked === null ? remembered : asked;
    const coupon = requested?.trim().slice(0, 40) || undefined;

    const quote = await quoteCart("lumi9", token, {
      couponCode: coupon,
      userId: session?.sub,
    });

    const res = ok(quote);

    if (asked === "") {
      // Explicit removal.
      res.cookies.delete(cookieName);
    } else if (quote.couponCode) {
      // Only a code the server actually applied is worth remembering. Not
      // httpOnly: a promo code is a marketing string the shopper typed and can
      // read off her own screen, so hiding it from her scripts buys nothing -
      // and it is re-validated server-side on every quote and again at
      // placement, so a forged value can only ever be refused.
      res.cookies.set(cookieName, quote.couponCode, {
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: COUPON_COOKIE_MAX_AGE,
        path: "/",
      });
    } else if (remembered && asked === null) {
      // The remembered code has stopped working - expired, spent, or switched
      // off in the console. Drop it rather than re-asking about it forever.
      res.cookies.delete(cookieName);
    }

    return res;
  });
}
