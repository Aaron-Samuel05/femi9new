import { test as base, expect, type Page } from '@playwright/test'

/**
 * Shared fixtures and helpers for the member-area browser E2E specs.
 *
 * NOT a spec file — Playwright's default `testMatch` only collects
 * `*.spec.ts` / `*.test.ts`, so this module is imported, never run.
 *
 * Three problems every spec here shares, solved once:
 *
 *  1. IDENTITY COLLISION. Every spec signs up its own brand-new member, because
 *     the whole point of this suite is what a *fresh* account renders. `phone`
 *     and `email` are both `@unique` on User, so the values have to be unique
 *     per test AND across reruns against the same database.
 *
 *  2. RATE LIMITING. `/api/auth/otp/request` is capped at 5 per minute per
 *     client IP (`src/lib/rate-limit.ts`), and `/api/account/phone/request`
 *     shares that bucket. Six specs signing up inside one minute would start
 *     429-ing on nothing but their own neighbours. Rather than sleeping — which
 *     would make the suite slow and still flaky — each test gets its own
 *     `X-Forwarded-For`, which is what `clientIp()` keys the bucket on. The
 *     per-phone and per-email limits (5/hour) stay fully in force, and each test
 *     uses a fresh number anyway, so real throttling behaviour is not disabled.
 *     This works because a local dev server sits behind no proxy of its own.
 *
 *  3. NATIVE DIALOGS. The rebuild's headline rule is that no member surface may
 *     call `prompt()`, `confirm()` or `alert()` ever again. `installDialogGuard`
 *     records any call instead of letting it open, and survives navigation by
 *     also emitting a console marker the test collects for the whole session.
 */

// ── Per-test client IP ───────────────────────────────────────────────────────

// Seeded from the clock so two runs a few seconds apart never share a bucket,
// then incremented so a retry gets a fresh budget rather than inheriting the
// spent one from the attempt that just failed.
let ipSeq = Date.now() % 0xff_ff_ff

function nextClientIp(): string {
  ipSeq = (ipSeq + 1) % 0xff_ff_ff
  return `10.${(ipSeq >> 16) & 0xff}.${(ipSeq >> 8) & 0xff}.${ipSeq & 0xff}`
}

export const test = base.extend<{ clientIp: string }>({
  // `auto` so the header is on the context before the first navigation, whether
  // or not the spec asks for the value.
  clientIp: [
    async ({ context }, use) => {
      const ip = nextClientIp()
      await context.setExtraHTTPHeaders({ 'x-forwarded-for': ip })
      await use(ip)
    },
    { auto: true },
  ],
})

export { expect }

// ── Unique identities ────────────────────────────────────────────────────────

let identitySeq = 0

/** A 10-digit Indian mobile number no other test in this process will use. */
export function uniquePhone(): string {
  identitySeq += 1
  const stamp = String(Date.now()).slice(-7)
  return `9${stamp}${String(identitySeq % 100).padStart(2, '0')}`
}

export function uniqueEmail(tag: string): string {
  identitySeq += 1
  return `e2e-${tag}-${Date.now().toString(36)}-${identitySeq}@example.test`
}

/** Mirrors `fmtPhone` in src/lib/services/account.ts → "+91 98842 30571". */
export function displayPhone(phone: string): string {
  return `+91 ${phone.slice(0, 5)} ${phone.slice(5)}`
}

// ── Date keys, matching the server's own formatting ──────────────────────────

/** Mirrors `fmtLongKey` in src/lib/cycle-math.ts → "14 August". */
export function longDate(key: string): string {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(Date.UTC(y!, m! - 1, d!)).toLocaleDateString('en-IN', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'long',
  })
}

/** Shift a 'YYYY-MM-DD' key by whole days, in UTC so no zone can round it. */
export function shiftDayKey(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number)
  const date = new Date(Date.UTC(y!, m! - 1, d!))
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

// ── Native-dialog guard ──────────────────────────────────────────────────────

const CONSOLE_MARKER = '__FEMI9_NATIVE_DIALOG__'
const recorded = new WeakMap<Page, string[]>()

/**
 * Replace `alert` / `confirm` / `prompt` with recorders, so a screen that still
 * calls one fails the assertion instead of silently blocking the run. Must be
 * installed BEFORE the first navigation.
 *
 * The init script re-runs per document, so its in-page array resets on every
 * navigation — the console marker is what gives us whole-session coverage.
 */
