import {
  test,
  expect,
  addFirstPackToCart,
  expectNoNativeDialogs,
  femi9LinksOn,
  installDialogGuard,
  quote,
  signUpViaApi,
  uniqueEmail,
} from "./helpers";

/**
 * The cart's promo box, end to end — and the line Lumi9's coupons must not
 * cross.
 *
 * The box used to answer EVERY code with a hardcoded "isn't a valid code right
 * now" while the console had a full coupons section and `placeOrder` had the
 * redemption logic. Every campaign code the team minted was unredeemable, and
 * the one screen that would have shown it said so in a sentence that was true
 * by construction rather than by checking. These specs are the standing proof
 * that the box now asks the server.
 *
 * The isolation test is the other half, and it is the one worth reading. Lumi9
 * and Femi9 are separate businesses: separate customers, separate catalogues,
 * separate coupons. `FEMI9ONLY` is a real, active, unexpired coupon — in the
 * `femi9` schema. It must be as unusable here as a code nobody ever created,
 * and it must fail for the ORDINARY reason, not with an error that reveals a
 * Femi9 row exists. The seed script asserts the two rows really are split
 * across schemas before the suite runs, so a shared database fails setup rather
 * than quietly passing every assertion below.
 */

/** Seeded by `scripts/seed-e2e.ts` — see the note there on why both exist. */
const LUMI9_COUPON = "LUMI9ONLY";
const FEMI9_COUPON = "FEMI9ONLY";
const COUPON_VALUE = 50;

