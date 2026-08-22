# Femi9 landing page: complete UI E2E contract

## Purpose and scope

This document is the end-to-end design and behaviour contract for the current `femi9-next` landing page at `/`. It is intentionally a regression specification, not a redesign brief: existing typefaces, colors, composition, spacing, copy, imagery, and motion are the source of truth.

The companion artifact, [`current-landing-page.html`](./current-landing-page.html), is a static rendering of the same page with the current compiled CSS inlined and asset paths mapped to `../public/assets`. It preserves the current visual design and the lightweight hero, navigation, reveal, anchor-scroll, and testimonial interactions. The production Next.js route remains the source of truth for data-backed and application interactions such as the cart, cycle persistence, newsletter submission, authentication, and routing.

Scope is strictly `femi9-next`. No sibling application or repository folder is part of this contract.

## Source-of-truth review

The following `femi9-next` documentation was reviewed before defining this contract:

- `DEPLOY.md`
- `design_system.md` and its copy at `docs/design_system.md`
- `PRODUCT_BENEFITS_PROMPTS.md`
- `Femi9_Website_Blogs_Extracted.md`
- `docs/phases/README.md` and phase 1–5 documents
- `docs/thara/PROGRAM.md` and `docs/thara/terms/v1.md`
- `docs/superpowers/plans/2026-08-12-thara-model-A-enrollment.md`
- `docs/superpowers/specs/2026-08-12-thara-model-A-enrollment-design.md`
- `infra/migrate/README.md` and `infra/terraform/README.md`

The landing and SEO implementation reviewed includes:

- `app/layout.tsx` for global metadata, font loading, theme color, preloads, and Organization JSON-LD
- `app/(store)/page.tsx` for landing metadata and server data
- `app/(store)/layout.tsx` and `next.config.ts` for the storefront shell and delivery/security behaviour
- `src/screens/Home.tsx`, `src/components/Nav.tsx`, `src/components/Footer.tsx`, `src/components/ProductCard.tsx`, and `src/components/CycleTracker.tsx`
- the landing, responsive, cycle, cart, navigation, and global styles under `src/styles`
- metadata implementations for about, product listing/detail, blog listing/detail, privacy, and welcome routes
- the existing Playwright suite under `test/e2e-ui`

No `app/robots.ts`, `app/robots.txt`, `app/sitemap.ts`, or `app/sitemap.xml` exists at the time of this review. That is a site-level SEO follow-up; tests below prevent the landing page's existing metadata from regressing.

## Immutable visual contract

### Typography

| Surface | Required family |
| --- | --- |
| Interface, navigation, body, buttons, forms | `Urbanist` |
| Landing hero and section display headings | `Instrument Sans` |
| Editorial accent where already authored | `Fraunces` |
| Existing utility surfaces that explicitly use them | `Plus Jakarta Sans` or `Inter` |

Tests must assert computed families on representative elements after `document.fonts.ready`. They must never replace the families with screenshot-test defaults. Font load failure is a test failure, not an acceptable baseline update.

### Color and layout

- Keep the current deep-plum navigation and branded surfaces, cream/lavender backgrounds, plum text, and golden-yellow primary calls to action.
- `.fl-shell` is the landing content container, with a maximum width of 1512px and the current responsive gutters: desktop 80px, tablet 48px, mobile 28px.
- Preserve the current breakpoint behaviour around 1180px, 900px, 620px, and the narrow-phone range below 620px.
- Do not allow horizontal document overflow at any supported viewport.
- Do not normalize section heights, card aspect ratios, image crops, or mobile stacking in a way that changes the authored composition.

### Required page order

1. Sticky navigation
2. Two-scene hero
3. Products (`#products`)
4. Why Femi9 (`#why`)
5. About Femi9 (`#about-femi9`)
6. Journal (`#journal`)
7. Cycle tracker (`#tracker`, wrapped by `.fl-cycle`)
8. Testimonials (`#testimonials`)
9. Opportunities (`#opportunities`)
10. Footer

## Test environment

Use the existing Playwright configuration and isolated E2E database. Start the app with mock OTP/payment providers and seed the catalog before UI tests.

```powershell
npm run db:generate
npm run db:seed
npm run e2e:seed-product
$env:E2E_BASE_URL = 'http://127.0.0.1:3100'
npm run test:ui
```

The existing configuration uses one worker because guest-cart tests share state. Each test that changes cart, identity, cycle, review, blog, or settings data must create or reset its own fixture rather than depend on ordering.

Static artifact review:

```powershell
python -m http.server 3200 --bind 127.0.0.1
# Open http://127.0.0.1:3200/docs/current-landing-page.html
```

## Viewport matrix

Run semantic and overflow checks at every width. Run visual snapshots at the starred sizes.

