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
 * Signup by phone OTP, end to end.
 *
 * This is the flow the reported bug lived in: OTP signup persisted a phone and
 * nothing else, so a brand-new member landed on a page that greeted her as
 * "Femi9 member" with em-dashes where her email and number should have been.
 * The assertion that matters here is not "the page loaded" — it is that the
 * name SHE typed is the name rendered back to her.
 *
 * Requires a dev/mock server: the OTP provider must echo `devCode`, which the
 * sign-in screen surfaces in its dev-mode note.
 */

test.describe('signup — phone OTP', () => {
  test('captures a real name and email, and the member area renders them', async ({ page }) => {
    await installDialogGuard(page)

    const phone = uniquePhone()
    const email = uniqueEmail('otp')
    const name = 'Priya Nair'

    // ── Step 1: ask for a code ────────────────────────────────────────────────
    await page.goto('/login')
    await expect(page.getByRole('heading', { name: 'Sign in or create your account' })).toBeVisible()

    await page.getByLabel('Mobile number').fill(phone)
    await page.getByRole('button', { name: 'Send code' }).click()

    // ── Step 2: verify it ─────────────────────────────────────────────────────
    const codeField = page.getByLabel('Verification code')
    await expect(codeField).toBeVisible()
    // The screen must say where the code went — a code step that does not name
    // the number is how a shopper ends up typing a code sent to an old handset.
    await expect(page.locator('.auth-sentto')).toContainText(phone)

    await codeField.fill(await readDevCode(page))
    await page.getByRole('button', { name: 'Verify & continue' }).click()

    // ── Step 3: onboarding, NOT the account page ──────────────────────────────
    // A fresh OTP account has no name and no email, so it must be gated here.
    await page.waitForURL(/\/welcome/)
    await expect(page.getByRole('heading', { name: 'Complete your profile' })).toBeVisible()

    const nameField = page.getByLabel('Full name')
    const emailField = page.getByLabel('Email address')
    await expect(nameField).toBeVisible()
    await expect(emailField).toBeVisible()
    // The number is already verified, so onboarding must NOT ask for it again.
    await expect(page.getByLabel('Mobile number')).toHaveCount(0)

    await nameField.fill(name)
    await emailField.fill(email)
    await page.getByRole('button', { name: 'Save and continue' }).click()

    // ── Step 4: the member area, wearing her actual identity ──────────────────
    await page.waitForURL(/\/account/)

    // THE bug, asserted three ways: the greeting, the identity block and the
    // absence of the placeholder that used to stand in for all of it.
    await expect(page.locator('.m-title')).toHaveText(`Welcome back, ${name.split(' ')[0]}`)
    await expect(page.locator('.m-identity__name')).toHaveText(name)
    // Scoped to the member page: these are the two placeholders the old read
    // model emitted, and neither may survive anywhere in this chrome.
    await expect(page.locator('.m-page')).not.toContainText('Femi9 member')
    await expect(page.locator('.m-page')).not.toContainText('Your account')

    // ── Step 5: the details actually persisted, not just echoed ───────────────
    await page.getByRole('tab', { name: /^Profile/ }).click()
    const profile = page.getByRole('tabpanel')
    await expect(profile).toContainText(name)
    await expect(profile).toContainText(email)
    // Formatted for reading, never a lone em-dash standing in for a real number.
    await expect(profile).toContainText(displayPhone(phone))
    // The phone was proved by the OTP, so it must read as verified — and the
    // email, which was only typed, must not.
    await expect(profile.locator('.m-status--success')).toHaveCount(1)
    await expect(profile).toContainText('Unverified')

    expectNoNativeDialogs(page)
  })

  test('a completed member is never shown /welcome again', async ({ page }) => {
    await installDialogGuard(page)

    const phone = uniquePhone()
    const email = uniqueEmail('otp-gate')

    await page.goto('/login')
    await page.getByLabel('Mobile number').fill(phone)
    await page.getByRole('button', { name: 'Send code' }).click()
    await page.getByLabel('Verification code').fill(await readDevCode(page))
    await page.getByRole('button', { name: 'Verify & continue' }).click()

    await page.waitForURL(/\/welcome/)
    await page.getByLabel('Full name').fill('Anjali Menon')
    await page.getByLabel('Email address').fill(email)
    await page.getByRole('button', { name: 'Save and continue' }).click()
    await page.waitForURL(/\/account/)

    // Typing the URL by hand must forward, not re-ask for details she has given.
    await page.goto('/welcome')
    await page.waitForURL(/\/account/)
    await expect(page.locator('.m-identity__name')).toHaveText('Anjali Menon')

    expectNoNativeDialogs(page)
  })

  test('onboarding cannot be skipped by typing a member URL', async ({ page, clientIp }) => {
    await installDialogGuard(page)

    // Stop deliberately short of onboarding: a verified session, an empty profile.
    const phone = uniquePhone()
    const headers = { 'x-forwarded-for': clientIp }
    const requested = await page.request.post('/api/auth/otp/request', { data: { phone }, headers })
    expect(requested.status(), await requested.text()).toBe(200)
    const { devCode } = (await requested.json()) as { devCode?: string }
    const verified = await page.request.post('/api/auth/otp/verify', {
      data: { phone, code: devCode },
      headers,
    })
    expect(verified.status(), await verified.text()).toBe(200)
    expect((await verified.json()).needsProfile).toBe(true)

    for (const target of ['/account', '/dashboard']) {
      await page.goto(target)
      await page.waitForURL(/\/welcome/)
      await expect(page.getByRole('heading', { name: 'Complete your profile' })).toBeVisible()
    }

    expectNoNativeDialogs(page)
  })
})
