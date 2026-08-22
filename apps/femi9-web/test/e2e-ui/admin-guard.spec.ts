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
 * route into /admin, /api/admin or /admin/login.
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

  test('a signed-in customer who types /admin is sent to her own account', async ({ page, clientIp }) => {
    await installDialogGuard(page)
    await signUpViaApi(page, clientIp, { name: 'Lakshmi Venkat', email: uniqueEmail('guard-url') })

    for (const path of ['/admin', '/admin/orders', '/admin/settings']) {
      await page.goto(path)
      // Not /admin/login: the ops cookie is a different name with a different
      // audience, so that form is a dead end for a shopper.
      await expect(page).toHaveURL(/\/account$/)
      await expect(page.locator('.m-identity__name')).toHaveText('Lakshmi Venkat')
    }

    // And her customer session buys her nothing from the admin API.
    const response = await page.request.get('/api/admin/orders', {
      headers: { 'x-forwarded-for': clientIp },
    })
    expect(response.status()).toBe(401)

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
