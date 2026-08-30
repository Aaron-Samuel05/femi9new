import type { NextRequest } from "next/server";
import { handle, ok } from "@femi9/core/api";
import { getSession } from "@femi9/core/auth";
import { quoteCart } from "@femi9/core/services/checkout";
import { clientIp, rateLimit, tooManyRequests } from "@femi9/core/rate-limit";
import { getGuestToken } from "@/lib/session";

/**
 * GET /api/checkout/quote — what this basket will actually cost.
 *
 * The checkout summary used to compute its own totals from constants in
 * `src/lib/catalog.ts`: a hardcoded ₹999 free-shipping threshold, a ₹49
 * standard fee, and a ₹79 "Express delivery" the backend had never heard of.
 * The server recomputes everything at placement from `Settings` and the
 * catalogue, so the number beside "Total" and the number Razorpay charged were
 * two independent calculations that happened to agree — until the console moved
 * the threshold, or the shopper picked express.
 *
 * `?coupon=` also makes the cart's promo box real. That box used to answer
 * every code with "isn't a valid code right now" from a hardcoded string, while
 * the console could mint coupons nobody could ever redeem.
 *
 * Read-only: nothing here creates an order, decrements stock, or spends a
 * coupon use. Placement re-checks and claims atomically.
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
    // Trimmed and length-capped before it reaches a `where` clause; the coupon
    // column is short and a megabyte of query string is not a lookup.
    const coupon = req.nextUrl.searchParams.get("coupon")?.trim().slice(0, 40) || undefined;

    return ok(await quoteCart("lumi9", token, { couponCode: coupon, userId: session?.sub }));
  });
}
