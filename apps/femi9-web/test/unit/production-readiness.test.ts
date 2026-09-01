import { afterEach, describe, expect, it } from 'vitest'
import { productionReadinessIssues, productionReadinessReport } from '@femi9/core/production-readiness'

const KEYS = [
  'NODE_ENV',
  'DATABASE_URL',
  'DIRECT_URL',
  'AUTH_SECRET',
  'RAZORPAY_KEY_ID',
  'RAZORPAY_KEY_SECRET',
  'RAZORPAY_WEBHOOK_SECRET',
  'NEXT_PUBLIC_RAZORPAY_KEY_ID',
  'MSG91_AUTH_KEY',
  'MSG91_TEMPLATE_ID',
  'WHATSAPP_TOKEN',
  'WHATSAPP_PHONE_NUMBER_ID',
  'RESEND_API_KEY',
  'EMAIL_FROM',
  'RESEND_WEBHOOK_SECRET',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_REDIRECT_URI',
  'ADMIN_EMAIL',
  'ADMIN_PASSWORD',
  'CRON_SECRET',
  'NEXT_PUBLIC_SITE_URL',
  'UPLOADS_BUCKET',
  'RATE_LIMIT_TABLE',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'CYCLE_DATA_ENCRYPTION_KEY',
] as const

const saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]))

afterEach(() => {
  const mutableEnv = process.env as Record<string, string | undefined>
  for (const key of KEYS) {
    const value = saved[key]
    if (value === undefined) delete process.env[key]
    else mutableEnv[key] = value
  }
})

function configureProduction() {
  const mutableEnv = process.env as Record<string, string | undefined>
  mutableEnv.NODE_ENV = 'production'
  process.env.DATABASE_URL = 'postgresql://db'
  process.env.DIRECT_URL = 'postgresql://direct'
  process.env.AUTH_SECRET = 'a'.repeat(48)
  process.env.RAZORPAY_KEY_ID = 'rzp_live_1'
  process.env.RAZORPAY_KEY_SECRET = 'secret'
  process.env.RAZORPAY_WEBHOOK_SECRET = 'webhook'
  process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID = 'rzp_live_1'
  process.env.MSG91_AUTH_KEY = 'msg91-key'
  process.env.MSG91_TEMPLATE_ID = 'template-id'
  // Phone sign-in delivers its OTP over WhatsApp and nothing else, so these two
  // are traffic-blocking where the MSG91 pair no longer is.
  process.env.WHATSAPP_TOKEN = 'EAAG-real-token'
  process.env.WHATSAPP_PHONE_NUMBER_ID = '323448914175098'
  process.env.RESEND_API_KEY = 're_live_1'
  process.env.EMAIL_FROM = 'Femi9 <login@example.test>'
  process.env.RESEND_WEBHOOK_SECRET = 'whsec_test'
  process.env.GOOGLE_CLIENT_ID = 'client.apps.googleusercontent.com'
  process.env.GOOGLE_CLIENT_SECRET = 'google-secret'
  process.env.GOOGLE_REDIRECT_URI = 'https://shop.example.test/api/auth/google/callback'
  process.env.ADMIN_EMAIL = 'admin@example.test'
  process.env.ADMIN_PASSWORD = 'a-strong-admin-password'
  process.env.CRON_SECRET = 'cron-secret'
  process.env.NEXT_PUBLIC_SITE_URL = 'https://shop.example.test'
  process.env.UPLOADS_BUCKET = 'uploads'
  process.env.RATE_LIMIT_TABLE = 'rate-limit'
  process.env.CYCLE_DATA_ENCRYPTION_KEY = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='
}

describe('production readiness', () => {
  it('accepts a complete core production configuration', () => {
    configureProduction()
    expect(productionReadinessIssues()).toEqual([])
  })

  it('reports missing webhook config and a mismatched browser payment key', () => {
    configureProduction()
    delete process.env.RAZORPAY_WEBHOOK_SECRET
    process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID = 'rzp_live_other'
    expect(productionReadinessIssues()).toEqual(
      expect.arrayContaining([
        'RAZORPAY_WEBHOOK_SECRET',
        'RAZORPAY_KEY_ID(must-match-public-key)',
      ]),
    )
  })

  // Regression guard: these keys once sat in the blocking list, so a staging
  // task without them answered /api/health with 503, never joined the ALB
  // target group, and the ECS deployment timed out. They gate features that
  // already fail closed on their own — they must stay warnings.
  it('keeps optional provider secrets out of the traffic-blocking set', () => {
    configureProduction()
    for (const key of [
      'RESEND_WEBHOOK_SECRET',
      'GOOGLE_CLIENT_ID',
      'GOOGLE_CLIENT_SECRET',
      'GOOGLE_REDIRECT_URI',
      'ADMIN_EMAIL',
      'ADMIN_PASSWORD',
      'CRON_SECRET',
      // No longer on the sign-in path: the OTP goes out over WhatsApp, and
      // MSG91 is left carrying only reward-code delivery. Losing it must not
      // pull a task out of the load balancer.
      'MSG91_AUTH_KEY',
      'MSG91_TEMPLATE_ID',
      // Nor may WhatsApp, however much it costs to lose. The token is set out
      // of band AFTER the apply that creates its secret, so blocking on it made
      // the first deploy of a stack impossible to complete: the task would fail
      // its health check, stall the rollout and roll back with no stated cause.
      'WHATSAPP_TOKEN',
      'WHATSAPP_PHONE_NUMBER_ID',
    ]) {
      delete process.env[key]
    }
    const report = productionReadinessReport()
    expect(report.blocking).toEqual([])
    expect(report.warnings).toEqual(
      expect.arrayContaining([
        'RESEND_WEBHOOK_SECRET',
        'GOOGLE_CLIENT_ID',
        'CRON_SECRET',
        'MSG91_AUTH_KEY',
        'WHATSAPP_TOKEN',
      ]),
    )
  })

  it('warns about a bad Google redirect only once Google sign-in is configured', () => {
    configureProduction()
    process.env.GOOGLE_REDIRECT_URI = 'https://elsewhere.test/api/auth/google/callback'
    const report = productionReadinessReport()
    expect(report.blocking).toEqual([])
    expect(report.warnings).toContain('GOOGLE_REDIRECT_URI(site-origin-mismatch)')
  })

  it('rejects Terraform placeholder values and missing shared rate limiting', () => {
    configureProduction()
    process.env.RAZORPAY_WEBHOOK_SECRET = 'TODO-change-me'
    delete process.env.RATE_LIMIT_TABLE
    expect(productionReadinessIssues()).toEqual(
      expect.arrayContaining(['RAZORPAY_WEBHOOK_SECRET', 'SHARED_RATE_LIMIT_STORE']),
    )
  })
})
