import { expect, test, type Page } from '@playwright/test'
import { setUpVault } from './helpers/vault'

async function createCase(page: Page, state: string, county: string, plaintiff: string, defendant: string): Promise<void> {
  await page.getByTestId('nav-cases').click()
  await page.getByTestId('new-case-fab').click()
  await page.getByTestId(`chip-state-${state}`).click()
  await page.getByTestId('county-input').fill(county)
  await page.getByTestId('wizard-continue').click()
  await page.getByTestId('chip-case-type-Civil').click()
  await page.getByTestId('plaintiff-name-input').fill(plaintiff)
  await page.getByTestId('defendant-name-input').fill(defendant)
  await page.getByTestId('wizard-continue').click()
  await page.getByTestId('wizard-continue').click()
  await page.getByTestId('wizard-create').click()
  await expect(page.getByTestId('screen-cases')).toBeVisible()
}

test('shows an honest empty state when there are no cases yet', async ({ page }) => {
  await setUpVault(page)
  await page.getByTestId('nav-counsel').click()
  await expect(page.getByTestId('screen-counsel-empty')).toBeVisible()
})

test('defaults to the Drafting tab, scoped to the first case, and switches to Opposing audit', async ({ page }) => {
  await setUpVault(page)
  await createCase(page, 'CA', 'Los Angeles', 'Maria Hartley', 'R. Cordova')

  await page.getByTestId('nav-counsel').click()
  await expect(page.getByTestId('screen-counsel')).toBeVisible()
  await expect(page.getByTestId('counsel-drafting-panel')).toBeVisible()
  await expect(page.getByTestId('counsel-drafting-panel')).toContainText('Los Angeles, CA')
  await expect(page.getByTestId('counsel-audit-panel')).toHaveCount(0)

  await page.getByTestId('counsel-tab-audit').click()
  await expect(page.getByTestId('counsel-audit-panel')).toBeVisible()
  await expect(page.getByTestId('counsel-audit-panel')).toContainText('Los Angeles, CA')
  await expect(page.getByTestId('counsel-drafting-panel')).toHaveCount(0)
})

test('switching the selected case updates the panel content, keeping the active tab', async ({ page }) => {
  await setUpVault(page)
  await createCase(page, 'CA', 'Los Angeles', 'Maria Hartley', 'R. Cordova')
  await createCase(page, 'CA', 'San Diego', 'Jordan Alvarez', 'Pat Nguyen')

  await page.getByTestId('nav-counsel').click()
  await page.getByTestId('counsel-tab-audit').click()

  await page.getByText('San Diego, CA', { exact: true }).click()
  await expect(page.getByTestId('counsel-audit-panel')).toContainText('San Diego, CA')
  await expect(page.getByTestId('counsel-drafting-panel')).toHaveCount(0)
})
