import { expect, test, type Page } from '@playwright/test'

/**
 * Mobile audit — walks every page at phone widths and fails on content that
 * spills outside the viewport.
 *
 * Why not `document.scrollWidth > innerWidth`: base.css sets `overflow-x: clip`
 * on html and body, so a too-wide element never becomes scrollable — it is
 * silently CUT OFF instead. The page-level check would report all-clear while
 * the shopper cannot see half a price. So overflow is measured per element.
 *
 * Excluded from the measurement, because none of it is a defect:
 *  - anything clipped by an ancestor's own overflow (decorative art deliberately
 *    bleeding out of a section that hides it). The walk stops before body/html,
 *    whose clip is what hides the real bugs.
 *  - position:fixed panels parked off-canvas (the cart drawer, mobile menu).
 *  - aria-hidden / zero-size / undisplayed nodes.
 */

const PHONES = [
  { name: 'iPhone SE', width: 375, height: 667 },
  { name: 'Pixel 5', width: 393, height: 851 },
]

interface Offender {
  tag: string
  cls: string
  text: string
  right: number
  width: number
}

async function overflowingElements(page: Page, viewportWidth: number): Promise<Offender[]> {
  return page.evaluate((vw) => {
    const CLIPPING = new Set(['hidden', 'clip', 'auto', 'scroll'])
    const out: Offender[] = []

    for (const el of Array.from(document.body.querySelectorAll<HTMLElement>('*'))) {
      const rect = el.getBoundingClientRect()
      if (rect.width < 1 || rect.height < 1) continue
      const overhang = rect.right - vw
      if (overhang <= 1) continue

      const style = getComputedStyle(el)
      if (style.position === 'fixed') continue
      if (style.visibility === 'hidden' || style.opacity === '0') continue
      if (el.closest('[aria-hidden="true"]')) continue

      // Clipped by an ancestor? Stop before body — the html/body clip is
      // exactly what makes this class of bug invisible in review.
      let clipped = false
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const ps = getComputedStyle(p)
        if (CLIPPING.has(ps.overflowX) || CLIPPING.has(ps.overflow)) {
          clipped = true
          break
        }
      }
      if (clipped) continue

      out.push({
        tag: el.tagName.toLowerCase(),
        cls: (el.getAttribute('class') || '').slice(0, 70),
        text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 50),
        right: Math.round(rect.right),
        width: Math.round(rect.width),
      })
    }

    // Widest first: the outermost container is usually the actual cause.
    return out.sort((a, b) => b.right - a.right).slice(0, 10)
  }, viewportWidth)
}

function report(route: string, phone: string, offenders: Offender[]): string {
  return [
    `${route} overflows the ${phone} viewport:`,
    ...offenders.map((o) => `  <${o.tag} class="${o.cls}"> right=${o.right}px width=${o.width}px "${o.text}"`),
  ].join('\n')
}

/** Public routes. Product and blog slugs are resolved from the live APIs. */
const PUBLIC_ROUTES = [
  '/',
  '/about',
  '/shop',
  '/blog',
  '/affiliate',
  '/partner',
  '/periods-wall',
  '/privacy',
  '/thara',
  '/login',
]

