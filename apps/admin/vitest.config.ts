import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'
import { fileURLToPath } from 'node:url'

/**
 * Admin tests run against an isolated PLATFORM database. `server-only` is
 * stubbed (it throws outside a Next server). Files share the database and reset
 * per-test, so they run serially.
 */
const dotenv = loadEnv('test', fileURLToPath(new URL('.', import.meta.url)), '')
const TEST_DB =
  process.env.TEST_PLATFORM_DATABASE_URL ||
  dotenv.TEST_PLATFORM_DATABASE_URL ||
  'postgresql://postgres:postgres@127.0.0.1:5432/femi9_platform_test?schema=public'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    fileParallelism: false,
    hookTimeout: 120_000,
    testTimeout: 120_000,
    env: {
      DATABASE_URL_PLATFORM: TEST_DB,
      ADMIN_AUTH_SECRET: 'admin-test-secret-0123456789abcdef0123456789abcdef',
      NODE_ENV: 'test',
    },
    alias: {
      'server-only': fileURLToPath(new URL('./test/stubs/server-only.ts', import.meta.url)),
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
