import { ok, handle } from "@femi9/core/api";
import { brandReadiness } from "@femi9/core/brand-readiness";
import { availableAuthMethods, noAuthMethodConfigured } from "@/lib/auth-methods";
import { noindexReason, warnIfNotIndexable } from "@/lib/seo";

/**
 * The ALB target group's health check.
 *
 * Fails CLOSED: a task that cannot reach Lumi9's schema, or cannot sign a
 * session, answers 503 and the load balancer takes it out. That is what keeps a
 * broken deployment from replacing working tasks - ECS waits for the new ones
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

    // A WARNING, never blocking. Serving noindex is wrong, but a task that is
    // otherwise healthy must keep taking traffic - failing the probe over an
    // SEO setting would turn a mis-set variable into an outage. It is reported
    // here because it is otherwise completely silent: the site works, and only
    // crawlers can tell that anything is wrong.
    warnIfNotIndexable();
    const noindex = noindexReason();

    /*
     * Which sign-in methods this task can actually honour, and a warning when
     * the answer is "none".
     *
     * A WARNING rather than blocking, for the same reason as the SEO one: a
     * task with no auth provider still serves the catalogue perfectly, and
     * failing the probe would turn a missing API key into an outage of the
     * whole storefront. But it is worth reporting loudly, because checkout is
     * gated behind sign-in here - so no working method means nobody can buy,
     * on a site that otherwise looks completely healthy.
     */
    const authMethods = availableAuthMethods();
    const noAuth = noAuthMethodConfigured();

    return ok(
      {
        status: ready ? "ok" : "degraded",
        brand: "lumi9",
        db,
        configuration: blocking.length === 0,
        authMethods,
        ...(blocking.length ? { missingOrInvalid: blocking } : {}),
        ...(warnings.length || noindex || noAuth
          ? {
              warnings: [
                ...warnings,
                ...(noindex ? [`NOT_INDEXABLE: ${noindex}`] : []),
                ...(noAuth
                  ? [
                      "NO_AUTH_PROVIDER: no sign-in method is configured or enabled - " +
                        "checkout is gated, so nobody can complete an order",
                    ]
                  : []),
              ],
            }
          : {}),
        // Computed per request - a module-level value would freeze at build.
        time: new Date().toISOString(),
      },
      { status: ready ? 200 : 503 },
    );
  });
}