export async function installDialogGuard(page: Page): Promise<void> {
  const calls: string[] = []
  recorded.set(page, calls)

  page.on('console', (message) => {
    const text = message.text()
    if (text.includes(CONSOLE_MARKER)) calls.push(text.slice(text.indexOf(CONSOLE_MARKER)))
  })

  // If a dialog somehow reaches the browser anyway (an inline <script> that ran
  // before our init script, say), dismiss it so the run cannot hang — and record
  // it, because it is exactly the failure we are asserting against.
  page.on('dialog', (dialog) => {
    calls.push(`${CONSOLE_MARKER}:${dialog.type()}:${dialog.message()}`)
    void dialog.dismiss().catch(() => {})
  })

  await page.addInitScript((marker: string) => {
    for (const name of ['alert', 'confirm', 'prompt'] as const) {
      Object.defineProperty(window, name, {
        configurable: true,
        writable: true,
        value: (...args: unknown[]) => {
          // eslint-disable-next-line no-console
          console.error(`${marker}:${name}:${args.map((a) => String(a)).join(' | ')}`)
          // Return the "user said yes" answer so the page under test carries on
          // and the spec fails on the assertion rather than on a stuck flow.
          return name === 'confirm' ? true : name === 'prompt' ? '' : undefined
        },
      })
    }
  }, CONSOLE_MARKER)
}

/** Fail if any native dialog was opened since the guard was installed. */
export function expectNoNativeDialogs(page: Page): void {
  expect(recorded.get(page) ?? [], 'the member area must never call prompt/confirm/alert').toEqual([])
}

// ── Sign-up helpers ──────────────────────────────────────────────────────────

export interface Member {
  name: string
  email: string
  phone: string
}

/** The dev-mode OTP the API echoes back in mock mode, as rendered on screen. */
export async function readDevCode(page: Page): Promise<string> {
  const code = page.locator('.auth-dev code')
  await expect(code, 'the API must echo a devCode — is the server in mock OTP mode?').toBeVisible()
  const value = (await code.innerText()).trim()
  expect(value).toMatch(/^\d{6}$/)
  return value
}

/**
 * Sign up a brand-new member entirely through the phone-OTP UI and finish
 * onboarding, leaving the browser on /account.
 *
 * Used by the signup spec as the subject under test, and by the specs that need
 * *a* signed-in member but are testing something else — see `signUpViaApi` for
 * the faster variant those prefer.
 */
export async function signUpByPhoneUi(page: Page, member: Omit<Member, 'phone'>): Promise<Member> {
  const phone = uniquePhone()

  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(phone)
  await page.getByRole('button', { name: 'Send code' }).click()

  await page.getByLabel('Verification code').fill(await readDevCode(page))
  await page.getByRole('button', { name: 'Verify & continue' }).click()

  await page.waitForURL(/\/welcome/)
  await page.getByLabel('Full name').fill(member.name)
  await page.getByLabel('Email address').fill(member.email)
  await page.getByRole('button', { name: 'Save and continue' }).click()

  await page.waitForURL(/\/account/)
  return { ...member, phone }
}

/**
 * The same signup, done through the API on the page's own cookie jar.
 *
 * `page.request` shares cookies with the browser context, so the session minted
 * here is live for the very next `page.goto`. Specs that are testing the profile
 * dialog or the cycle tracker use this: re-driving six sign-in screens first
 * would only add ways for an unrelated regression to fail them.
 */
export async function signUpViaApi(
  page: Page,
  clientIp: string,
  member: Omit<Member, 'phone'>,
): Promise<Member> {
  const phone = uniquePhone()
  // `page.request` is a Node-side context and does not inherit the header set on
  // the browser context, so the per-test IP is passed explicitly.
  const headers = { 'x-forwarded-for': clientIp }

  const requested = await page.request.post('/api/auth/otp/request', { data: { phone }, headers })
  expect(requested.status(), await requested.text()).toBe(200)
  const { devCode } = (await requested.json()) as { devCode?: string }
  expect(devCode, 'the server must be in mock OTP mode for E2E').toMatch(/^\d{6}$/)

  const verified = await page.request.post('/api/auth/otp/verify', {
    data: { phone, code: devCode },
    headers,
  })
  expect(verified.status(), await verified.text()).toBe(200)

  const completed = await page.request.post('/api/account/complete-profile', {
    data: { name: member.name, email: member.email },
    headers,
  })
  expect(completed.status(), await completed.text()).toBe(200)
  const profile = (await completed.json()) as { profileComplete?: boolean }
  expect(profile.profileComplete, 'onboarding must leave the profile complete').toBe(true)

  return { ...member, phone }
}

// ── /admin link audit ────────────────────────────────────────────────────────

/**
 * Every anchor on the current page whose resolved path enters the ops console.
 * Resolved via the DOM's own `href` property so a relative link, an absolute
 * URL and a `<Link>`-rendered href are all judged the same way.
 */
export async function adminLinksOn(page: Page): Promise<string[]> {
  return page.$$eval('a[href]', (anchors) =>
    anchors
      .map((a) => {
        const el = a as HTMLAnchorElement
        try {
          return { path: new URL(el.href, window.location.origin).pathname, raw: el.getAttribute('href') ?? '' }
        } catch {
          return { path: '', raw: el.getAttribute('href') ?? '' }
        }
      })
      .filter(({ path }) => path === '/admin' || path.startsWith('/admin/') || path.startsWith('/api/admin'))
      .map(({ path, raw }) => `${path} (href="${raw}")`),
  )
}
