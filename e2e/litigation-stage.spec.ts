import { expect, test, type Page } from '@playwright/test'
import { setUpVault } from './helpers/vault'

async function createCaseAndOpenDashboard(page: Page): Promise<void> {
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
}

test('a new case starts at Pleadings with a real, non-fixed posture score', async ({ page }) => {
  await setUpVault(page)
  await createCaseAndOpenDashboard(page)

  await expect(page.getByText('Pleadings', { exact: true })).toBeVisible()
  await expect(page.getByTestId('posture-score')).toHaveText('10')
})

test('tagging a document as a Motion auto-advances the case to Motions, and the posture score rises', async ({ page }) => {
  await setUpVault(page)
  await createCaseAndOpenDashboard(page)

  await page.getByTestId('scan-document-fab').click()
  await page.getByTestId('option-file').click()
  await page.getByTestId('file-input').setInputFiles('e2e/fixtures/sample-motion.png')
  await expect(page.getByTestId('crop-editor')).toBeVisible()
  await page.getByTestId('crop-confirm').click()
  await expect(page.getByTestId('review-loading')).toBeHidden({ timeout: 30_000 })

  await page.getByTestId('chip-document-type-Motion').click()
  await page.getByTestId('review-save').click()

  await expect(page.getByTestId('screen-case-dashboard')).toBeVisible()
  await expect(page.getByText('Motions', { exact: true })).toBeVisible()
  await expect(page.getByTestId('posture-score')).toHaveText('65')

  // Detection is real, not a one-time fluke — it survives a fresh load of the same case.
  await page.getByTestId('nav-cases').click()
  await page.getByTestId('case-row').first().click()
  await expect(page.getByText('Motions', { exact: true })).toBeVisible()
})

test('a real person can manually override the stage in either direction, per the tracker\'s own misdetection safeguard', async ({ page }) => {
  await setUpVault(page)
  await createCaseAndOpenDashboard(page)

  await page.getByTestId('stage-label-trial').click()
  await expect(page.getByText('Trial', { exact: true })).toBeVisible()
  await expect(page.getByTestId('posture-score')).toHaveText('85')

  // Auto-detection never regresses a case on its own, but a manual override can —
  // that's the whole point of a "misdetection" correction.
  await page.getByTestId('stage-label-pleadings').click()
  await expect(page.getByText('Pleadings', { exact: true })).toBeVisible()
  await expect(page.getByTestId('posture-score')).toHaveText('10')
})
