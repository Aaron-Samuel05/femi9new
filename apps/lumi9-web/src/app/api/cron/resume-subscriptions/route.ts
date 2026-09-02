import { handle, ok, unauthorized } from "@femi9/core/api";
import { cronSecretOk } from "@femi9/core/cron-auth";
import { resumeDueSkips } from "@femi9/core/services/subscriptions";

/**
 * POST /api/cron/resume-subscriptions - un-pause every box plan whose SKIPPED
 * cycle has now passed. Returns { resumed: n }.
 *
 * This exists because Razorpay's Subscriptions API has no skip-one-cycle
 * primitive. "Skip next box" pauses the mandate and stamps `resumeAt` one
 * cadence out; without this job running, that pause is permanent and a parent
 * who skips a single delivery silently never receives another - the same class
 * of quiet, expensive failure as an unscheduled `renew-subscriptions`.
 *
 * Only rows that are BOTH paused AND carry a `resumeAt` are touched, so a parent
 * who paused indefinitely is never woken up.
 *
 * As with the other Lumi9 cron routes there is NO signed-in-admin fallback: this
 * app has no admin surface and has never issued the console's cookie. The secret
 * is the only key, and it fails closed without one.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return handle(async () => {
    if (!cronSecretOk(req)) return unauthorized();
    return ok({ resumed: await resumeDueSkips("lumi9") });
  });
}
