import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

/**
 * Tests run against an ISOLATED Postgres database (femi9_test) so they never
 * touch dev data. `server-only` is stubbed (it throws outside a Next server),
 * and `@/*` resolves to src/* like the app. Integration files share the DB and
 * reset it per-test, so run serially (fileParallelism:false) to avoid races.
 */
const TEST_DB =
  process.env.TEST_DATABASE_URL ||
  'postgresql://femi9:femi9@127.0.0.1:5432/femi9_test?schema=public'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    setupFiles: ['test/setup.ts'],
    fileParallelism: false,
    hookTimeout: 30_000,
    testTimeout: 30_000,
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
