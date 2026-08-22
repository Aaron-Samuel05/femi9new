import type { Page } from '@playwright/test'
import {
  test,
  expect,
  expectNoNativeDialogs,
  installDialogGuard,
  longDate,
  shiftDayKey,
  signUpViaApi,
  uniqueEmail,
} from './helpers'

/**
 * Cycle tracking on /dashboard.
 *
 * Three things this proves that a unit test cannot:
 *
 *  • The consent gate is real. Menstrual data is health data, and nothing is
 *    written until it is accepted — the logging form does not even render first.
 *  • Logging one period moves the whole page: the first-run card gives way to a
 *    prediction, and the calendar and "what is coming" panels appear with it.
 *  • A mistyped date is correctable. It used to be permanent, and one wrong
 *    start date skews every prediction the account will ever make.
 *
 * The date is derived from the form's own `max` attribute, which the server sets
 * from the user's local today. Computing it from `new Date()` in the test process
 * is exactly the IST off-by-one that this rebuild fixed.
 */

async function signInToDashboard(page: Page, clientIp: string, tag: string): Promise<void> {
  await installDialogGuard(page)
  await signUpViaApi(page, clientIp, { name: 'Sneha Balakrishnan', email: uniqueEmail(tag) })
  await page.goto('/dashboard')
  await expect(page.locator('.m-identity__name')).toHaveText('Sneha Balakrishnan')
}

/** The reference day the SERVER handed the form, so no clock skew can bite. */
async function todayKey(page: Page): Promise<string> {
  const max = await page.locator('#dash-start').getAttribute('max')
  expect(max, 'the log form must be seeded with the user local today').toMatch(/^\d{4}-\d{2}-\d{2}$/)
  return max!
}

/**
 * Panel scopes. Several headings and empty states are deliberately repeated
 * across the page (the onboarding card and the logging panel both say "Log your
 * first period"; the period and symptom histories share "Nothing logged yet"),
 * so every assertion on those names is scoped to the panel it is about.
 */
const FIRST_RUN_CARD = (page: Page) => page.locator('.dash-onboard')
const PERIOD_PANEL = (page: Page) => page.locator('section[aria-labelledby="dash-hist-h"]')

/**
 * "You are on day N", tolerating N±1.
 *
 * The date we log is taken from the form, which the browser seeds with the
 * VIEWER's local day; the prediction counts from `today` resolved server-side in
 * STORE_TIMEZONE, because `User` carries no timezone column yet (a known, flagged
 * gap in this build). On a machine outside IST those two can name adjacent days.
 * The ±1 is that gap and nothing else — an off-by-two, a 0 or a NaN still fails.
 */
function cycleDayPattern(day: number): RegExp {
  return new RegExp(`You are on day (${day - 1}|${day}|${day + 1}) of`)
}

async function grantConsent(page: Page): Promise<void> {
  const gate = page.locator('.dash-consent')
  await expect(gate).toBeVisible()
  // Nothing may be logged before consent — the form is not even on the page.
  await expect(page.locator('#dash-start')).toHaveCount(0)

  await gate.getByRole('button', { name: 'Turn on cycle tracking' }).click()
  await expect(gate).toBeHidden()
  await expect(page.locator('#dash-start')).toBeVisible()
}

