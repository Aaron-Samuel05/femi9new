import {
  test,
  expect,
  expectNoNativeDialogs,
  installDialogGuard,
  signInByEmail,
  signUpViaApi,
  uniqueEmail,
} from "./helpers";

/**
 * The Lumi9 creator programme, end to end — and the line it must not cross.
 *
 * Attribution has worked for both brands since the shared `placeOrder` started
 * reading a referral cookie and calling `attributeOrder(brand, …)`. The half
 * that was missing on Lumi9 was the half that WRITES that cookie: nothing on
 * this storefront ever called `/a/[code]`, so a Lumi9 creator's clicks, orders
 * and earnings were permanently zero and there was no page to apply on.
 *
 * ── Why the isolation tests are the important ones ───────────────────────────
 * Lumi9's creators are not Femi9's. `FEMI9CREATOR` is a real, APPROVED
 * affiliate — in the `femi9` schema — and `LUMI9CREATOR` is a real, approved
 * affiliate in the `lumi9` one. Both are seeded, so "the Femi9 code does
 * nothing here" is a claim about isolation rather than about a row that happens
 * not to exist. The click counter is the instrument: it is the only thing in
 * the system that moves when a code resolves, so watching it NOT move is the
 * sharpest available proof that the lookup never reached the other schema.
 */

/** Seeded by `scripts/seed-e2e.ts`. */
const LUMI9_CREATOR = "LUMI9CREATOR";
const FEMI9_CREATOR = "FEMI9CREATOR";
const LUMI9_CREATOR_EMAIL = "e2e-lumi9creator@example.test";

/** The creator's own metrics, read through the owner-scoped endpoint. */
async function myStats(page: import("@playwright/test").Page, clientIp: string) {
  const res = await page.request.get("/api/affiliate/me", {
    headers: { "x-forwarded-for": clientIp },
  });
  expect(res.status(), await res.text()).toBe(200);
  return (await res.json()) as { status: string; promoCode: string; clicks: number; orders: number };
}

async function refCookies(page: import("@playwright/test").Page) {
  const jar = await page.context().cookies();
  return {
    lumi9: jar.find((c) => c.name === "lumi9_ref")?.value ?? null,
    femi9: jar.find((c) => c.name === "femi9_ref")?.value ?? null,
  };
}

test.describe("the creator programme", () => {
  test("a visitor can apply, and is not handed a code for doing so", async ({ page }) => {
    await installDialogGuard(page);

    await page.goto("/affiliate");
    const form = page.getByTestId("affiliate-form");
    await expect(form).toBeVisible();

    await form.getByLabel("Your name").fill("Ananya Reddy");
    await form.getByLabel("Your social handle").fill("@ananyaparents");
    await form.getByLabel("Main platform").selectOption("Instagram");
    await form.getByLabel("Audience size").selectOption("5k - 25k");
    await form.getByLabel("Email address").fill(uniqueEmail("creator"));
    await form.getByRole("button", { name: "Apply to the programme" }).click();

    const done = page.getByTestId("affiliate-applied");
    await expect(done).toBeVisible();

    // Applying creates a PENDING row; an admin allocates the real code. A form
    // that hands back a code the programme has not issued produces links that
    // track nothing, so the acknowledgement must not contain one.
    await expect(done).toContainText("Application received");
    await expect(done).not.toContainText("PENDING-");

    expectNoNativeDialogs(page);
  });

  test("a referral link logs a click and drops only this brand's cookie", async ({
    page,
    clientIp,
  }) => {
    await installDialogGuard(page);
    await signInByEmail(page, clientIp, LUMI9_CREATOR_EMAIL);

    const before = await myStats(page, clientIp);
    expect(before.status).toBe("approved");
    expect(before.promoCode).toBe(LUMI9_CREATOR);

    await page.goto(`/a/${LUMI9_CREATOR}`);
    // A referral link is a way into the shop, never an error page.
    await expect(page).toHaveURL(/\/$/);

    const cookies = await refCookies(page);
    expect(cookies.lumi9, "the Lumi9 link must set the Lumi9 referral cookie").toBe(LUMI9_CREATOR);
    // The two storefronts share a hostname in dev and in CI, where cookies
    // ignore the port. A `femi9_ref` written from here would ride along into a
    // Femi9 checkout on the next port over.
    expect(cookies.femi9, "Lumi9 must never write Femi9's referral cookie").toBeNull();

    const after = await myStats(page, clientIp);
    expect(after.clicks, "the click must have been recorded").toBe(before.clicks + 1);

    expectNoNativeDialogs(page);
  });

  test("a FEMI9 creator's code tracks nothing on Lumi9", async ({ page, clientIp }) => {
    await installDialogGuard(page);
    await signInByEmail(page, clientIp, LUMI9_CREATOR_EMAIL);

    const before = await myStats(page, clientIp);

    // An APPROVED code — in the other brand's schema. The route must treat it
    // exactly like a code nobody ever created: redirect home, log nothing.
    await page.goto(`/a/${FEMI9_CREATOR}`);
    await expect(page).toHaveURL(/\/$/);

    const cookies = await refCookies(page);
    expect(cookies.femi9, "Lumi9 must never write Femi9's referral cookie").toBeNull();

    // Nothing in the `lumi9` schema moved, because nothing in it matches that
    // code. This is the assertion that would fail if the two brands ever shared
    // a database or a client.
    const after = await myStats(page, clientIp);
    expect(after.clicks, "a Femi9 code must not log a Lumi9 click").toBe(before.clicks);
    expect(after.orders).toBe(before.orders);

    expectNoNativeDialogs(page);
  });

  test("an unknown code is harmless, not an error page", async ({ page }) => {
    await installDialogGuard(page);

    await page.goto("/a/NOSUCHCREATOR");
    await expect(page).toHaveURL(/\/$/);
    // The shop, not a 404 — a stale link in an old caption must still sell.
    await expect(page.locator("main")).toBeVisible();

    expectNoNativeDialogs(page);
  });

  test("metrics are owner-scoped: a code is not a credential", async ({ page, clientIp }) => {
    // Signed out.
    const guest = await page.request.get("/api/affiliate/me", {
      headers: { "x-forwarded-for": clientIp },
    });
    expect(guest.status(), "a guest must not read anybody's earnings").toBe(401);

    // Signed in, but not a creator: 404, and no way to ask about somebody else.
    await signUpViaApi(page, clientIp, {
      name: "Priya Nair",
      email: uniqueEmail("not-a-creator"),
    });
    const shopper = await page.request.get("/api/affiliate/me", {
      headers: { "x-forwarded-for": clientIp },
    });
    expect(shopper.status()).toBe(404);

    // The page reflects that: she is offered the form, not somebody's numbers.
    await page.goto("/affiliate");
    await expect(page.getByTestId("affiliate-form")).toBeVisible();
    await expect(page.getByText(LUMI9_CREATOR)).toHaveCount(0);
  });
});
