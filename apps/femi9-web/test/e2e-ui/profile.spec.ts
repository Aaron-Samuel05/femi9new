import type { Page } from '@playwright/test'
import {
  test,
  expect,
  expectNoNativeDialogs,
  installDialogGuard,
  signUpViaApi,
  uniqueEmail,
  type Member,
} from './helpers'

/**
 * Profile management on /account.
 *
 * The screen this replaces edited a name with `prompt("Full name")`, added an
 * address with SIX chained prompts, reported every failure through `alert()` and
 * confirmed deletions with `confirm()`. So alongside the functional assertions,
 * every test here ends by proving no native dialog was opened at all — that is
 * checked continuously by `installDialogGuard`, which records a call instead of
 * letting it block the run.
 *
 * Sign-in is done through the API rather than the six sign-in screens: these
 * specs are about the dialogs, and re-driving onboarding first would only add
 * unrelated ways for them to fail. The signup UI is covered by its own specs.
 */

async function signIn(page: Page, clientIp: string, tag: string): Promise<Member> {
  await installDialogGuard(page)
  const member = await signUpViaApi(page, clientIp, {
    name: 'Kavya Subramanian',
    email: uniqueEmail(tag),
  })
  await page.goto('/account')
  await expect(page.locator('.m-identity__name')).toHaveText(member.name)
  return member
}

