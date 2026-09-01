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

/**
 * The promo box, on whichever of /cart and /checkout is open.
 *
 * Scoped rather than reached by role from the page, because both screens carry
 * more than one of everything this test presses: each cart line has its own
 * "Remove" button, `CheckoutCta` is rendered by both CartView and the CartDrawer
 * that lives in the root layout, and the drawer's summary names an applied
 * coupon on top of the one the page itself shows. An unscoped query matches
 * several and fails strict mode instantly, which reads like a broken control
 * rather than an ambiguous selector.
 */
function promo(page: import("@playwright/test").Page) {
  return page.getByTestId("promo-form");
}

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
    await promo(page).getByLabel("Promo code").fill(LUMI9_COUPON);
    await promo(page).getByRole("button", { name: "Apply" }).click();

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
    await promo(page).getByLabel("Promo code").fill(LUMI9_COUPON);
    await promo(page).getByRole("button", { name: "Apply" }).click();
    await expect(page.getByText(`“${LUMI9_COUPON}” applied`)).toBeVisible();

    // Leave the cart the way a shopper does — by pressing the CTA, which is a
    // client-side <Link>. That matters: the applied coupon lives in
    // `CartQuoteProvider`'s React state, and the provider is mounted in the root
    // layout. A soft navigation keeps it; `page.goto` would tear the provider
    // down and rebuild it with `coupon` back at "", which is a real gap in the
    // app (see the note below) but not what this test is about.
    // Scoped to `main`: `CheckoutCta` is rendered TWICE on this page — once by
    // CartView and once by CartDrawer, which lives in the root layout outside
    // <main>. An unscoped role query matches both and fails strict mode
    // immediately, which reads like a broken button rather than an ambiguous
    // selector.
    await page.locator("main").getByRole("link", { name: /^Checkout/ }).click();
    await expect(page).toHaveURL(/\/checkout$/);

    // Checkout renders the quote rather than computing its own total — the whole
    // point of `useQuote`. The code must be named on the discount line, or the
    // shopper cannot tell the coupon survived the navigation.
    await expect(page.getByText(`Discount (${LUMI9_COUPON})`)).toBeVisible();

    const priced = await quote(page, clientIp, LUMI9_COUPON);
    expect(priced.discount).toBe(COUPON_VALUE);

    expectNoNativeDialogs(page);
  });

  test("a code can be applied AT checkout, and applying one never places the order", async ({
    page,
    clientIp,
  }) => {
    await installDialogGuard(page);
    await addFirstPackToCart(page);
    await signUpViaApi(page, clientIp, {
      name: "Anitha Rajan",
      email: uniqueEmail("coupon-at-checkout"),
    });

    // Straight to checkout WITHOUT passing through /cart - the shopper who has a
    // code from an email or an influencer and never opened the cart screen. This
    // was a dead end until the box was rendered here too: the discount row and
    // the `couponCode` the checkout form submits were both already wired to the
    // quote, and there was simply nowhere to type. Her only route was back a
    // screen, and nothing on this one said so.
    await page.goto("/checkout");
    await expect(page).toHaveURL(/\/checkout$/);

    // FILL THE FORM FIRST, which is what makes the rest of this test mean
    // anything. The promo box sits INSIDE the checkout's <form>, so the hazard
    // it has to avoid is submitting that form - and an EMPTY form is refused by
    // its own validation, which would mask a broken Apply behind a rejection
    // that looks like nothing happening. Only a form that would otherwise go
    // through can prove Apply is inert.
    await page.getByPlaceholder("Email address").fill(uniqueEmail("checkout-addr"));
    await page.getByPlaceholder("First name").fill("Anitha");
    await page.getByPlaceholder("Last name").fill("Rajan");
    await page.getByPlaceholder("Address", { exact: true }).fill("14 Kamaraj Salai");
    await page.getByPlaceholder("City").fill("Coimbatore");
    await page.getByPlaceholder("State").fill("Tamil Nadu");
    await page.getByPlaceholder("PIN code").fill("641001");
    await page.getByPlaceholder("Phone").fill("9884230571");

    // `placeOrder` is a POST to /api/checkout, and a success then pushes to
    // /confirmation. Watching the REQUEST rather than the URL is what catches a
    // submission that fails for some later reason - the order is still placed.
    const placements: string[] = [];
    page.on("request", (r) => {
      if (r.method() === "POST" && new URL(r.url()).pathname === "/api/checkout") {
        placements.push(r.url());
      }
    });

    await promo(page).getByLabel("Promo code").fill(LUMI9_COUPON);
    await promo(page).getByRole("button", { name: "Apply" }).click();

    await expect(page.getByText(`Discount (${LUMI9_COUPON})`)).toBeVisible();
    const priced = await quote(page, clientIp, LUMI9_COUPON);
    expect(priced.discount).toBe(COUPON_VALUE);

    // The reason the box is a <div> and not a <form>. HTML has no nested form:
    // the parser drops the inner tag, leaving "Apply" as a submit button for the
    // OUTER one - so applying a coupon would PLACE THE ORDER, on a form the
    // shopper has just finished filling in.
    expect(placements, "Apply must not submit the checkout form").toEqual([]);
    await expect(page).toHaveURL(/\/checkout$/);

    // Enter is the same hazard by the other route - implicit submission - which
    // is why the component intercepts the key rather than leaving it to the
    // browser. It must apply the code and nothing else.
    await promo(page).getByRole("button", { name: "Remove" }).click();
    await expect(page.getByText(`Discount (${LUMI9_COUPON})`)).toBeHidden();

    await promo(page).getByLabel("Promo code").fill(LUMI9_COUPON);
    await promo(page).getByLabel("Promo code").press("Enter");
    await expect(page.getByText(`Discount (${LUMI9_COUPON})`)).toBeVisible();

    expect(placements, "Enter must not submit the checkout form").toEqual([]);
    await expect(page).toHaveURL(/\/checkout$/);

    expectNoNativeDialogs(page);
  });

  test("the coupon survives a reload, and Remove still removes it", async ({
    page,
    clientIp,
  }) => {
    await installDialogGuard(page);
    await addFirstPackToCart(page);
    await signUpViaApi(page, clientIp, {
      name: "Divya Menon",
      email: uniqueEmail("coupon-reload"),
    });

    await page.goto("/cart");
    await promo(page).getByLabel("Promo code").fill(LUMI9_COUPON);
    await promo(page).getByRole("button", { name: "Apply" }).click();
    await expect(page.getByText(`“${LUMI9_COUPON}” applied`)).toBeVisible();

    // The regression this covers: the coupon used to live ONLY in
    // `CartQuoteProvider`'s React state, so a hard navigation rebuilt the
    // provider with it gone. The shopper saw a higher total than the one she
    // had agreed to, and the checkout form then submitted no code at all — the
    // order was placed at full price.
    await page.reload();
    await expect(page.getByText(`“${LUMI9_COUPON}” applied`)).toBeVisible();

    // Straight into checkout, no soft navigation to carry state for us.
    await page.goto("/checkout");
    await expect(page.getByText(`Discount (${LUMI9_COUPON})`)).toBeVisible();

    // And the other half: removing it must actually remove it. This is what
    // breaks if the route ever collapses "?coupon=" (remove) into an absent
    // parameter (fall back to the cookie) — the code comes straight back.
    await page.goto("/cart");
    // Scoped: each cart LINE has a "Remove" button too, and Playwright matches
    // an accessible name by substring, so an unscoped query is ambiguous.
    await promo(page).getByRole("button", { name: "Remove" }).click();
    await expect(page.getByText(`“${LUMI9_COUPON}” applied`)).toHaveCount(0);

    await page.reload();
    await expect(page.getByText(`“${LUMI9_COUPON}” applied`)).toHaveCount(0);
    const cleared = await quote(page, clientIp);
    expect(cleared.couponCode ?? null, "a removed coupon must not come back").toBeNull();
    expect(cleared.discount).toBe(0);

    expectNoNativeDialogs(page);
  });

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
    await promo(page).getByLabel("Promo code").fill(FEMI9_COUPON);
    await promo(page).getByRole("button", { name: "Apply" }).click();
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
