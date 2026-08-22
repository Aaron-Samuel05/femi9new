/**
 * Global test setup. A hard guardrail: refuse to run unless DATABASE_URL points
 * at a *_test database, so a misconfigured run can never truncate real dev data.
 */
const url = process.env.DATABASE_URL || ''
if (!/_test(\b|\?|$)/.test(url) && !url.includes('femi9_test')) {
  throw new Error(`Refusing to run tests: DATABASE_URL is not a test database (${url}). Expected femi9_test.`)
}
