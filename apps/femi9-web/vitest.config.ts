import { defineConfig } from 'vitest/config'
// `vitest/config` re-exports defineConfig but not loadEnv, so it comes from vite.
import { loadEnv } from 'vite'
import { fileURLToPath } from 'node:url'

/**
 * Tests run against an ISOLATED Postgres database (femi9_test) so they never
 * touch dev data. `server-only` is stubbed (it throws outside a Next server),
 * and `@/*` resolves to src/* like the app. Integration files share the DB and
 * reset it per-test, so run serially (fileParallelism:false) to avoid races.
 */

// `loadEnv` is the point: this file is evaluated BEFORE Vite loads .env, so
// reading process.env alone found nothing and every run silently fell through to
// the localhost fallback below — against whatever database happened to be
// listening there, failing with an unrelated auth error rather than saying
// "TEST_DATABASE_URL was not picked up". The '' prefix opts out of Vite's
// VITE_-only filter; the shell still wins over .env.
const dotenv = loadEnv('test', fileURLToPath(new URL('.', import.meta.url)), '')
const TEST_DB =
  process.env.TEST_DATABASE_URL ||
  dotenv.TEST_DATABASE_URL ||
  'postgresql://femi9:femi9@127.0.0.1:5432/femi9_test?schema=public'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    setupFiles: ['test/setup.ts'],
    fileParallelism: false,
    // Sized for the same hosted-database reality as PRISMA_TRANSACTION_TIMEOUT_MS
    // below. A test like refund's — reset, seed, build a product, place an order,
    // capture payment, refund, then assert stock and the points ledger — is ~40
    // sequential round trips; at ~250ms each it spends half a minute waiting on
    // the wire and nothing else, and reports it as "test timed out" rather than
    // "your database is far away".
    hookTimeout: 120_000,
    testTimeout: 120_000,
    env: {
      DATABASE_URL: TEST_DB,
      DIRECT_URL: TEST_DB,
      AUTH_SECRET: 'test-secret-0123456789abcdef0123456789abcdef',
      NEXT_PUBLIC_SITE_URL: 'http://localhost:3000',
      ADMIN_EMAIL: 'admin@femi9.in',
      ADMIN_PASSWORD: 'femi9admin',
      // Provider credentials must be explicitly blank. Vite loads .env before
      // tests; without these overrides, a developer's real Razorpay/MSG91 keys
      // leak into integration tests and turn deterministic mocks into network
      // calls against external services.
      RAZORPAY_KEY_ID: '',
      RAZORPAY_KEY_SECRET: '',
      RAZORPAY_WEBHOOK_SECRET: '',
      NEXT_PUBLIC_RAZORPAY_KEY_ID: '',
      MSG91_AUTH_KEY: '',
      MSG91_TEMPLATE_ID: '',
      RESEND_API_KEY: '',
      GOOGLE_CLIENT_ID: '',
      GOOGLE_CLIENT_SECRET: '',
      ALLOW_MOCK_PROVIDERS: 'true',
      CYCLE_DATA_ENCRYPTION_KEY: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
      // The test database is typically hosted (Neon), not local, so a round trip
      // costs ~250ms instead of ~0. Prisma's 5s interactive-transaction default
      // then expires mid-checkout and the suite fails with "Transaction already
      // closed" — a latency artefact that looks exactly like a real oversell bug.
      PRISMA_TRANSACTION_TIMEOUT_MS: '30000',
      NODE_ENV: 'test',
    },
  },
  resolve: {
    alias: {
      'server-only': fileURLToPath(new URL('./test/stubs/server-only.ts', import.meta.url)),
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
