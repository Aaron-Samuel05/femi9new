import {
  test,
  expect,
  adminLinksOn,
  expectNoNativeDialogs,
  installDialogGuard,
  signUpViaApi,
  uniqueEmail,
} from './helpers'

/**
 * The ops console must not exist as far as a shopper is concerned.
 *
 * The member area was previously built on the ADMIN console's chrome, so a
 * customer's own profile page carried a literal "Admin dashboard" link in its
 * sidebar. The link is gone, but a link is a one-line regression: any track can
 * reintroduce one with a stray `<Link to="/admin">`. This spec is the standing
 * check that no customer-reachable page — signed out or signed in — offers a
 * route into /admin or /api/admin. The console itself lives in apps/admin
 * and has its own tests; what matters here is that the STOREFRONT never links
 * to it and no longer serves it.
 *
 * It also asserts the other half of the rule: a shopper who types the URL is
 * sent to her own account, not to a staff sign-in form she can never satisfy.
 */

const PUBLIC_PAGES = ['/', '/login', '/blog', '/affiliate', '/partner', '/periods-wall', '/checkout']
const MEMBER_PAGES = ['/account', '/dashboard']

test.describe('the ops console is invisible to customers', () => {
  test('no signed-out page links into /admin', async ({ page }) => {
    await installDialogGuard(page)

    for (const path of PUBLIC_PAGES) {
      const response = await page.goto(path)
      expect(response?.status(), `${path} did not render`).toBeLessThan(400)
      // Nav and Footer are server-rendered, so every anchor is in the document
      // the navigation resolved on — there is nothing async to wait for. (/login
      // renders neither: it is a standalone split card by design.)
      expect(await adminLinksOn(page), `${path} must not link into the ops console`).toEqual([])
    }

    // Product detail pages are generated from the catalog, so audit a real one
    // rather than assuming a slug.
    await page.goto('/')
    const firstProduct = page.locator('.card h3').first()
    await expect(firstProduct).toBeVisible()
    await firstProduct.click()
    await expect(page).toHaveURL(/\/product\//)
    expect(await adminLinksOn(page), 'a product page must not link into the ops console').toEqual([])

    expectNoNativeDialogs(page)
  })

  test('no signed-in member page links into /admin', async ({ page, clientIp }) => {
    await installDialogGuard(page)
    await signUpViaApi(page, clientIp, { name: 'Lakshmi Venkat', email: uniqueEmail('guard') })

    for (const path of MEMBER_PAGES) {
      await page.goto(path)
      await expect(page.locator('.m-identity__name')).toHaveText('Lakshmi Venkat')
      expect(await adminLinksOn(page), `${path} must not link into the ops console`).toEqual([])

      // The member sub-navigation is the exact list the old sidebar polluted.
      const subnav = page.getByRole('navigation', { name: 'Member sections' })
      await expect(subnav.getByRole('link')).toHaveCount(3)
      await expect(subnav).not.toContainText('Admin')
    }

    // The rebuilt chrome also drops the admin topbar it inherited, along with
    // the two controls that were permanently disabled with a "not available yet"
    // tooltip. A control that does nothing must not render at all.
    await page.goto('/account')
    await expect(page.locator('[title*="not available yet" i]')).toHaveCount(0)
    await expect(page.locator('.topbar, .sidebar, .sidebar-brand')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Search', exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Notifications', exact: true })).toHaveCount(0)

    expectNoNativeDialogs(page)
  })

  test('the storefront no longer serves the ops console at all', async ({ page, clientIp }) => {
    await installDialogGuard(page)
    await signUpViaApi(page, clientIp, { name: 'Lakshmi Venkat', email: uniqueEmail('guard-url') })

    // The console moved to its own app with its own per-brand cookies. This used
    // to assert a redirect to /account; now the surface is simply gone, and its
    // ABSENCE is the invariant — anything other than a 404 means it came back.
    // (With ADMIN_CONSOLE_URL set, /admin redirects off-site instead; the check
    //  below accepts that, because either way the storefront is not serving it.)
    for (const path of ['/admin', '/admin/orders', '/api/admin/orders']) {
      const response = await page.request.get(path, {
        headers: { 'x-forwarded-for': clientIp },
        maxRedirects: 0,
      })
      const status = response.status()
      expect(
        status === 404 || status === 307 || status === 308,
        `${path} should be gone from the storefront, got ${status}`,
      ).toBe(true)
      // If it redirects, it must be leaving for the console — never to a
      // storefront page pretending the console is still here.
      if (status !== 404) {
        expect(response.headers()['location'] ?? '').not.toMatch(/^\/(?!admin)/)
      }
    }

    expectNoNativeDialogs(page)
  })

  test('a signed-out visitor is bounced to sign-in with her destination kept', async ({ page }) => {
    await installDialogGuard(page)

    for (const path of MEMBER_PAGES) {
      await page.goto(path)
      // `next` must survive: dropping it is what used to strand a shopper on
      // /account after she asked for /dashboard.
      await expect(page).toHaveURL(new RegExp(`/login\\?next=${encodeURIComponent(path)}$`))
      await expect(page.getByRole('heading', { name: 'Sign in or create your account' })).toBeVisible()
    }

    // A signed-out visitor at /admin gets the staff form, not the customer one.
    await page.goto('/admin')
    await expect(page).toHaveURL(/\/admin\/login$/)

    expectNoNativeDialogs(page)
  })
})
