import { expect, test } from '@playwright/test'

/**
 * Browser E2E — drives the real storefront controls the way a shopper does.
 *
 * The HTTP suite (scripts/e2e-http.mjs) already proves the APIs. This one
 * exists for what only a browser can prove: that the buttons are wired to
 * those APIs and that the UI reflects the result.
 *
 * It assumes the catalog seed has run (prisma/seed.ts), so at least one
 * purchasable product card is on the home page.
 */

test.describe('storefront', () => {
  test('home page renders the catalog', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('.card').first()).toBeVisible()
    // Every card must offer its buy control — a card with no price or button
    // is the failure mode a screenshot review would miss.
    const firstCard = page.locator('.card').first()
    await expect(firstCard.locator('.price b')).not.toBeEmpty()
    await expect(firstCard.locator('button.add')).toBeEnabled()
  })

  test('Buy Now adds the item to the bag and the drawer totals it', async ({ page }) => {
    await page.goto('/')

    const card = page.locator('.card').filter({ has: page.locator('button.add:not([disabled])') }).first()
    const name = (await card.locator('h3').innerText()).trim()

    await card.locator('button.add').click()

    // The drawer opens optimistically, then the server cart lands.
    const drawer = page.locator('aside.drawer')
    await expect(drawer).toHaveClass(/open/)

    const line = drawer.locator('.ci').filter({ hasText: name })
    await expect(line).toBeVisible()
    await expect(drawer.locator('.drawer-foot .row.total span').last()).toContainText('Rs.')

    // The nav bag is the shopper's at-a-glance confirmation. Assert the
    // accessible name, not the badge glyph — the count span is aria-hidden.
    await expect(page.locator('button.cart-btn[aria-label^="Open bag"]')).toHaveAttribute(
      'aria-label',
      'Open bag, 1 item',
    )
  })

  test('quantity stepper and Remove update the bag', async ({ page }) => {
    await page.goto('/')
    await page.locator('.card button.add:not([disabled])').first().click()

    const drawer = page.locator('aside.drawer')
    const line = drawer.locator('.ci').first()
    await expect(line).toBeVisible()

    const priceBefore = await line.locator('.ci-price').innerText()

    await line.locator('.qty button[aria-label="Increase quantity"]').click()
    await expect(line.locator('.qty span')).toHaveText('2')
    // Two of the same item must cost more than one — this is the check that
    // catches a stepper wired to the UI but not to the server cart.
    await expect(line.locator('.ci-price')).not.toHaveText(priceBefore)

    await line.locator('.qty button[aria-label="Decrease quantity"]').click()
    await expect(line.locator('.qty span')).toHaveText('1')

    await line.locator('.ci-remove').click()
    await expect(drawer.locator('.cart-empty')).toBeVisible()
  })

  test('the bag survives a page reload', async ({ page }) => {
    await page.goto('/')
    await page.locator('.card button.add:not([disabled])').first().click()
    await expect(page.locator('aside.drawer .ci').first()).toBeVisible()

    await page.reload()
    await page.locator('.cart-btn[aria-label*="Open bag"]').click()
    await expect(page.locator('aside.drawer .ci').first()).toBeVisible()
  })

  test('checkout is reachable from the bag', async ({ page }) => {
    await page.goto('/')
    await page.locator('.card button.add:not([disabled])').first().click()

    await page.locator('aside.drawer .drawer-foot a.btn-primary').click()
    await expect(page).toHaveURL(/\/checkout/)

    // Scope to the shipping form: the footer newsletter is also a <form>, so a
    // bare locator('form') is a strict-mode violation on every page.
    const shipping = page.locator('form').filter({ hasText: 'Shipping details' })
    await expect(shipping).toBeVisible()
    // Reachable is not enough — the fields a shopper must fill have to be there.
    await expect(shipping.locator('input[autocomplete="name"]')).toBeVisible()
  })

  test('a product card links through to its detail page', async ({ page }) => {
    await page.goto('/')
    const card = page.locator('.card').first()
    const name = (await card.locator('h3').innerText()).trim()
    await card.locator('h3').click()

    await expect(page).toHaveURL(/\/product\//)
    await expect(page.getByRole('heading', { level: 1 })).toContainText(name)
  })
})

test.describe('cycle tracker', () => {
  test('predicts the next period from a submitted date', async ({ page }) => {
    await page.goto('/#tracker')

    const form = page.locator('form.cyc-setup')
    await form.scrollIntoViewIfNeeded()
    await expect(form).toBeVisible()

    await form.locator('#cyc-date').fill('2026-07-01')

    // The steppers are buttons, not inputs — exercise one so a broken handler
    // fails here rather than silently submitting the default. The value lives
    // in .cyc-step-val b; the buttons contain their own aria-hidden glyphs.
    const lengthGroup = page.locator('.cyc-stepper[aria-label="Cycle length"]')
    const value = lengthGroup.locator('.cyc-step-val b')
    const shown = Number(await value.innerText())
    await lengthGroup.locator('button[aria-label^="Increase"]').click()
    await expect(value).toHaveText(String(shown + 1))

    await form.locator('button.cyc-submit').click()

    // Submitting swaps the form out for the prediction panel.
    await expect(form).toBeHidden()
    await expect(page.locator('.cyc-week')).toBeVisible()
  })
})
