import { expect, test, type Page } from '@playwright/test'
import { setUpVault } from './helpers/vault'

async function createCaseWithDeadline(page: Page): Promise<void> {
  await page.getByTestId('new-case-fab').click()
  await page.getByTestId('chip-state-CA').click()
  await page.getByTestId('county-input').fill('Los Angeles')
  await page.getByTestId('wizard-continue').click()
  await page.getByTestId('chip-case-type-Civil').click()
  await page.getByTestId('plaintiff-name-input').fill('Maria Hartley')
  await page.getByTestId('defendant-name-input').fill('R. Cordova')
  await page.getByTestId('wizard-continue').click()
  await page.getByTestId('wizard-continue').click()
  await page.getByTestId('wizard-create').click()
  await page.getByTestId('case-row').first().click()
  await expect(page.getByTestId('screen-case-dashboard')).toBeVisible()

  // A service date far in the past guarantees the calculated deadline is overdue,
  // so the alerts card has something genuinely urgent to report.
  await page.getByTestId('log-service-date-prompt').click()
  await page.getByTestId('log-service-date-input').fill('2020-01-06')
  await page.getByTestId('log-service-date-submit').click()
  await expect(page.getByTestId('log-service-date-success')).toBeVisible()
  await page.getByTestId('log-service-date-done').click()
}

test('no alerts card renders when there are no deadlines needing attention', async ({ page }) => {
  await setUpVault(page)
  await page.getByTestId('nav-deadlines').click()
  await expect(page.getByTestId('deadlines-empty')).toBeVisible()
  await expect(page.getByTestId('deadline-alerts-card')).toHaveCount(0)
})

test('a real overdue deadline surfaces a genuine summary on the Deadlines screen', async ({ page }) => {
  await setUpVault(page)
  await createCaseWithDeadline(page)

  await page.getByTestId('nav-deadlines').click()
  await expect(page.getByTestId('deadline-alerts-card')).toBeVisible()
  await expect(page.getByTestId('deadline-alerts-summary')).toContainText('overdue')
})

test('granting permission fires a real OS notification through the service worker', async ({ page, context }) => {
  // A genuinely granted permission, via the browser's own permission system — not a
  // stubbed Notification object — so this exercises the real showLocalNotification
  // path (service-worker registration.showNotification) end to end.
  await context.grantPermissions(['notifications'])

  await setUpVault(page)
  await createCaseWithDeadline(page)
  await page.getByTestId('nav-deadlines').click()

  await expect(page.getByTestId('deadline-alerts-notify')).toBeVisible()
  await page.getByTestId('deadline-alerts-notify').click()

  // Read back what the service worker actually holds, rather than trusting the click.
  const shown = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready
    const notes = await reg.getNotifications({ tag: 'plcm-deadline-alert' })
    return notes.map((n) => ({ title: n.title, body: n.body }))
  })

  expect(shown.length).toBeGreaterThan(0)
  expect(shown[0].title).toMatch(/overdue deadline/)
  expect(shown[0].body).toMatch(/due /)
})