test.describe('profile management', () => {
  test('editing the name through the dialog persists across a reload', async ({ page, clientIp }) => {
    const member = await signIn(page, clientIp, 'profile-name')
    const newName = 'Kavya S Iyer'

    await page.getByRole('button', { name: 'Edit profile' }).click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('heading', { name: 'Edit your details' })).toBeVisible()

    // The form must prefill the RAW column. Prefilling the display placeholder is
    // how the old screen wrote "Femi9 member" into the name field for real.
    const nameField = dialog.getByLabel('Full name')
    await expect(nameField).toHaveValue(member.name)
    await expect(dialog.getByLabel('Email address')).toHaveValue(member.email)

    await nameField.fill(newName)
    await dialog.getByRole('button', { name: 'Save changes' }).click()

    await expect(dialog).toBeHidden()
    await expect(page.locator('.m-identity__name')).toHaveText(newName)
    await expect(page.locator('.m-title')).toHaveText('Welcome back, Kavya')

    // A reload is the only assertion that separates "the UI updated" from "the
    // server stored it".
    await page.reload()
    await expect(page.locator('.m-identity__name')).toHaveText(newName)
    await page.getByRole('tab', { name: /^Profile/ }).click()
    await expect(page.getByRole('tabpanel')).toContainText(newName)

    expectNoNativeDialogs(page)
  })

  test('editing the email through the dialog persists across a reload', async ({ page, clientIp }) => {
    await signIn(page, clientIp, 'profile-email')
    const newEmail = uniqueEmail('profile-email-2')

    await page.getByRole('button', { name: 'Edit profile' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Email address').fill(newEmail)
    await dialog.getByRole('button', { name: 'Save changes' }).click()
    await expect(dialog).toBeHidden()

    await page.reload()
    await page.getByRole('tab', { name: /^Profile/ }).click()
    await expect(page.getByRole('tabpanel')).toContainText(newEmail)

    expectNoNativeDialogs(page)
  })

  test('the dialog closes on Escape without saving', async ({ page, clientIp }) => {
    const member = await signIn(page, clientIp, 'profile-escape')

    await page.getByRole('button', { name: 'Edit profile' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Full name').fill('Discarded Name')
    await page.keyboard.press('Escape')

    await expect(dialog).toBeHidden()
    await expect(page.locator('.m-identity__name')).toHaveText(member.name)

    expectNoNativeDialogs(page)
  })

  test('a bad value is reported next to its field, not in an alert', async ({ page, clientIp }) => {
    await signIn(page, clientIp, 'profile-invalid')

    await page.getByRole('button', { name: 'Edit profile' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Email address').fill('not-an-email')
    await dialog.getByRole('button', { name: 'Save changes' }).click()

    // The dialog stays open, the message sits on the field, and nothing typed is
    // thrown away.
    await expect(dialog).toBeVisible()
    await expect(dialog.locator('.m-field__error')).toBeVisible()
    await expect(dialog.getByLabel('Email address')).toHaveValue('not-an-email')
    await expect(dialog.getByLabel('Email address')).toHaveAttribute('aria-invalid', 'true')

    expectNoNativeDialogs(page)
  })

  test('addresses: add two, promote the second to default, then delete it', async ({ page, clientIp }) => {
    await signIn(page, clientIp, 'address')

    await page.getByRole('tab', { name: /^Addresses/ }).click()
    const panel = page.getByRole('tabpanel')
    await expect(panel.getByRole('heading', { name: 'Saved addresses' })).toBeVisible()

    // ── The first address ─────────────────────────────────────────────────────
    // Scoped to the panel head: while the list is empty the empty state offers a
    // second "Add your first address" button, and an unscoped match hits both.
    await panel.locator('.acct-panel__head').getByRole('button', { name: 'Add address' }).click()
    await fillAddress(page, {
      label: 'Home',
      name: 'Kavya Subramanian',
      line: '12 Race Course Road, Gopalapuram',
      city: 'Coimbatore',
      state: 'Tamil Nadu',
      pincode: '641018',
      phone: '9884230571',
    })

    const home = page.locator('.acct-addr').filter({ hasText: 'Gopalapuram' })
    await expect(home).toBeVisible()
    // The first address a customer saves becomes the default on its own.
    await expect(home.locator('.m-chip--gold')).toContainText('Default')
    // The label must be the one she chose. Every address used to be forced to
    // 'Home' whatever the form said — here that happens to be right, so the
    // second address is the one that proves it.
    await expect(home.locator('.m-chip').first()).toHaveText('Home')

    // ── The second ────────────────────────────────────────────────────────────
    await panel.locator('.acct-panel__head').getByRole('button', { name: 'Add address' }).click()
    await fillAddress(page, {
      label: 'Work',
      name: 'Kavya Subramanian',
      line: '4th Floor, Prestige Palladium, Anna Salai',
      city: 'Chennai',
      state: 'Tamil Nadu',
      pincode: '600002',
      phone: '9884230572',
    })

    const work = page.locator('.acct-addr').filter({ hasText: 'Anna Salai' })
    await expect(work).toBeVisible()
    await expect(work.locator('.m-chip').first()).toHaveText('Work')
    await expect(work.locator('.m-chip--gold')).toHaveCount(0)
    await expect(work).toContainText('Chennai, Tamil Nadu 600002')

    // ── Promote it ────────────────────────────────────────────────────────────
    await work.getByRole('button', { name: 'Make this my default' }).click()
    await expect(work.locator('.m-chip--gold')).toContainText('Default')
    await expect(home.locator('.m-chip--gold')).toHaveCount(0)
    // Exactly one default, always — an account with none breaks checkout prefill.
    await expect(page.locator('.acct-addr .m-chip--gold')).toHaveCount(1)

    // ── Delete it, behind the inline confirm (never window.confirm) ───────────
    await work.getByRole('button', { name: 'Delete the Work address' }).click()
    await expect(work.getByRole('group', { name: 'Confirm deletion' })).toBeVisible()
    await work.getByRole('button', { name: 'Keep it' }).click()
    await expect(work).toBeVisible()

    await work.getByRole('button', { name: 'Delete the Work address' }).click()
    await work.getByRole('button', { name: 'Yes, delete' }).click()

    await expect(page.locator('.acct-addr').filter({ hasText: 'Anna Salai' })).toHaveCount(0)
    await expect(home).toBeVisible()
    // Deleting the only non-default must not leave the account defaultless.
    await expect(home.locator('.m-chip--gold')).toContainText('Default')

    await page.reload()
    await page.getByRole('tab', { name: /^Addresses/ }).click()
    await expect(page.locator('.acct-addr')).toHaveCount(1)

    expectNoNativeDialogs(page)
  })

  test('an address can be edited in place and keeps what was typed on a bad submit', async ({ page, clientIp }) => {
    await signIn(page, clientIp, 'address-edit')

    await page.getByRole('tab', { name: /^Addresses/ }).click()
    await page.getByRole('tabpanel').locator('.acct-panel__head').getByRole('button', { name: 'Add address' }).click()
    await fillAddress(page, {
      label: 'Home',
      name: 'Kavya Subramanian',
      line: '18 Bharathi Street, Adyar',
      city: 'Chennai',
      state: 'Tamil Nadu',
      pincode: '600020',
      phone: '9884230573',
    })

    const card = page.locator('.acct-addr').filter({ hasText: 'Bharathi Street' })
    await expect(card).toBeVisible()

    await card.getByRole('button', { name: 'Edit the Home address' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('heading', { name: 'Edit address' })).toBeVisible()

    // Every field prefills from the raw columns — the city picker included, which
    // is why the read model carries `cityRaw`/`state`/`pincode` separately from
    // the composed display line.
    await expect(dialog.getByLabel('Recipient name')).toHaveValue('Kavya Subramanian')
    await expect(dialog.getByLabel('City')).toHaveValue('Chennai')
    await expect(dialog.getByLabel(/^State/)).toHaveValue('Tamil Nadu')
    await expect(dialog.getByLabel(/^Pincode/)).toHaveValue('600020')

    // A deliberately bad pincode: the error is inline and the edits survive.
    await dialog.getByLabel('House / flat, street and area').fill('19 Bharathi Street, Adyar')
    await dialog.getByLabel(/^Pincode/).fill('600')
    await dialog.getByRole('button', { name: 'Save address' }).click()

    await expect(dialog).toBeVisible()
    await expect(dialog.locator('.m-field__error')).toBeVisible()
    await expect(dialog.getByLabel('House / flat, street and area')).toHaveValue('19 Bharathi Street, Adyar')

    await dialog.getByLabel(/^Pincode/).fill('600020')
    await dialog.getByRole('button', { name: 'Save address' }).click()
    await expect(dialog).toBeHidden()

    await page.reload()
    await page.getByRole('tab', { name: /^Addresses/ }).click()
    await expect(page.locator('.acct-addr')).toContainText('19 Bharathi Street, Adyar')

    expectNoNativeDialogs(page)
  })
})

/** Fill and submit the add/edit address dialog. Every field is on one screen. */
async function fillAddress(
  page: Page,
  values: {
    label: string
    name: string
    line: string
    city: string
    state: string
    pincode: string
    phone: string
  },
): Promise<void> {
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()

  await dialog.getByRole('group', { name: 'Label' }).getByRole('button', { name: values.label }).click()
  await dialog.getByLabel('Recipient name').fill(values.name)
  await dialog.getByLabel('House / flat, street and area').fill(values.line)
  await dialog.getByLabel('City').fill(values.city)
  await dialog.getByLabel(/^State/).selectOption(values.state)
  await dialog.getByLabel(/^Pincode/).fill(values.pincode)
  await dialog.getByLabel(/^Delivery phone/).fill(values.phone)

  await dialog.getByRole('button', { name: /^(Add|Save) address$/ }).click()
  await expect(dialog).toBeHidden()
}
