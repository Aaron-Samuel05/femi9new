import { defineConfig, devices } from '@playwright/test'

/**
 * Browser E2E config.
 *
 * The server is NOT started here — CI starts one dev server (mock providers,
 * isolated test DB) and runs both the HTTP suite and this one against it, so
 * the app boots once. Point at another target with E2E_BASE_URL.
 *
 * `test/e2e-ui` is deliberately outside `test/**\/*.test.ts`, which is vitest's
 * include pattern — the two runners must not collect each other's files.
 */
export default defineConfig({
  testDir: './test/e2e-ui',
  // The specs mutate one shared guest cart, so they must not race each other.
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://127.0.0.1:3100',
    // A dev server compiles each route on first hit; the default 30s action
    // timeout expires on that first navigation.
    navigationTimeout: 60_000,
    actionTimeout: 20_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
