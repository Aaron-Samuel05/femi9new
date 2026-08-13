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
  // CI also writes the HTML report so a failure ships its screenshots and
  // traces as an artifact — without it there is nothing to look at afterwards
  // but the assertion message.
  reporter: process.env.CI
    ? [['github'], ['list'], ['html', { open: 'never' }]]
    : [['list']],
  // Per-TEST budget, which is the binding constraint here — not the per-action
  // one below. `next dev` compiles each route on first hit, and a spec like
  // admin-guard walks seven public routes in a single test, so it spends most
  // of its budget on first-hit compiles that later specs get for free. At 60s
  // that test timed out on whichever route happened to be cold first
  // (/checkout on one run, /partner on the next) while passing on retry —
  // the classic signature of a budget that is too tight rather than a bug.
  timeout: 120_000,
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
