import { expect, test, type Page } from '@playwright/test'

/**
 * Mobile quality gates that overflow alone does not catch.
 *
 * mobile.spec.ts answers "does the page fit the screen". This answers "can it be
 * used once it fits" — the three defects that make a fitting page unusable on a
 * phone:
 *
 *  1. Tap targets under 44x44 CSS px. Below that, thumbs miss. (WCAG 2.2 AA sets
 *     24px as the floor; 44px is the platform guidance both Apple and Google
 *     publish, and it is what this design should hold to.)
 *  2. Form controls under 16px font-size. iOS Safari zooms the whole viewport in
 *     when you focus one, and it never zooms back out — the shopper is left
 *     panning a 1.4x page mid-checkout. This is the single most common mobile
 *     checkout defect and it is invisible on Android and in desktop devtools.
 *  3. Images with no intrinsic size. Without width/height (or an aspect-ratio),
 *     the browser reserves nothing and the content jumps when the image lands.
 *
 * Every check reports each offender with the selector and measured value, so a
 * failure names the element to fix rather than just the page.
 */

const PHONE = { width: 390, height: 844 }

/**
 * Touch emulation is not optional here. The fixes this suite guards are written
 * as `@media (pointer: coarse)` — deliberately, so touch tablets are covered
 * too — and that query does NOT match a default Playwright context. Without
 * `hasTouch`, every one of those rules is invisible and the suite reports
 * failures that no real phone has. `deviceScaleFactor: 2` likewise decides which
 * srcset rung the browser picks.
 */
const TOUCH = { hasTouch: true, isMobile: true, deviceScaleFactor: 2 }

interface Offender {
  sel: string
  detail: string
}

/** A readable selector for the failure message. */
const SELECTOR_FN = `(el) => {
  const id = el.id ? '#' + el.id : ''
  const cls = (el.getAttribute('class') || '').trim().split(/\\s+/).filter(Boolean).slice(0, 2)
  return el.tagName.toLowerCase() + id + (cls.length ? '.' + cls.join('.') : '')
}`

async function smallTapTargets(page: Page): Promise<Offender[]> {
  return page.evaluate(`(() => {
    const sel = ${SELECTOR_FN}
    const MIN = 44
    const out = []
    const nodes = document.querySelectorAll(
      'a[href], button, input:not([type=hidden]), select, textarea, [role=button], [role=tab], [role=switch], summary'
    )
    for (const el of nodes) {
      const style = getComputedStyle(el)
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue
      if (el.closest('[aria-hidden="true"]')) continue
      if (el.hasAttribute('disabled')) continue
      const r = el.getBoundingClientRect()
      if (r.width < 1 || r.height < 1) continue
      // An inline link inside a paragraph is a reading affordance, not a control;
      // WCAG exempts it and shrinking body copy to hit 44px would be worse.
      if (el.tagName === 'A' && style.display.startsWith('inline') && el.closest('p, li')) continue
      if (r.width >= MIN && r.height >= MIN) continue
      out.push({ sel: sel(el), detail: Math.round(r.width) + 'x' + Math.round(r.height) + 'px' })
    }
    return out.slice(0, 15)
  })()`) as Promise<Offender[]>
}

async function zoomingInputs(page: Page): Promise<Offender[]> {
  return page.evaluate(`(() => {
    const sel = ${SELECTOR_FN}
    const out = []
    for (const el of document.querySelectorAll('input:not([type=hidden]), select, textarea')) {
      const style = getComputedStyle(el)
      if (style.display === 'none' || style.visibility === 'hidden') continue
      const size = parseFloat(style.fontSize)
      if (size >= 16) continue
      out.push({ sel: sel(el), detail: style.fontSize })
    }
    return out
  })()`) as Promise<Offender[]>
}

