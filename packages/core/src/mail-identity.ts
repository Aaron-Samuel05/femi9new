import type { Brand } from '@femi9/db'
import { brandConfig } from './brands'

/**
 * Which mail identity a brand sends under.
 *
 * Transactional mail is the most brand-visible thing the platform does — a
 * Lumi9 parent receiving a Femi9-branded sign-in link is confusing at best, and
 * at worst reads as phishing. So the FROM address and the copy are per brand
 * even while the provider account is shared.
 *
 * ── The fallback is deliberate and temporary ────────────────────────────────
 * Each setting is read per brand first and falls back to the shared variable,
 * exactly as `dbFor` falls back to `DATABASE_URL`. That is what lets Lumi9 run
 * on Femi9's Resend credentials today and move to its own by setting one
 * variable, with no code change.
 *
 * The KEY may reasonably stay shared — one Resend account can send for several
 * verified domains. The FROM address should not: it must be a domain that brand
 * has verified, or delivery suffers and the mail looks wrong.
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

/** `RESEND_API_KEY_LUMI9`, else the shared `RESEND_API_KEY`. */
export function resendKeyFor(brand: Brand): string | undefined {
  const key = perBrand('RESEND_API_KEY', brand)
  return usable(key) ? key : undefined
}

/** `EMAIL_FROM_LUMI9`, else the shared `EMAIL_FROM`. */
export function emailFromFor(brand: Brand): string | undefined {
  const from = perBrand('EMAIL_FROM', brand)
  return usable(from) ? from : undefined
}

/** True when this brand can actually send. */
export function mailConfigured(brand: Brand): boolean {
  return Boolean(resendKeyFor(brand) && emailFromFor(brand))
}

/** The name to put in the subject line and the button. */
export function brandName(brand: Brand): string {
  return brandConfig(brand).name
}
