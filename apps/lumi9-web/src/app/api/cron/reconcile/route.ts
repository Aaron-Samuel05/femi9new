import { handle, ok, unauthorized } from "@femi9/core/api";
import { cronSecretOk } from "@femi9/core/cron-auth";
import { reconcilePendingOrders } from "@femi9/core/services/checkout";

/**
 * POST /api/cron/reconcile - settle Lumi9 orders left `pending`.
 *
 * An order goes pending the moment the gateway intent is opened, and reaches
 * `paid` through one of two paths: the browser's verify call, or the Razorpay
 * webhook. Both can be missed - she closes the tab in the wrong second AND the
 * webhook delivery fails, or the webhook secret is wrong. This asks Razorpay
 * what actually happened to every intent older than an hour, marks the captured
 * ones paid and releases the stock the abandoned ones are holding.
 *
 * Femi9 has had this since it shipped. Lumi9 takes real payments and had no
 * equivalent, so a missed webhook meant money taken, an order stuck on
 * "pending" forever, and its stock reserved against a sale nobody would fulfil.
 *
 * Secret-only, like the renewal route beside it - see cron-auth.ts.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return handle(async () => {
    if (!cronSecretOk(req)) return unauthorized();
    return ok(await reconcilePendingOrders("lumi9"));
  });
}