test.describe('cycle tracking', () => {
  test('consent, log a period, watch the prediction and calendar appear, edit it, delete it', async ({
    page,
    clientIp,
  }) => {
    await signInToDashboard(page, clientIp, 'cycle')

    // ── Consent ───────────────────────────────────────────────────────────────
    // The gate must say what is stored and that withdrawing erases it.
    const gate = page.locator('.dash-consent')
    await expect(gate).toContainText('AES-256-GCM')
    await expect(gate).toContainText('deletes every period and symptom you have logged')
    await grantConsent(page)

    // With consent but no data, the page invites a first log rather than
    // predicting from an average nobody measured. Scoped to the onboarding card:
    // the logging panel's own heading says the same words at first run.
    await expect(FIRST_RUN_CARD(page).getByRole('heading', { name: 'Log your first period' })).toBeVisible()
    await expect(page.locator('.dash-hero')).toHaveCount(0)
    await expect(page.locator('.dash-cal')).toHaveCount(0)

    // ── Log a period ──────────────────────────────────────────────────────────
    const today = await todayKey(page)
    const started = shiftDayKey(today, -10)

    await page.locator('#dash-start').fill(started)
    await page.locator('#dash-len').fill('5')
    await page.getByRole('button', { name: 'Log this period' }).click()

    // ── The prediction and calendar land ──────────────────────────────────────
    const hero = page.locator('.dash-hero')
    await expect(hero).toBeVisible()
    await expect(hero.getByRole('heading')).toHaveText(
      /^(Period in \d+ days?|Your period is expected today)$/,
    )
    // Day 11: the log was 10 days ago and the start day itself counts as day 1.
    await expect(hero).toContainText(cycleDayPattern(11))

    const calendar = page.locator('.dash-cal')
    await expect(calendar).toBeVisible()
    await expect(calendar.locator('.dash-cal__day.is-today')).toHaveCount(1)
    // Colour is never the only signal, so every phase in the legend is named.
    await expect(calendar.locator('.dash-cal__legend li').first()).toBeVisible()

    await expect(page.getByRole('heading', { name: 'What is coming' })).toBeVisible()
    await expect(page.locator('.dash-upcoming__item').first()).toBeVisible()

    // ── It is in the history, exactly as entered ──────────────────────────────
    const history = page.locator('.dash-log__item')
    await expect(history).toHaveCount(1)
    await expect(history.first()).toContainText(longDate(started))
    await expect(history.first()).toContainText('Lasted 5 days')

    // ── Edit it ───────────────────────────────────────────────────────────────
    const corrected = shiftDayKey(today, -14)
    await page.getByRole('button', { name: `Edit the period starting ${longDate(started)}` }).click()

    const editor = page.locator('.dash-log__edit')
    await expect(editor).toBeVisible()
    await editor.locator('input[type="date"]').fill(corrected)
    await editor.locator('input[type="number"]').fill('6')
    await editor.getByRole('button', { name: 'Save' }).click()

    await expect(page.locator('.dash-log__item')).toHaveCount(1)
    await expect(page.locator('.dash-log__item').first()).toContainText(longDate(corrected))
    await expect(page.locator('.dash-log__item').first()).toContainText('Lasted 6 days')
    // The correction has to reach the prediction, not just the list.
    await expect(hero).toContainText(cycleDayPattern(15))

    // ── Delete it, behind an inline confirm ───────────────────────────────────
    await page.getByRole('button', { name: `Remove the period starting ${longDate(corrected)}` }).click()
    await expect(page.locator('.m-confirm')).toContainText(`Remove the period starting ${longDate(corrected)}?`)
    await page.getByRole('button', { name: 'Keep it' }).click()
    await expect(page.locator('.dash-log__item')).toHaveCount(1)

    await page.getByRole('button', { name: `Remove the period starting ${longDate(corrected)}` }).click()
    await page.getByRole('button', { name: 'Yes, remove' }).click()

    // Scoped to the period panel: the symptom panel has its own empty state with
    // the same heading, and both are showing by now.
    await expect(PERIOD_PANEL(page).getByRole('heading', { name: 'Nothing logged yet' })).toBeVisible()
    // With the last entry gone the page returns to its first-run state rather
    // than predicting from nothing.
    await expect(page.locator('.dash-hero')).toHaveCount(0)

    expectNoNativeDialogs(page)
  })

  test('the same start date twice does not create a second entry', async ({ page, clientIp }) => {
    await signInToDashboard(page, clientIp, 'cycle-dupe')
    await grantConsent(page)

    const started = shiftDayKey(await todayKey(page), -7)

    for (let attempt = 0; attempt < 2; attempt += 1) {
      await page.locator('#dash-start').fill(started)
      await page.getByRole('button', { name: 'Log this period' }).click()
      await expect(page.locator('.dash-log__item')).toHaveCount(1)
    }

    // Two rows with the same start used to give a zero-length gap, an average
    // cycle of 0, and "Period in NaN days" across the entire dashboard.
    await expect(page.locator('.dash-hero').getByRole('heading')).toHaveText(
      /^(Period in \d+ days?|Your period is expected today)$/,
    )
    await expect(page.locator('.m-page')).not.toContainText('NaN')
    await expect(page.locator('.m-page')).not.toContainText('Invalid Date')

    expectNoNativeDialogs(page)
  })

  test('symptoms can be logged and removed', async ({ page, clientIp }) => {
    await signInToDashboard(page, clientIp, 'cycle-symptom')
    await grantConsent(page)

    // The two logs are independent: symptoms are loggable before any period is,
    // which the old screen hid behind the first-run state.
    const logger = page.locator('section[aria-labelledby="dash-logs-h"]')
    await expect(logger.locator('#dash-sdate')).toBeVisible()

    const cramps = logger.getByRole('button', { name: 'Cramps', exact: true })
    await cramps.click()
    await expect(cramps).toHaveAttribute('aria-pressed', 'true')

    // Multi-select, unlike the single-choice control this replaced.
    const bloating = logger.getByRole('button', { name: 'Bloating', exact: true })
    await bloating.click()
    await expect(bloating).toHaveAttribute('aria-pressed', 'true')
    await expect(cramps).toHaveAttribute('aria-pressed', 'true')

    await logger.getByRole('group', { name: 'How strong was cramps?' }).getByRole('button', { name: 'Strong' }).click()
    await logger.getByRole('button', { name: 'Medium', exact: true }).click() // flow scale
    await logger.locator('#dash-note').fill('Warm compress helped')
    await logger.getByRole('button', { name: 'Save this entry' }).click()

    const history = page.locator('section[aria-labelledby="dash-symp-h"]')
    await expect(history.locator('.dash-log__item').filter({ hasText: 'Cramps' })).toHaveCount(1)
    await expect(history.locator('.dash-log__item').filter({ hasText: 'Bloating' })).toHaveCount(1)
    await expect(history).toContainText('Warm compress helped')
    // Entries logged today belong to the cycle the user is in now, and the panel
    // must say which group it is showing rather than implying it.
    await expect(history).toContainText('This cycle')

    const crampsRow = history.locator('.dash-log__item').filter({ hasText: 'Cramps' })
    await crampsRow.locator('.m-iconbtn--danger').click()
    await crampsRow.getByRole('button', { name: 'Yes, remove' }).click()

    await expect(history.locator('.dash-log__item').filter({ hasText: 'Cramps' })).toHaveCount(0)
    await expect(history.locator('.dash-log__item').filter({ hasText: 'Bloating' })).toHaveCount(1)

    expectNoNativeDialogs(page)
  })

  test('withdrawing consent erases the logged history', async ({ page, clientIp }) => {
    await signInToDashboard(page, clientIp, 'cycle-withdraw')
    await grantConsent(page)

    await page.locator('#dash-start').fill(shiftDayKey(await todayKey(page), -5))
    await page.getByRole('button', { name: 'Log this period' }).click()
    await expect(page.locator('.dash-log__item')).toHaveCount(1)

    const privacy = page.locator('.dash-privacy')
    await expect(privacy).toBeVisible()
    await privacy.getByRole('button', { name: /Turn off tracking/ }).click()
    // Withdrawal is destructive, so it is confirmed in place — never by confirm()
    // — and the copy has to admit that it deletes rather than just switches off.
    await expect(privacy).toContainText('permanently delete every period and symptom')
    await privacy.getByRole('button', { name: 'Yes, delete it all' }).click()

    // Consent off means the gate is back and the entries are gone, not hidden.
    await expect(page.locator('.dash-consent')).toBeVisible()
    await expect(page.locator('#dash-start')).toHaveCount(0)

    await page.reload()
    await expect(page.locator('.dash-consent')).toBeVisible()
    await page.locator('.dash-consent').getByRole('button', { name: 'Turn on cycle tracking' }).click()
    // Back to first run: withdrawal deleted the rows, it did not just hide them.
    await expect(FIRST_RUN_CARD(page).getByRole('heading', { name: 'Log your first period' })).toBeVisible()
    await expect(page.locator('.dash-log__item')).toHaveCount(0)

    expectNoNativeDialogs(page)
  })
})