test.describe("the cart's promo box", () => {
  test("a Lumi9 coupon discounts a Lumi9 basket", async ({ page, clientIp }) => {
    await installDialogGuard(page);
    await addFirstPackToCart(page);

    // The server is the authority on what a basket costs, so establish the
    // undiscounted baseline from the same endpoint the box will call.
    const before = await quote(page, clientIp);
    expect(before.subtotal, "the basket must have something in it").toBeGreaterThan(0);
    expect(before.discount).toBe(0);

    await page.goto("/cart");
    await page.getByLabel("Promo code").fill(LUMI9_COUPON);
    await page.getByRole("button", { name: "Apply" }).click();

    await expect(page.getByText(`“${LUMI9_COUPON}” applied`)).toBeVisible();

    const after = await quote(page, clientIp, LUMI9_COUPON);
    expect(after.couponCode).toBe(LUMI9_COUPON);
    expect(after.couponError ?? null).toBeNull();
    expect(after.discount).toBe(COUPON_VALUE);
    expect(after.total).toBe(before.total - COUPON_VALUE);

    expectNoNativeDialogs(page);
  });

  test("the discount the cart showed is the one checkout carries", async ({ page, clientIp }) => {
    await installDialogGuard(page);

    // Build the basket as a GUEST, then sign in — the order a real shopper
    // arrives in, and the one that exercises `mergeGuestCartIntoUser`. Lumi9
    // requires a session at checkout (`/checkout` redirects a guest to
    // /login?next=/checkout), so a signed-out navigation never reaches the
    // summary this test is about.
    await addFirstPackToCart(page);
    await signUpViaApi(page, clientIp, {
      name: "Meera Iyer",
      email: uniqueEmail("coupon-checkout"),
    });

    await page.goto("/cart");
    await page.getByLabel("Promo code").fill(LUMI9_COUPON);
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page.getByText(`“${LUMI9_COUPON}” applied`)).toBeVisible();

    // Leave the cart the way a shopper does — by pressing the CTA, which is a
    // client-side <Link>. That matters: the applied coupon lives in
    // `CartQuoteProvider`'s React state, and the provider is mounted in the root
    // layout. A soft navigation keeps it; `page.goto` would tear the provider
    // down and rebuild it with `coupon` back at "", which is a real gap in the
    // app (see the note below) but not what this test is about.
    await page.getByRole("link", { name: /^Checkout/ }).click();
    await expect(page).toHaveURL(/\/checkout$/);

    // Checkout renders the quote rather than computing its own total — the whole
    // point of `useQuote`. The code must be named on the discount line, or the
    // shopper cannot tell the coupon survived the navigation.
    await expect(page.getByText(`Discount (${LUMI9_COUPON})`)).toBeVisible();

    const priced = await quote(page, clientIp, LUMI9_COUPON);
    expect(priced.discount).toBe(COUPON_VALUE);

    expectNoNativeDialogs(page);
  });

  /**
   * KNOWN GAP, deliberately not asserted here.
   *
   * The applied coupon is React state in `CartQuoteProvider` and nothing else —
   * not a cookie, not the URL, not the server. So it survives a soft navigation
   * and is lost on any HARD one: a refresh of /checkout, opening it in a second
   * tab, or coming back from an external redirect. The shopper is then shown a
   * total higher than the one she just agreed to, with no explanation — and
   * `CheckoutForm` submits `couponCode: quote?.couponCode`, which is now
   * undefined, so the order is actually PLACED at full price.
   *
   * Not pinned as a passing test, because a test asserting that behaviour would
   * be pinning the bug. Fixing it means choosing where the code should live —
   * a cookie the quote route falls back to is the option that also makes
   * `placeOrder` right — and that is a change to the money path, worth making
   * on purpose rather than as a side effect of writing this suite.
   */

  test("a FEMI9 coupon is refused here, exactly like an unknown code", async ({
    page,
    clientIp,
  }) => {
    await installDialogGuard(page);
    await addFirstPackToCart(page);

    const baseline = await quote(page, clientIp);

    // A real, active coupon — in the other brand's schema.
    const foreign = await quote(page, clientIp, FEMI9_COUPON);
    expect(foreign.couponCode ?? null, "a Femi9 coupon must not apply to a Lumi9 basket").toBeNull();
    expect(foreign.discount).toBe(0);
    expect(foreign.total).toBe(baseline.total);

    // And it must fail the SAME way an invented code does. A distinguishable
    // response would turn this endpoint into an oracle for the other brand's
    // coupon table.
    const invented = await quote(page, clientIp, "NOSUCHCODEATALL");
    expect(foreign.couponError).toBe(invented.couponError);

    // The shopper-facing half of the same fact.
    await page.goto("/cart");
    await page.getByLabel("Promo code").fill(FEMI9_COUPON);
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page.getByText(`“${FEMI9_COUPON}” applied`)).toHaveCount(0);

    expectNoNativeDialogs(page);
  });

  test("no commerce surface links a shopper into the other brand", async ({ page }) => {
    await installDialogGuard(page);
    await addFirstPackToCart(page);

    // Her session, her cart and her coupons exist on exactly one of these two
    // domains. A femi9.in link on a page where she is mid-purchase sends her
    // somewhere none of them do.
    //
    // Whole document, footer included. The footer used to carry two femi9.in
    // rows — Terms & Conditions and FAQ — and this assertion had to be scoped
    // to `main` to pass. Lumi9 now has /terms of its own and has had its own
    // FAQ at /help all along, so there is nothing left to exempt.
    for (const path of ["/cart", "/shop", "/affiliate", "/terms", "/privacy"]) {
      await page.goto(path);
      expect(await femi9LinksOn(page), `${path} must not link into Femi9`).toEqual([]);
    }

    expectNoNativeDialogs(page);
  });

  test("the legal row is three Lumi9 pages that actually render", async ({ page }) => {
    await page.goto("/shop");

    const legal = page.getByRole("navigation", { name: "Legal" });
    await expect(legal.getByRole("link")).toHaveCount(3);

    // A legal link that 404s is worse than one that points off-site: Razorpay
    // and a shopper both need these to resolve.
    for (const [label, path] of [
      ["Privacy Policy", "/privacy"],
      ["Terms & Conditions", "/terms"],
      ["FAQ", "/help"],
    ] as const) {
      const link = legal.getByRole("link", { name: label });
      await expect(link).toHaveAttribute("href", path);
      const res = await page.request.get(path);
      expect(res.status(), `${path} must render`).toBe(200);
    }
  });
});
