import { ok, handle } from "@femi9/core/api";
import { brandReadiness } from "@femi9/core/brand-readiness";

/**
 * The ALB target group's health check.
 *
 * Fails CLOSED: a task that cannot reach Lumi9's schema, or cannot sign a
 * session, answers 503 and the load balancer takes it out. That is what keeps a
 * broken deployment from replacing working tasks — ECS waits for the new ones
 * to go healthy, they never do, and the rollout stalls with the old revision
 * still serving.
 *
 * Warnings are reported but do not fail the probe. See brand-readiness.ts for
 * where that line is drawn and why.
 */

// Live state, so never cached or prerendered.
export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    const { db, blocking, warnings } = await brandReadiness("lumi9");
    const ready = db && blocking.length === 0;

    return ok(
      {
        status: ready ? "ok" : "degraded",
        brand: "lumi9",
        db,
        configuration: blocking.length === 0,
        ...(blocking.length ? { missingOrInvalid: blocking } : {}),
        ...(warnings.length ? { warnings } : {}),
        // Computed per request — a module-level value would freeze at build.
        time: new Date().toISOString(),
      },
      { status: ready ? 200 : 503 },
    );
  });
}