| Viewport | Purpose |
| --- | --- |
| 320 × 568 | Minimum supported narrow phone |
| 360 × 800 | Common Android phone |
| 390 × 844 ★ | Primary touch/mobile baseline |
| 620 × 900 | Narrow-to-medium breakpoint edge |
| 768 × 1024 ★ | Portrait tablet |
| 900 × 1024 | Tablet/rail breakpoint edge |
| 1024 × 768 | Small landscape/desktop |
| 1280 × 800 | Standard laptop |
| 1440 × 900 ★ | Primary desktop baseline |
| 1920 × 1080 | Wide desktop and max-shell behaviour |

For the 390px project use `hasTouch: true`, `isMobile: true`, and `deviceScaleFactor: 2`, matching the existing mobile-quality tests. Add a reduced-motion project with `reducedMotion: 'reduce'`.

## Global acceptance gates

Every landing-page test run must prove:

- HTTP status is below 400 and the page reaches a stable rendered state.
- No uncaught page error, hydration error, failed same-origin asset request, or unexpected console error occurs.
- Exactly one visible `h1` exists.
- All meaningful images load; decorative images have empty alt text and meaningful images have non-empty alt text.
- `document.documentElement.scrollWidth === document.documentElement.clientWidth` at all target widths.
- Keyboard focus is visible and follows reading order.
- Hidden hero scenes and the closed mobile menu are `inert` and absent from the tab sequence.
- No native `alert`, `confirm`, or `prompt` is opened.
- Mobile inputs compute to at least 16px and actionable touch targets meet the existing 44px quality gate.
- Motion is removed or made immediate when `prefers-reduced-motion: reduce` is active.

## Detailed E2E scenarios

### 1. Document, metadata, and structured data

1. Navigate to `/` and assert the title is `Femi9 Sanitary Pads | Rash-Free, Cotton-Soft Period Care India`.
2. Assert the description contains cotton-soft, breathable, absorbent/rash-free period care and Made in India positioning.
3. Assert one canonical link with `https://femi9.in`.
4. Assert the production page is not `noindex`.
5. Parse the `application/ld+json` block and assert a valid `Organization` with Femi9 name, canonical URL, support phone, and support email.
6. Assert `<html lang="en">`, the responsive viewport meta, theme color `#352D78`, and a usable favicon.
7. Assert the lifestyle hero and logo image preloads match the actual rendered `srcset` assets.

### 2. Typography and design tokens

1. Wait for `document.fonts.ready`.
2. Assert `Urbanist` on body, navigation links, buttons, product copy, tracker controls, and footer copy.
3. Assert `Instrument Sans` on both hero headings and representative landing section headings.
4. Assert computed primary CTA background/text, nav background, body background, border radii, and shell gutters against checked-in constants.
5. Fail if a representative element falls back to Times, Arial, or a generic family because a font import was removed.

### 3. Navigation

Desktop:

1. Logo links to `/` and has accessible name `Femi9 home`.
2. Primary links appear in order: Products, Why Femi9, About Us, Journal, Opportunities.
3. Account and bag controls have accessible names; the burger is not displayed.
4. Scrolling beyond 12px applies the scrolled/sticky visual state without layout jump.
5. `Why Femi9` lands below the sticky header, with the heading unobscured.

Mobile:

1. Primary link row is hidden and burger is displayed.
2. The closed menu has `inert`, `aria-expanded=false`, and no focusable descendants in the tab order.
3. Activating the burger opens the menu, removes `inert`, changes the accessible label to `Close menu`, and exposes primary plus Periods Wall, Affiliate, sign-in/account, and conditional Thara links.
4. Escape, selecting a menu link, or selecting account closes it.
5. The menu does not cause horizontal overflow or trap focus.

### 4. Hero

1. Initial scene is the lifestyle scene, owns the single page `h1`, and shows `Organic Pads That Feel Like Nothing At All.`
2. Initial LCP image has alt text `Woman seated on a Femi9 organic pad pack`, eager/high-priority delivery, and a screen-appropriate WebP derivative.
3. The other scene is `aria-hidden=true` and `inert`.
4. Pager one is active initially. Clicking pager two displays `Confidence That Lasts All Day.`, updates active state and `aria-labelledby`, and makes the lifestyle scene inert.
5. Without reduced motion, the scene changes after approximately 6000ms. With reduced motion, it does not auto-advance.
6. Both Buy Now buttons scroll to `#products` without changing route.
7. Desktop renders the decorative cloud/pad layers; mobile does not download the layers hidden below 769px.
8. Copy, badges, proof labels, artwork crop, button geometry, and pager placement match the approved snapshots.

### 5. Products