for (const phone of PHONES) {
  test.describe(`mobile · ${phone.name} (${phone.width}px)`, () => {
    test.use({ viewport: { width: phone.width, height: phone.height } })

    for (const route of PUBLIC_ROUTES) {
      test(`${route} fits the viewport`, async ({ page }) => {
        const response = await page.goto(route)
        expect(response?.status(), `${route} did not render`).toBeLessThan(400)
        // Let late-loading images settle before measuring.
        await page.waitForLoadState('networkidle').catch(() => {})

        const offenders = await overflowingElements(page, phone.width)
        expect(offenders, report(route, phone.name, offenders)).toEqual([])
      })
    }

    /**
     * /about gets its own check because the overflow sweep cannot see its worst
     * failure mode. The founder collage is absolutely positioned inside
     * `.fl-about`, which sets `overflow: hidden` — so a portrait sized for the
     * desktop canvas would be silently amputated rather than reported. This
     * measures the pieces against their frame and attaches a screenshot.
     */
    test('/about keeps the founder collage inside its frame', async ({ page }, testInfo) => {
      await page.goto('/about')
      await page.waitForLoadState('networkidle').catch(() => {})

      // The section reveals on intersection; make sure it has run.
      await page.locator('.fl-about').scrollIntoViewIfNeeded()
      await expect(page.locator('.fl-about[data-visible="true"]')).toBeVisible()

      const collage = await page.locator('.fl-about__people').boundingBox()
      expect(collage, 'collage has no box').not.toBeNull()

      const figures = page.locator('.fl-founder')
      await expect(figures).toHaveCount(3)

      for (let i = 0; i < 3; i += 1) {
        const figure = figures.nth(i)
        const label = (await figure.getAttribute('class')) ?? `figure ${i}`
        const box = await figure.boundingBox()
        expect(box, `${label} has no box`).not.toBeNull()

        // Every portrait must sit inside the collage frame horizontally, and
        // inside the viewport, or the clip is eating part of a founder.
        expect(box!.x, `${label} starts left of the collage`).toBeGreaterThanOrEqual(collage!.x - 1)
        expect(
          Math.round(box!.x + box!.width),
          `${label} is cut off by the collage's right edge`,
        ).toBeLessThanOrEqual(Math.round(collage!.x + collage!.width) + 1)
        expect(Math.round(box!.x + box!.width), `${label} runs past the screen`).toBeLessThanOrEqual(phone.width)
        expect(box!.height, `${label} collapsed`).toBeGreaterThan(80)
      }

      // The copy has to survive too — heading, both paragraphs and the CTA.
      await expect(page.locator('.fl-about__copy h2')).toBeVisible()
      await expect(page.locator('.fl-about__copy .fl-btn')).toBeVisible()
      const cta = await page.locator('.fl-about__copy .fl-btn').boundingBox()
      expect(Math.round(cta!.x + cta!.width), 'the About CTA runs past the screen').toBeLessThanOrEqual(phone.width)

      await testInfo.attach(`about-${phone.name.replace(/\s+/g, '-')}`, {
        body: await page.screenshot({ fullPage: true }),
        contentType: 'image/png',
      })
    })

    test('product and blog detail pages fit the viewport', async ({ page, request }) => {
      const products = await (await request.get('/api/products')).json()
      const blog = await (await request.get('/api/blog')).json()
      const routes = [
        `/product/${products[0].id}`,
        `/blog/${(blog.posts ?? blog)[0].slug}`,
      ]

      for (const route of routes) {
        await page.goto(route)
        await page.waitForLoadState('networkidle').catch(() => {})
        const offenders = await overflowingElements(page, phone.width)
        expect(offenders, report(route, phone.name, offenders)).toEqual([])
      }
    })

    test('the bag and checkout fit the viewport', async ({ page }) => {
      await page.goto('/')
      await page.locator('.card button.add:not([disabled])').first().click()

      const drawer = page.locator('aside.drawer')
      await expect(drawer).toHaveClass(/open/)
      // The open drawer must not exceed the screen: it is width:min(440px,94vw).
      const box = await drawer.boundingBox()
      expect(box, 'drawer has no box').not.toBeNull()
      expect(Math.round(box!.width), 'drawer is wider than the screen').toBeLessThanOrEqual(phone.width)

      // The CTA has to be reachable with a thumb, not just present: assert it
      // sits fully inside the viewport rather than clipped by the screen edge.
      const cta = page.locator('aside.drawer .drawer-foot a.btn-primary')
      const ctaBox = await cta.boundingBox()
      expect(ctaBox, 'checkout CTA has no box').not.toBeNull()
      expect(ctaBox!.x, 'checkout CTA starts off-screen').toBeGreaterThanOrEqual(0)
      expect(Math.round(ctaBox!.x + ctaBox!.width), 'checkout CTA runs past the screen edge')
        .toBeLessThanOrEqual(phone.width)

      // Navigate directly for the layout audit. Clicking through is covered by
      // storefront.spec; doing it here as well made this test depend on the
      // Lenis smooth-scroll settling under the pointer, which is a different
      // failure than "does /checkout fit a phone".
      await page.goto('/checkout')
      await page.waitForLoadState('networkidle').catch(() => {})
      const offenders = await overflowingElements(page, phone.width)
      expect(offenders, report('/checkout', phone.name, offenders)).toEqual([])
    })

    test('signed-in member pages fit the viewport', async ({ page, request }) => {
      // Mock OTP login (dev/mock providers only) so the gated pages are
      // audited as a member actually sees them, not as a login redirect.
      const phoneNumber = `9${String(Date.now()).slice(-9)}`
      const requested = await request.post('/api/auth/otp/request', { data: { phone: phoneNumber } })
      const { devCode } = await requested.json()
      expect(devCode, 'mock OTP not returned — is ALLOW_MOCK_PROVIDERS set?').toBeTruthy()
      await request.post('/api/auth/otp/verify', { data: { phone: phoneNumber, code: devCode } })

      // Hand the session cookies to the browser context.
      await page.context().addCookies(await request.storageState().then((s) => s.cookies))

      for (const route of ['/account', '/dashboard', '/welcome']) {
        const response = await page.goto(route)
        expect(response?.status(), `${route} did not render`).toBeLessThan(400)
        await page.waitForLoadState('networkidle').catch(() => {})
        const offenders = await overflowingElements(page, phone.width)
        expect(offenders, report(route, phone.name, offenders)).toEqual([])
      }
    })
  })
}
