import { test as base, expect, type Page } from "@playwright/test";

/**
 * Shared fixtures and helpers for the Lumi9 browser E2E specs.
 *
 * NOT a spec file — Playwright's default `testMatch` only collects
 * `*.spec.ts` / `*.test.ts`, so this module is imported, never run.
 *
 * Three problems every spec here shares, solved once:
 *
 *  1. IDENTITY COLLISION. Each spec signs up its own brand-new shopper, because
 *     what a *fresh* account sees is usually the thing under test. `phone` and
 *     `email` are both `@unique` on User, so the values must be unique per test
 *     AND across reruns against the same schema.
 *
 *  2. RATE LIMITING. `/api/auth/otp/request` is capped at 5/min per client IP
 *     (`l9:otp:req:ip:`), and `/api/affiliate/apply` at 5 per 5 minutes. Specs
 *     running back to back would start 429-ing on nothing but their neighbours.
 *     Each test therefore gets its own `X-Forwarded-For`, which is what
 *     `clientIp()` keys the bucket on. The per-number and per-email limits stay
 *     fully in force and each test uses fresh values anyway, so real throttling
 *     behaviour is not disabled.
 *
 *  3. NATIVE DIALOGS. `installDialogGuard` records `alert`/`confirm`/`prompt`
 *     instead of letting one open — an opened dialog blocks every subsequent
 *     command and the run dies with an unhelpful timeout.
 */

// ── Per-test client IP ───────────────────────────────────────────────────────

// Seeded from the clock so two runs a few seconds apart never share a bucket,
// then incremented so a retry gets a fresh budget rather than inheriting the
// spent one from the attempt that just failed.
let ipSeq = Date.now() % 0xff_ff_ff;

function nextClientIp(): string {
  ipSeq = (ipSeq + 1) % 0xff_ff_ff;
  return `10.${(ipSeq >> 16) & 0xff}.${(ipSeq >> 8) & 0xff}.${ipSeq & 0xff}`;
}

export const test = base.extend<{ clientIp: string }>({
  // `auto` so the header is on the context before the first navigation, whether
  // or not the spec asks for the value.
  clientIp: [
    async ({ context }, use) => {
      const ip = nextClientIp();
      await context.setExtraHTTPHeaders({ "x-forwarded-for": ip });
      await use(ip);
    },
    { auto: true },
  ],
});

export { expect };

// ── Unique identities ────────────────────────────────────────────────────────

let identitySeq = 0;

/** A 10-digit Indian mobile number no other test in this process will use. */
export function uniquePhone(): string {
  identitySeq += 1;
  const stamp = String(Date.now()).slice(-7);
  return `9${stamp}${String(identitySeq % 100).padStart(2, "0")}`;
}

export function uniqueEmail(tag: string): string {
  identitySeq += 1;
  return `e2e-${tag}-${Date.now().toString(36)}-${identitySeq}@example.test`;
}

// ── Native-dialog guard ──────────────────────────────────────────────────────

const CONSOLE_MARKER = "__LUMI9_NATIVE_DIALOG__";
const recorded = new WeakMap<Page, string[]>();

/**
 * Replace `alert` / `confirm` / `prompt` with recorders, so a screen that calls
 * one fails an assertion instead of silently blocking the run. Must be
 * installed BEFORE the first navigation.
 *
 * The init script re-runs per document, so its in-page array resets on every
 * navigation — the console marker is what gives whole-session coverage.
 */
export async function installDialogGuard(page: Page): Promise<void> {
  const calls: string[] = [];
  recorded.set(page, calls);

  page.on("console", (message) => {
    const text = message.text();
    if (text.includes(CONSOLE_MARKER)) calls.push(text.slice(text.indexOf(CONSOLE_MARKER)));
  });

  await page.addInitScript((marker) => {
    for (const name of ["alert", "confirm", "prompt"] as const) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any)[name] = (...args: unknown[]) => {
        console.log(`${marker} ${name}(${args.map(String).join(", ")})`);
        return name === "confirm" ? true : name === "prompt" ? "" : undefined;
      };
    }
  }, CONSOLE_MARKER);
}

export function expectNoNativeDialogs(page: Page): void {
  expect(recorded.get(page) ?? [], "no screen may open a native dialog").toEqual([]);
}

// ── Sign-up ──────────────────────────────────────────────────────────────────

export interface Shopper {
  name: string;
  email: string;
  phone: string;
}

/**
 * Sign up a brand-new Lumi9 shopper through the API on the page's own cookie
 * jar, leaving a live `lumi9_session` for the very next `page.goto`.
 *
 * `page.request` shares cookies with the browser context, but is a Node-side
 * context that does NOT inherit the header set on the browser context — so the
 * per-test IP is passed explicitly on every call.
 */
