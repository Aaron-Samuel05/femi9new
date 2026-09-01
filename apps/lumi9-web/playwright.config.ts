import { defineConfig, devices } from "@playwright/test";

/**
 * Lumi9 browser E2E config.
 *
 * The server is NOT started here — CI boots one `next dev` against an isolated
 * `lumi9` test schema with mock providers and points this at it, so the app
 * compiles once for the whole suite. Target another origin with E2E_BASE_URL.
 *
 * Port 3101, not 3100: Femi9's suite owns 3100, and the two must be able to run
 * side by side. That matters more here than it looks — the referral cookie is
 * per brand but cookies ignore the port, so a Femi9 run and a Lumi9 run sharing
 * 127.0.0.1 share a cookie jar. Separate ports keep the two servers apart;
 * `lumi9_ref` vs `femi9_ref` is what keeps the two programmes apart.
 *
 * `test/e2e-ui` sits outside vitest's include pattern (`test/*.test.ts`) so the
 * two runners never collect each other's files.
 */
export default defineConfig({
  testDir: "./test/e2e-ui",
  // The specs mutate one shared guest cart, so they must not race each other.
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [["github"], ["list"], ["html", { open: "never" }]]
    : [["list"]],
  // Per-TEST budget, which is the binding constraint: `next dev` compiles each
  // route on first hit, and a spec that walks the cart, checkout and /affiliate
  // in one test spends most of its budget on cold compiles that later specs get
  // for free.
  timeout: 120_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://127.0.0.1:3101",
    navigationTimeout: 60_000,
    actionTimeout: 20_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
