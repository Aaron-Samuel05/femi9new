import type { Brand } from '@femi9/db'

/**
 * Per-brand environment resolution: `NAME_LUMI9` first, then the shared `NAME`.
 *
 * Lifted out of mail-identity.ts because it is not about mail — Resend, Razorpay
 * and now WhatsApp all resolve their credentials the same way, and a second copy
 * of this rule is a second place for the placeholder bug below to come back.
 */

/**
 * Treat Terraform's initial `TODO-...` values exactly like missing configuration.
 *
 * This is applied to the PER-BRAND value inside `perBrandEnv`, not by callers,
 * and that placement is the whole point — see the note there.
 */
export function usableEnv(value: string | undefined): value is string {
  return Boolean(value && !/^TODO(?:[-_:]|\b)/i.test(value))
}

/**
 * `NAME_<BRAND>`, else the shared `NAME`, else undefined.
 *
 * The `usable` check runs on the specific value BEFORE the fallback is
 * consulted. It used to read `if (specific) return specific`, which looks
 * equivalent and is not: Terraform seeds each per-brand secret with a "TODO-"
 * placeholder, and a placeholder is a non-empty string. So the specific value
 * won, the shared fallback was never consulted, and the caller then rejected
 * the TODO and got undefined. The placeholder SHADOWED a working shared key
 * rather than deferring to it — the exact opposite of what it is for.
 *
 * Deployed, that meant Lumi9's health check reported `RAZORPAY_KEY_ID_LUMI9`
 * missing while a perfectly good shared `RAZORPAY_KEY_ID` sat one line below,
 * and the task never passed its ALB health check.
 */
export function perBrandEnv(name: string, brand: Brand): string | undefined {
  const specific = process.env[`${name}_${brand.toUpperCase()}`]?.trim()
  if (usableEnv(specific)) return specific

  const shared = process.env[name]?.trim()
  return usableEnv(shared) ? shared : undefined
}
