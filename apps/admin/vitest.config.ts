import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'
import { fileURLToPath } from 'node:url'

/**
 * Admin tests run against an isolated PLATFORM database. `server-only` is
 * stubbed (it throws outside a Next server). Files share the database and reset
 * per-test, so they run serially.
 */
const dotenv = loadEnv('test', fileURLToPath(new URL('.', import.meta.url)), '')
const pick = (name: string, fallback: string) =>
  process.env[name] || dotenv[name] || fallback

const TEST_DB = pick(
  'TEST_PLATFORM_DATABASE_URL',
  'postgresql://postgres:postgres@127.0.0.1:5432/femi9_platform_test?schema=public',
)

// The console reads BRAND data as well as admin identity, and the isolation
// tests need both brands. One database, a schema each — the same shape
// production will have.
const TEST_FEMI9 = pick(
  'TEST_FEMI9_DATABASE_URL',
  'postgresql://postgres:postgres@127.0.0.1:5432/femi9_twobrand?schema=femi9',
)
const TEST_LUMI9 = pick(
  'TEST_LUMI9_DATABASE_URL',
  'postgresql://postgres:postgres@127.0.0.1:5432/femi9_twobrand?schema=lumi9',
)

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    fileParallelism: false,
    hookTimeout: 120_000,
    testTimeout: 120_000,
    env: {
      DATABASE_URL_PLATFORM: TEST_DB,
      DATABASE_URL_FEMI9: TEST_FEMI9,
      DATABASE_URL_LUMI9: TEST_LUMI9,
      ADMIN_AUTH_SECRET: 'admin-test-secret-0123456789abcdef0123456789abcdef',
      NODE_ENV: 'test',
    },
    alias: {
      'server-only': fileURLToPath(new URL('./test/stubs/server-only.ts', import.meta.url)),
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