export async function signUpViaApi(
  page: Page,
  clientIp: string,
  shopper: Omit<Shopper, "phone">,
): Promise<Shopper> {
  const phone = uniquePhone();
  const headers = { "x-forwarded-for": clientIp };

  const requested = await page.request.post("/api/auth/otp/request", { data: { phone }, headers });
  expect(requested.status(), await requested.text()).toBe(200);
  const { devCode } = (await requested.json()) as { devCode?: string };
  expect(devCode, "the server must be in mock OTP mode for E2E").toMatch(/^\d{6}$/);

  const verified = await page.request.post("/api/auth/otp/verify", {
    data: { phone, code: devCode },
    headers,
  });
  expect(verified.status(), await verified.text()).toBe(200);

  const completed = await page.request.post("/api/account/complete-profile", {
    data: { name: shopper.name, email: shopper.email },
    headers,
  });
  expect(completed.status(), await completed.text()).toBe(200);
  const profile = (await completed.json()) as { profileComplete?: boolean };
  expect(profile.profileComplete, "onboarding must leave the profile complete").toBe(true);

  return { ...shopper, phone };
}

/**
 * Sign in as an EXISTING shopper by email magic link.
 *
 * The affiliate specs need a session belonging to a creator the seed created,
 * which the phone flow cannot give them — that account has an email and no
 * phone. In mock mode `/api/auth/email/request` echoes the link it would have
 * sent, so the whole flow is drivable without a mail provider.
 *
 * The echoed link is absolute and built from `NEXT_PUBLIC_SITE_URL` when that is
 * set, which need not be the origin the test is driving. Only its query is used,
 * so the navigation stays on `baseURL` either way.
 */
export async function signInByEmail(page: Page, clientIp: string, email: string): Promise<void> {
  const headers = { "x-forwarded-for": clientIp };

  const requested = await page.request.post("/api/auth/email/request", { data: { email }, headers });
  expect(requested.status(), await requested.text()).toBe(200);
  const { devLink } = (await requested.json()) as { devLink?: string };
  expect(devLink, "the server must be in mock mail mode for E2E").toBeTruthy();

  const query = new URL(devLink!).search;
  await page.goto(`/api/auth/email/verify${query}`);
  // The verify route redirects on every path, including failure — landing back
  // on /login means the link was refused.
  await expect(page, "the magic link must not bounce to /login").not.toHaveURL(/\/login/);
}

// ── Cart ─────────────────────────────────────────────────────────────────────

/**
 * Put one real catalogue pack in the guest cart, by driving the shop.
 *
 * Deliberately through the UI rather than by POSTing a variant id: the
 * catalogue lives in the database and its ids are generated by the seed, so a
 * literal here would be a value that is correct only until somebody re-seeds,
 * and there is no endpoint that hands the ids out. Clicking the real buy box is
 * both more faithful and the only stable way to name a variant.
 *
 * Leaves the cart drawer open — `CartUIProvider.openCart()` fires before the
 * request — so callers that want a page instead should navigate afterwards.
 */
export async function addFirstPackToCart(page: Page): Promise<void> {
  await page.goto("/shop");

  // The card's title link is the product; the image above it points at the same
  // href, so either would do. `.first()` keeps this independent of how many
  // sizes the seed happens to carry.
  await page.locator('a[href^="/product/"]').first().click();
  await expect(page).toHaveURL(/\/product\//);

  const addToCart = page.getByRole("button", { name: /^Add to cart/ });
  await expect(addToCart).toBeVisible();
  await addToCart.click();

  // The drawer opens optimistically, BEFORE the request — so its appearance is
  // not proof the line landed. Wait for the server-priced total instead.
  const drawer = page.getByRole("dialog");
  await expect(drawer).toBeVisible();
  await expect(drawer.getByText(/₹/).first()).toBeVisible();
}

/** What the server says this basket costs, with an optional coupon applied. */
export interface Quote {
  subtotal: number;
  discount: number;
  shipping: number;
  total: number;
  couponCode?: string | null;
  couponError?: string | null;
}

export async function quote(page: Page, clientIp: string, coupon?: string): Promise<Quote> {
  const url = coupon
    ? `/api/checkout/quote?coupon=${encodeURIComponent(coupon)}`
    : "/api/checkout/quote";
  const res = await page.request.get(url, { headers: { "x-forwarded-for": clientIp } });
  expect(res.status(), await res.text()).toBe(200);
  return (await res.json()) as Quote;
}

// ── Cross-brand link audit ───────────────────────────────────────────────────

/**
 * Every anchor on the current page that points at the OTHER brand.
 *
 * Lumi9 and Femi9 are separate businesses on separate domains with separate
 * customers, carts and creator programmes. A stray femi9.in link on a Lumi9
 * commerce surface sends a shopper somewhere her session, her cart and her
 * coupons do not exist.
 *
 * Resolved via the DOM's own `href` property so a relative link, an absolute
 * URL and a `<Link>`-rendered href are all judged the same way.
 */
export async function femi9LinksOn(page: Page, selector = "body"): Promise<string[]> {
  return page.$$eval(`${selector} a[href]`, (anchors) =>
    anchors
      .map((a) => {
        const el = a as HTMLAnchorElement;
        try {
          return { host: new URL(el.href, window.location.origin).host, raw: el.getAttribute("href") ?? "" };
        } catch {
          return { host: "", raw: el.getAttribute("href") ?? "" };
        }
      })
      .filter(({ host }) => host.endsWith("femi9.in"))
      .map(({ raw }) => raw),
  );
}
