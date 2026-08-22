import {
  test,
  expect,
  displayPhone,
  expectNoNativeDialogs,
  installDialogGuard,
  readDevCode,
  uniqueEmail,
  uniquePhone,
} from './helpers'

/**
 * Signup by email magic link, end to end.
 *
 * The magic-link path used to be the worse of the two: it created a User with an
 * email and nothing else — no name, and no reachable phone number at all, so the
 * account could never be texted about a delivery. Onboarding now collects both,
 * and the number is attached only after a real OTP challenge (an unverified
 * phone on the User row is worse than none, because checkout attribution keys
 * on it).
 *
 * Requires a dev/mock server: the email provider must echo `devLink`.
 */

test.describe('signup — email magic link', () => {
  test('collects a name and a verified mobile, and both persist', async ({ page }) => {
    await installDialogGuard(page)

    const email = uniqueEmail('link')
    const phone = uniquePhone()
    const name = 'Meera Raghavan'

    // ── Step 1: request the link ──────────────────────────────────────────────
    await page.goto('/login')
    await page.getByRole('button', { name: 'Email link' }).click()
    await page.getByLabel('Email address').fill(email)
    await page.getByRole('button', { name: 'Email me a link' }).click()

    // ── Step 2: follow it ─────────────────────────────────────────────────────
    const devLink = page.locator('.auth-dev a')
    await expect(devLink, 'the API must echo a devLink — is the server in mock email mode?').toBeVisible()
    const href = await devLink.getAttribute('href')
    expect(href).toBeTruthy()

    // The link is minted against NEXT_PUBLIC_SITE_URL, which need not be the host
    // under test. Follow the path on THIS origin, or the session cookie lands on
    // a domain the browser will never send back.
    const target = new URL(href!, page.url())
    await page.goto(`${target.pathname}${target.search}`)

    // An email-only account has no name and no phone, so it must be gated.
    await page.waitForURL(/\/welcome/)
    await expect(page.getByRole('heading', { name: 'Complete your profile' })).toBeVisible()

    // ── Step 3: the details step — name and mobile, but NOT the email again ───
    await expect(page.getByLabel('Email address')).toHaveCount(0)
    await page.getByLabel('Full name').fill(name)
    await page.getByLabel('Mobile number').fill(phone)
    await page.getByRole('button', { name: 'Save and send code' }).click()

    // ── Step 4: prove the number ──────────────────────────────────────────────
    await expect(page.getByRole('heading', { name: 'Verify your mobile number' })).toBeVisible()
    await expect(page.locator('.auth-sentto')).toContainText(phone)

    await page.getByLabel('Verification code').fill(await readDevCode(page))
    await page.getByRole('button', { name: 'Verify and finish' }).click()

    // ── Step 5: everything captured is rendered back ──────────────────────────
    await page.waitForURL(/\/account/)
    await expect(page.locator('.m-title')).toHaveText(`Welcome back, ${name.split(' ')[0]}`)
    await expect(page.locator('.m-identity__name')).toHaveText(name)
    await expect(page.locator('.m-page')).not.toContainText('Femi9 member')

    await page.getByRole('tab', { name: /^Profile/ }).click()
    const profile = page.getByRole('tabpanel')
    await expect(profile).toContainText(name)
    await expect(profile).toContainText(email)
    await expect(profile).toContainText(displayPhone(phone))

    // ── Step 6: it survives a full round trip to the server ───────────────────
    await page.reload()
    await expect(page.locator('.m-identity__name')).toHaveText(name)
    await page.getByRole('tab', { name: /^Profile/ }).click()
    await expect(page.getByRole('tabpanel')).toContainText(email)
    await expect(page.getByRole('tabpanel')).toContainText(displayPhone(phone))

    expectNoNativeDialogs(page)
  })

  test('the mobile step can change its number before verifying', async ({ page }) => {
    await installDialogGuard(page)

    const email = uniqueEmail('link-change')
    const wrongPhone = uniquePhone()
    const rightPhone = uniquePhone()

    await page.goto('/login')
    await page.getByRole('button', { name: 'Email link' }).click()
    await page.getByLabel('Email address').fill(email)
    await page.getByRole('button', { name: 'Email me a link' }).click()

    const href = await page.locator('.auth-dev a').getAttribute('href')
    const target = new URL(href!, page.url())
    await page.goto(`${target.pathname}${target.search}`)
    await page.waitForURL(/\/welcome/)

    await page.getByLabel('Full name').fill('Divya Krishnan')
    await page.getByLabel('Mobile number').fill(wrongPhone)
    await page.getByRole('button', { name: 'Save and send code' }).click()
    await expect(page.locator('.auth-sentto')).toContainText(wrongPhone)

    // A mistyped number must be correctable without abandoning the account.
    await page.getByRole('button', { name: 'Change number' }).click()
    const phoneField = page.getByLabel('Mobile number')
    await expect(phoneField).toBeVisible()
    // The name was committed before the challenge, so it is no longer asked for.
    await expect(page.getByLabel('Full name')).toHaveCount(0)

    await phoneField.fill(rightPhone)
    await page.getByRole('button', { name: 'Save and send code' }).click()
    await expect(page.locator('.auth-sentto')).toContainText(rightPhone)

    await page.getByLabel('Verification code').fill(await readDevCode(page))
    await page.getByRole('button', { name: 'Verify and finish' }).click()

    await page.waitForURL(/\/account/)
    await page.getByRole('tab', { name: /^Profile/ }).click()
    const profile = page.getByRole('tabpanel')
    await expect(profile).toContainText(displayPhone(rightPhone))
    await expect(profile).not.toContainText(displayPhone(wrongPhone))

    expectNoNativeDialogs(page)
  })
})