async function unsizedImages(page: Page): Promise<Offender[]> {
  return page.evaluate(`(() => {
    const sel = ${SELECTOR_FN}
    const out = []
    for (const el of document.querySelectorAll('img')) {
      const style = getComputedStyle(el)
      if (style.display === 'none' || style.visibility === 'hidden') continue
      if (style.position === 'absolute' || style.position === 'fixed') continue
      const r = el.getBoundingClientRect()
      if (r.width < 24 || r.height < 24) continue
      const sized = el.hasAttribute('width') && el.hasAttribute('height')
      if (sized || style.aspectRatio !== 'auto') continue
      out.push({ sel: sel(el), detail: (el.getAttribute('src') || '').slice(-46) })
    }
    return out.slice(0, 15)
  })()`) as Promise<Offender[]>
}

/** Every image the page asked for actually resolved. */
async function brokenImages(page: Page): Promise<Offender[]> {
  return page.evaluate(`(() => {
    const sel = ${SELECTOR_FN}
    const out = []
    for (const el of document.querySelectorAll('img')) {
      if (!el.currentSrc && !el.getAttribute('src')) continue
      if (el.complete && el.naturalWidth > 0) continue
      if (!el.complete) continue
      out.push({ sel: sel(el), detail: el.currentSrc || el.getAttribute('src') || '' })
    }
    return out
  })()`) as Promise<Offender[]>
}

function report(kind: string, route: string, offenders: Offender[]): string {
  return [
    `${route} — ${offenders.length} ${kind}:`,
    ...offenders.map((o) => `  ${o.sel}  ${o.detail}`),
  ].join('\n')
}

const ROUTES = [
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
  '/checkout',
]

test.describe(`mobile quality · ${PHONE.width}px`, () => {
  test.use({ viewport: PHONE, ...TOUCH })

  for (const route of ROUTES) {
    test(`${route} is usable with a thumb`, async ({ page }) => {
      const response = await page.goto(route)
      expect(response?.status(), `${route} did not render`).toBeLessThan(400)
      await page.waitForLoadState('networkidle').catch(() => {})

      const [taps, inputs, broken] = await Promise.all([
        smallTapTargets(page),
        zoomingInputs(page),
        brokenImages(page),
      ])

      expect(broken, report('images failed to load', route, broken)).toEqual([])
      expect(inputs, report('controls below 16px (iOS zooms on focus)', route, inputs)).toEqual([])
      expect(taps, report('tap targets under 44px', route, taps)).toEqual([])
    })
  }

  test('the landing page reserves space for its images', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle').catch(() => {})
    // Reveal the lazy sections so their images are measured too.
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await page.waitForLoadState('networkidle').catch(() => {})
    const unsized = await unsizedImages(page)
    expect(unsized, report('images without intrinsic size (layout shift)', '/', unsized)).toEqual([])
  })

  test('the hero serves a derivative matched to the screen', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle').catch(() => {})

    const hero = page.locator('.fl-hero__lifestyle')
    await expect(hero).toBeVisible()

    const picked = await hero.evaluate((el: HTMLImageElement) => ({
      currentSrc: el.currentSrc,
      renderedWidth: el.getBoundingClientRect().width,
      dpr: window.devicePixelRatio,
    }))

    expect(picked.currentSrc, 'hero did not resolve a derivative').toMatch(/hero-lifestyle-\d+\.webp$/)

    // Read the real file width off the filename. `naturalWidth` is NOT usable
    // here: on an element with a `w`-descriptor srcset the browser reports it
    // density-corrected (a 640px file on a 2x screen reads as 320), so it can
    // never distinguish "correct rung" from "half resolution".
    const served = Number(picked.currentSrc.match(/-(\d+)\.webp$/)![1])
    const needed = picked.renderedWidth * picked.dpr

    // Enough pixels to be sharp at this device's density…
    expect(served, `hero served ${served}px for a ${Math.round(needed)}px slot — it will look soft`)
      .toBeGreaterThanOrEqual(needed * 0.95)
    // …and not so many that the phone pays for the desktop file.
    expect(served, `hero served ${served}px for a ${Math.round(needed)}px slot — wasted bytes`)
      .toBeLessThan(needed * 2)
  })
})
