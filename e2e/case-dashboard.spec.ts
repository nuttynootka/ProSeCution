import { expect, test } from '@playwright/test'
import { setUpVault } from './helpers/vault'

async function createCase(page: import('@playwright/test').Page) {
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
  await expect(page.getByTestId('case-row')).toHaveCount(1)
}

test('opening a case from the list shows its real dashboard', async ({ page }) => {
  await setUpVault(page)
  await createCase(page)

  await page.getByTestId('case-row').click()

  await expect(page.getByTestId('screen-case-dashboard')).toBeVisible()
  // A brand-new case: pleadings stage, the real computed score for that stage with
  // no deadlines yet (Chunk 47's computePostureScore floor, not a placeholder), and
  // zero everywhere real data doesn't exist yet.
  await expect(page.getByTestId('posture-score')).toHaveText('10')
  await expect(page.getByText('Pleadings', { exact: true })).toBeVisible()
  await expect(page.getByTestId('stat-deadlines')).toContainText('0')

  // Case creation and both parties, most recent first.
  const rows = page.getByTestId('activity-row')
  await expect(rows).toHaveCount(3)
  await expect(rows.nth(0)).toContainText('Defendant added')
  await expect(rows.nth(1)).toContainText('Plaintiff added')
  await expect(rows.nth(2)).toContainText('Case created')
})

test('the Cases tab stays highlighted while viewing a case detail', async ({ page }) => {
  await setUpVault(page)
  await createCase(page)
  await page.getByTestId('case-row').click()

  await expect(page.getByTestId('nav-cases')).toHaveAttribute('aria-current', 'page')
})

test('back from the dashboard returns to the case list', async ({ page }) => {
  await setUpVault(page)
  await createCase(page)
  await page.getByTestId('case-row').click()
  await expect(page.getByTestId('screen-case-dashboard')).toBeVisible()

  await page.getByTestId('dashboard-back').click()

  await expect(page.getByTestId('case-list')).toBeVisible()
})

test('an unknown case id shows a not-found state instead of crashing', async ({ page }) => {
  await setUpVault(page)
  await page.goto('/#/cases/does-not-exist')

  await expect(page.getByTestId('case-not-found')).toBeVisible()
})
