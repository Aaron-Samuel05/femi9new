import { afterEach, describe, expect, it } from 'vitest'
import { productionReadinessIssues } from '@/lib/production-readiness'

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
  'RESEND_API_KEY',
  'EMAIL_FROM',
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
  process.env.RESEND_API_KEY = 're_live_1'
  process.env.EMAIL_FROM = 'Femi9 <login@example.test>'
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

  it('rejects Terraform placeholder values and missing shared rate limiting', () => {
    configureProduction()
    process.env.RAZORPAY_WEBHOOK_SECRET = 'TODO-change-me'
    delete process.env.RATE_LIMIT_TABLE
    expect(productionReadinessIssues()).toEqual(
      expect.arrayContaining(['RAZORPAY_WEBHOOK_SECRET', 'SHARED_RATE_LIMIT_STORE']),
    )
  })
})
