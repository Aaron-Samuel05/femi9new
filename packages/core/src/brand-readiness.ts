import 'server-only'
import { dbFor, type Brand } from '@femi9/db'
import { mailConfigured } from './mail-identity'
import { paymentsConfigured, webhookConfiguredFor } from './payment-identity'

/**
 * Is this brand configured well enough to serve traffic?
 *
 * ── Why this exists next to production-readiness.ts ─────────────────────────
 * That module audits a fixed list of bare env names — DATABASE_URL, MSG91_*,
 * RESEND_API_KEY. It is Femi9's audit, and it is correct for Femi9. It cannot
 * answer the question for a second brand, because a brand's settings may be
 * per-brand (`RESEND_API_KEY_LUMI9`) or inherited from the shared fallback, and
 * a bare-name check sees neither distinction. Asking `mailConfigured('lumi9')`
 * asks the same resolver the running code asks, so the probe and the app can
 * never disagree about whether mail is set up.
 *
 * ── What blocks, and what only warns ───────────────────────────────────────
 * Blocking means the ALB pulls the task out of service and an ECS deployment
 * stalls. That is the right outcome for a brand that cannot reach its database
 * or cannot sign a session — every request would fail anyway, and failing the
 * health check keeps the old, working tasks serving. It is the wrong outcome
 * for a missing webhook secret: the storefront still browses, still adds to
 * cart, still signs people in. Taking it out of the load balancer would convert
 * a degraded feature into an outage.
 */

export interface BrandReadiness {
  /** Reachability of this brand's schema. */
  db: boolean
  /** Absent settings that make the task unsafe to serve. */
  blocking: string[]
  /** Absent settings that switch a feature off but leave the site usable. */
  warnings: string[]
}

/** Only audit configuration in production — a dev box is expected to be sparse. */
function inProduction(): boolean {
  return process.env.NODE_ENV === 'production'
}

export async function brandReadiness(brand: Brand): Promise<BrandReadiness> {
  const upper = brand.toUpperCase()

  // A trivially cheap query that still proves the schema is reachable AND
  // migrated: `product` exists only after migrations have run, so a fresh
  // database that was created but never migrated reports unhealthy rather
  // than quietly serving an empty catalogue.
  let db = false
  try {
    await dbFor(brand).product.count()
    db = true
  } catch (err) {
    console.error(`[health] ${brand} db check failed`, err)
  }

  const blocking: string[] = []
  const warnings: string[] = []

  if (inProduction()) {
    // Sessions are signed with this; without it nobody can stay signed in and
    // every cookie the task issues is unverifiable.
    if (!process.env.AUTH_SECRET?.trim()) blocking.push('AUTH_SECRET')

    // Checkout is the point of the site. A brand that cannot create a charge
    // should not be taking traffic.
    if (!paymentsConfigured(brand)) blocking.push(`RAZORPAY_KEY_ID_${upper} / RAZORPAY_KEY_SECRET_${upper}`)

    // Degraded, not broken: an unverifiable webhook means orders are marked
    // paid by the browser callback alone, which still works.
    if (!webhookConfiguredFor(brand)) warnings.push(`RAZORPAY_WEBHOOK_SECRET_${upper}`)

    // Sign-in is by emailed link, so no mail means no new sessions — but
    // browsing, and every already-signed-in shopper, is unaffected.
    if (!mailConfigured(brand)) warnings.push(`RESEND_API_KEY_${upper} / EMAIL_FROM_${upper}`)
  }

  return { db, blocking, warnings }
}