1. `#products` renders up to the current four featured products from seeded data and never an empty broken grid.
2. Each card has a loaded image, name, pack/variant details, formatted rupee price, and enabled Buy Now control when purchasable.
3. Product name/image navigation opens `/product/{id}` and the destination `h1` matches the selected product.
4. Buy Now opens the cart drawer, adds exactly one line, updates the accessible bag count, and shows the correct total.
5. Quantity increase/decrease, remove, reload persistence, and checkout navigation continue to pass the existing storefront tests.
6. Desktop hover may change card emphasis only inside the authored card bounds. Touch mode must not depend on hover.
7. `View All Products` navigates to `/products`.

### 6. Why Femi9

1. Six benefit items appear in the authored order: Cotton-Soft Comfort; Breathable Design; Reliable Absorbency & Leak Protection; Rash-Conscious Comfort; Freshness & Odour Control; Made for Everyday Movement.
2. Each item shows the current image, title, and supporting copy with no text clipping.
3. Desktop arrangement and mobile stack match snapshots; every item becomes visible through scroll reveal or immediately under reduced motion.

### 7. About Femi9

1. Assert the heading `Designed for Her. Driven by Care. Made to Move With Her.` and both current paragraphs.
2. `Know More About Femi9` links to `/about`.
3. Mobile padding and heading size follow the responsive stylesheet, with no inherited desktop 80px gutter.

### 8. Journal

1. With three or more approved posts, render the newest/featured three supplied by the service with valid title, image, summary/date if authored, and `/blog/{slug}` link.
2. With fewer than three posts, render the authored fallback cards without broken images or dead links.
3. `View All` navigates to `/blog`.
4. Dynamic titles may be masked in screenshot tests, but structure, geometry, image ratio, and typography must not be masked.

### 9. Cycle tracker

Setup state:

1. Date input has a maximum equal to the visitor's local calendar day.
2. Cycle length defaults to 28 and stays within the shared `CYCLE_MIN`/`CYCLE_MAX`; period length defaults to 5 and stays within 3–8.
3. Increase/decrease controls update the live value and disable at bounds.
4. Empty/invalid date and future date show inline accessible errors; no native dialog appears.

Result state:

1. A valid submission immediately replaces the setup card with a prediction, seven-day strip, phase text/legend, and product tie-in.
2. Expected next-period date, days-until value, cycle day, and phase agree with `src/lib/cycle-math.ts` for fixed-date fixtures.
3. Signed-out response displays the device-only/sign-in status and stores `femi9.cycle.guest` locally.
4. Signed-in consent-on, consent-off, API-error, retry, and saved states show truthful status copy.
5. `Update my dates` restores the submitted values; `Subscribe & save` reaches `#products`.
6. Phase information remains understandable without relying on color alone, especially below 480px.

### 10. Testimonials

1. With at least three approved reviews, use up to six database reviews; otherwise use the authored three-card fallback.
2. Duplicate the selected set once for the continuous rail without creating duplicate interactive focus targets.
3. Previous/next controls have accessible names.
4. Desktop controls advance exactly one 421px card pitch and wrap within the unique set.
5. At or below 900px, controls use native horizontal scrolling by one visible-card pitch and do not apply the desktop transform.
6. Images load, five-star label remains accessible, and names/quotes do not overflow their cards.

### 11. Opportunities

1. Assert heading and current partner copy.
2. Assert the four authored metrics: 5,000+ women entrepreneurs, 12 districts, Rs.8,000+ average monthly earning, and 100% flexible hours.
3. Both `Become A Partner` and `How It Works` navigate to `/partner`.
4. Image, ribbon, grid/stack, and CTA styling match desktop/mobile baselines.

### 12. Footer and newsletter

1. Footer contains current logo, brand copy, shop/Femi9/support columns, address, copyright year, and privacy link.
2. Phone, email, WhatsApp, Instagram, Facebook, YouTube, and LinkedIn destinations are correct; external links use `noopener noreferrer`.
3. Empty and malformed newsletter email produce an inline accessible validation state.
4. Successful subscription shows success feedback and prevents a duplicate submission; API failure shows retryable inline feedback without clearing the email.
5. Conditional product and Thara links follow public settings without causing column reflow outside the snapshot tolerance.

### 13. Cart drawer and toast

1. Bag button opens an `aria-modal` dialog; closed state is `aria-hidden` and `inert`.
2. Overlay, close button, Escape, and focus restoration close the drawer.
3. Empty state and populated state use the current copy and geometry.
4. Add/update/remove requests reconcile optimistic UI with server response; an error never leaves a false count or total.
5. Toast is announced, dismisses automatically, and respects reduced motion.

### 14. Accessibility

1. Landmarks are ordered header/navigation, main sections, footer; headings have no skipped structure that obscures section relationships.
2. All controls have an accessible name and each form error is associated with its field.
3. Tab order follows the visible layout at desktop and mobile.
4. Focus rings are visible against plum, cream, lavender, white, and gold surfaces.
5. Automated axe/WCAG checks have zero serious or critical violations; manually verify contrast for small gold/plum text and controls.
6. Zoom to 200% at 1280px: content reflows without loss, overlap, or two-dimensional scrolling.
7. Screen-reader state changes are announced for cart count, tracker stepper/results, newsletter result, and errors.

