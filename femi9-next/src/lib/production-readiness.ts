import 'server-only'
import { configuredEnv } from '@/lib/runtime-mode'

function validBase64Key(name: string, bytes: number): boolean {
  const value = process.env[name]?.trim()
  if (!value) return false
  try {
    return Buffer.from(value, 'base64').length === bytes
  } catch {
    return false
  }
}

export interface ReadinessReport {
  /** Keys whose absence makes the task unsafe to serve traffic (health → 503). */
  blocking: string[]
  /** Keys whose absence only disables a feature; the task still serves traffic. */
  warnings: string[]
}

/**
 * Split the configuration audit into traffic-blocking problems and
 * feature-gating gaps.
 *
 * The distinction matters operationally: /api/health is the ALB's health check,
 * so anything listed as blocking takes the task OUT of the load balancer and
 * stalls an ECS deployment. Only include a key here when serving traffic
 * without it would be wrong or unsafe.
 *
 * The warning set is for providers that already fail closed on their own — the
 * Resend webhook rejects unsigned payloads without its secret, the cron route
 * falls back to admin auth without CRON_SECRET, Google sign-in is gated behind
 * isConfigured(), and admin login is impossible without its credentials. A
 * missing optional provider must never brick the storefront.
 */
export function productionReadinessReport(): ReadinessReport {
  if (process.env.NODE_ENV !== 'production') return { blocking: [], warnings: [] }

  const issues: string[] = []
  const warnings: string[] = []
  const required = [
    'DATABASE_URL',
    'DIRECT_URL',
    'AUTH_SECRET',
    'RAZORPAY_KEY_ID',
    'RAZORPAY_KEY_SECRET',
    'RAZORPAY_WEBHOOK_SECRET',
    'NEXT_PUBLIC_RAZORPAY_KEY_ID',
    'MSG91_AUTH_KEY',
    'MSG91_TEMPLATE_ID',
    'RESEND_API_KEY',
    'EMAIL_FROM',
  ]
  // Feature-gating only — see the note above before promoting any of these.
  const recommended = [
    'RESEND_WEBHOOK_SECRET',
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'ADMIN_EMAIL',
    'ADMIN_PASSWORD',
    'CRON_SECRET',
  ]
  for (const key of required) if (!configuredEnv(key)) issues.push(key)
  for (const key of recommended) if (!configuredEnv(key)) warnings.push(key)
  if (
    !configuredEnv('RATE_LIMIT_TABLE') &&
    (!configuredEnv('UPSTASH_REDIS_REST_URL') ||
      !configuredEnv('UPSTASH_REDIS_REST_TOKEN'))
  ) {
    issues.push('SHARED_RATE_LIMIT_STORE')
  }
  if (!configuredEnv('UPLOADS_BUCKET') && !configuredEnv('CLOUDINARY_URL')) {
    issues.push('DURABLE_UPLOAD_STORAGE')
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  if (!siteUrl || !siteUrl.startsWith('https://')) issues.push('NEXT_PUBLIC_SITE_URL(https)')
  // Only audited once Google sign-in is actually switched on: a wrong redirect
  // breaks that one button, it does not make the task unfit to serve traffic.
  if (configuredEnv('GOOGLE_CLIENT_ID') || configuredEnv('GOOGLE_CLIENT_SECRET')) {
    const googleRedirect = process.env.GOOGLE_REDIRECT_URI?.trim()
    if (!googleRedirect || !googleRedirect.startsWith('https://') || !googleRedirect.endsWith('/api/auth/google/callback')) {
      warnings.push('GOOGLE_REDIRECT_URI(exact-https-callback)')
    } else if (siteUrl) {
      try {
        if (new URL(googleRedirect).origin !== new URL(siteUrl).origin) warnings.push('GOOGLE_REDIRECT_URI(site-origin-mismatch)')
      } catch {
        warnings.push('GOOGLE_REDIRECT_URI(invalid)')
      }
    }
  }
  if ((process.env.AUTH_SECRET?.length ?? 0) < 32) issues.push('AUTH_SECRET(min-32-chars)')
  if (!validBase64Key('CYCLE_DATA_ENCRYPTION_KEY', 32)) {
    issues.push('CYCLE_DATA_ENCRYPTION_KEY(base64-32-bytes)')
  }
  if (
    configuredEnv('RAZORPAY_KEY_ID') &&
    configuredEnv('NEXT_PUBLIC_RAZORPAY_KEY_ID') &&
    process.env.RAZORPAY_KEY_ID !== process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID
  ) {
    issues.push('RAZORPAY_KEY_ID(must-match-public-key)')
  }

  return { blocking: [...new Set(issues)], warnings: [...new Set(warnings)] }
}

/** Traffic-blocking configuration problems only (what /api/health fails on). */
export function productionReadinessIssues(): string[] {
  return productionReadinessReport().blocking
}
