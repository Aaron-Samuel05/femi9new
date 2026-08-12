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

/**
 * Return configuration keys that make a production task unsafe to receive
 * traffic. Only key names are returned; secret values are never exposed.
 */
export function productionReadinessIssues(): string[] {
  if (process.env.NODE_ENV !== 'production') return []

  const issues: string[] = []
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
    'RESEND_WEBHOOK_SECRET',
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'GOOGLE_REDIRECT_URI',
    'ADMIN_EMAIL',
    'ADMIN_PASSWORD',
    'CRON_SECRET',
  ]
  for (const key of required) if (!configuredEnv(key)) issues.push(key)
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
  const googleRedirect = process.env.GOOGLE_REDIRECT_URI?.trim()
  if (!googleRedirect || !googleRedirect.startsWith('https://') || !googleRedirect.endsWith('/api/auth/google/callback')) {
    issues.push('GOOGLE_REDIRECT_URI(exact-https-callback)')
  } else if (siteUrl) {
    try {
      if (new URL(googleRedirect).origin !== new URL(siteUrl).origin) issues.push('GOOGLE_REDIRECT_URI(site-origin-mismatch)')
    } catch {
      issues.push('GOOGLE_REDIRECT_URI(invalid)')
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

  return [...new Set(issues)]
}