### 15. Responsive and visual regression

For each starred viewport:

1. Capture the top navigation/hero before the 6s rotation by freezing timers or explicitly selecting the lifestyle pager.
2. Capture each major section after setting its reveal state through real scrolling.
3. Capture the product hero as a separate intentional state.
4. Mask only unstable database text/date values. Do not mask typography, cards, artwork, CTA geometry, section backgrounds, or responsive stacking.
5. Use a low pixel threshold (start at 0.5% changed pixels) and require visual review for any baseline update.
6. Store desktop, tablet, mobile, and reduced-motion baselines separately.

### 16. Network, resilience, and performance

1. No image request returns 4xx/5xx and no visible image ends with `naturalWidth === 0`.
2. Product/blog/review service failure must produce an intentional fallback or error boundary, never a partially blank page. The current local database TLS failure is an environment failure and must not be accepted as a production UI baseline.
3. The mobile initial viewport must not request desktop-only hero cloud/pad decorations.
4. The selected lifestyle derivative must be at least 95% of rendered width × DPR and less than 2× that need.
5. Images outside the initial viewport remain lazy, carry intrinsic dimensions/aspect ratio, and do not create visible layout shifts.
6. Track LCP, CLS, and INP in CI or a scheduled production run. Recommended gates: LCP ≤2.5s, CLS ≤0.1, INP ≤200ms at the 75th percentile.
7. CSP must continue allowing the exact Google font, image, API, and payment origins required by the page without adding wildcards.

## Playwright implementation skeleton

Add landing-specific coverage beside the existing `storefront.spec.ts`, `mobile.spec.ts`, and `mobile-quality.spec.ts`. Prefer semantic locators and computed-style contracts over generated class order.

```ts
import { expect, test } from '@playwright/test'

test.describe('landing visual contract', () => {
  test('metadata, typography, structure, and overflow', async ({ page }) => {
    const response = await page.goto('/')
    expect(response?.status()).toBeLessThan(400)
    await page.evaluate(() => document.fonts.ready)

    await expect(page).toHaveTitle('Femi9 Sanitary Pads | Rash-Free, Cotton-Soft Period Care India')
    await expect(page.locator('h1')).toHaveCount(1)
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://femi9.in')

    const contract = await page.evaluate(() => ({
      bodyFont: getComputedStyle(document.body).fontFamily,
      heroFont: getComputedStyle(document.querySelector('.fl-hero h1')!).fontFamily,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      order: [...document.querySelectorAll('main > section, main > .fl-cycle, main > footer')]
        .map((node) => node.id || node.className),
    }))

    expect(contract.bodyFont).toContain('Urbanist')
    expect(contract.heroFont).toContain('Instrument Sans')
    expect(contract.overflow).toBe(0)
    expect(contract.order).toEqual([
      expect.stringContaining('fl-hero'), 'products', 'why', 'about-femi9',
      'journal', 'fl-cycle', 'testimonials', 'opportunities', 'footer',
    ])
  })
})
```

## Existing coverage and required additions

Already covered in the repository:

- catalog rendering, add-to-cart, quantity, removal, reload persistence, checkout reachability, and product detail navigation
- cycle prediction happy path
- multi-route mobile overflow and thumb-usability checks
- mobile image sizing and hero derivative selection
- authentication/member and admin-route safeguards

Add or expand coverage for:

- exact metadata and JSON-LD contract
- exact fonts/design tokens and section order
- both hero scenes, timer, pager, inert state, and reduced motion
- desktop/mobile navigation disclosure behaviour
- complete Why/About/Journal/Testimonials/Opportunities/Footer contracts
- tracker validation and all persistence/consent/error states
- newsletter success/error states
- visual baselines at desktop, tablet, mobile, and reduced motion
- console, asset, and service-fallback assertions

## Definition of done

A landing-page change is complete only when:

- TypeScript, unit, relevant integration, HTTP E2E, and Playwright UI checks pass in an environment with working test database credentials.
- All viewport, accessibility, metadata, and resilience gates above pass.
- Screenshot differences are reviewed and intentional; font/design changes require explicit approval.
- The static HTML artifact is regenerated if the current landing markup or CSS changes.
- The contract and implementation agree; known exceptions are documented with an owner and follow-up issue.

Severity guidance: broken purchase/navigation, missing content, inaccessible controls, noindex/canonical errors, or a page-level mobile overflow are release blockers. Font substitution, unintended layout shift, incorrect image crop, broken motion preference, or section-level visual drift are high priority. Minor sub-pixel differences are normal only when they remain within the approved snapshot threshold.
