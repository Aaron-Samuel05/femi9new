import type { Brand } from '@femi9/db'

/**
 * Which Razorpay account a brand transacts through.
 *
 * ── The fallback is deliberate and temporary ────────────────────────────────
 * Each setting is read per brand first and falls back to the shared variable,
 * exactly as `dbFor` falls back to `DATABASE_URL` and the mail identity falls
 * back to the shared Resend key. That is what lets Lumi9 take payments on
 * Femi9's Razorpay account today and move to its own by setting variables, with
 * no code change.
 *
 * ── Why this must not stay shared ──────────────────────────────────────────
 * Sharing a merchant account commingles settlement, refunds and reconciliation
 * across two brands: a Lumi9 refund debits Femi9's balance, and neither
 * brand's payout statement describes only its own trade. That is an accounting
 * problem before it is a technical one.
 *
 * The WEBHOOK secret is the sharp edge. Razorpay signs a webhook with the
 * secret of the account that raised the charge, so the moment the two accounts
 * differ, a Lumi9 payment verified against Femi9's secret fails its signature
 * check and the order is never marked paid. Money taken, nothing shipped, and
 * no error anyone sees. Hence per-brand webhook endpoints.
 */

function perBrand(name: string, brand: Brand): string | undefined {
  // `usable` is applied to the PER-BRAND value here, not by the callers below,
  // and that placement is the whole point.
  //
  // It used to read `if (specific) return specific`, which looks equivalent and
  // is not: Terraform seeds each per-brand secret with a "TODO-..." placeholder,
  // and a placeholder is a non-empty string. So the specific value was returned,
  // the shared fallback was never consulted, and the caller then rejected the
  // TODO and got undefined. The placeholder SHADOWED the working shared key
  // rather than deferring to it — the exact opposite of what it is for.
  //
  // Deployed, that meant Lumi9's health check reported
  // "RAZORPAY_KEY_ID_LUMI9 / RAZORPAY_KEY_SECRET_LUMI9" missing while a
  // perfectly good shared RAZORPAY_KEY_ID sat one line below, and the task
  // never passed its ALB health check.
  const specific = process.env[`${name}_${brand.toUpperCase()}`]?.trim()
  if (usable(specific)) return specific

  const shared = process.env[name]?.trim()
  return usable(shared) ? shared : undefined
}

/** Treat Terraform's initial TODO values exactly like missing configuration. */
function usable(value: string | undefined): value is string {
  return Boolean(value && !/^TODO(?:[-_:]|\b)/i.test(value))
}

export function keyIdFor(brand: Brand): string | undefined {
  const v = perBrand('RAZORPAY_KEY_ID', brand)
  return usable(v) ? v : undefined
}

export function keySecretFor(brand: Brand): string | undefined {
  const v = perBrand('RAZORPAY_KEY_SECRET', brand)
  return usable(v) ? v : undefined
}

export function webhookSecretFor(brand: Brand): string | undefined {
  const v = perBrand('RAZORPAY_WEBHOOK_SECRET', brand)
  return usable(v) ? v : undefined
}

/**
 * The publishable key the checkout widget uses.
 *
 * NEXT_PUBLIC_* values are inlined into the client bundle at build time, so a
 * per-brand override only works if that brand's app was built with it — which
 * is fine, because each brand builds its own image.
 */
export function publicKeyIdFor(brand: Brand): string {
  return perBrand('NEXT_PUBLIC_RAZORPAY_KEY_ID', brand) ?? ''
}

/** True when this brand can create a charge. */
export function paymentsConfigured(brand: Brand): boolean {
  return Boolean(keyIdFor(brand) && keySecretFor(brand))
}

/** True when this brand can also verify a webhook. */
export function webhookConfiguredFor(brand: Brand): boolean {
  return paymentsConfigured(brand) && Boolean(webhookSecretFor(brand))
}
