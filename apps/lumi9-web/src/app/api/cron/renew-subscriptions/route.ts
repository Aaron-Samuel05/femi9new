import { handle, ok, unauthorized } from "@femi9/core/api";
import { cronSecretOk } from "@femi9/core/cron-auth";
import { generateDueOrders } from "@femi9/core/services/subscriptions";

/**
 * POST /api/cron/renew-subscriptions - create a renewal order for every Lumi9
 * subscription whose `nextDeliveryAt` has passed. Returns { generated: n }.
 *
 * Called on a schedule by EventBridge Scheduler, which presents `CRON_SECRET`
 * in `x-cron-secret`. Without this running, a subscription is a row that never
 * ships anything again after the first box - which is why the storefront's
 * "Start subscription" button and this route landed in the same change. A
 * recurring promise with no scheduler behind it is a worse defect than a button
 * that does nothing, because the shopper has no way to tell.
 *
 * Unlike Femi9's equivalent there is NO signed-in-admin fallback. That fallback
 * exists over there because `requireAdmin()` reads the legacy `femi9_admin`
 * cookie the old in-storefront console issued; this app has no admin surface,
 * has never issued that cookie, and the console it would belong to is a
 * separate service. The secret is the only key, and it fails closed without one.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return handle(async () => {
    if (!cronSecretOk(req)) return unauthorized();
    return ok({ generated: await generateDueOrders("lumi9") });
  });
}
