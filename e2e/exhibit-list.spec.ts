import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import { setUpVault, TEST_PASSPHRASE } from './helpers/vault'

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

async function scanRealDocument(page: Page, filename: string): Promise<void> {
  await page.getByTestId('scan-document-fab').click()
  await page.getByTestId('option-file').click()
  await page.getByTestId('file-input').setInputFiles(filename)
  await expect(page.getByTestId('crop-editor')).toBeVisible()
  await page.getByTestId('crop-confirm').click()
  await expect(page.getByTestId('review-loading')).toBeHidden({ timeout: 30_000 })
  await page.getByTestId('review-save').click()
  await expect(page.getByTestId('screen-case-dashboard')).toBeVisible()
}

test('shows an honest empty state when the case has no documents yet', async ({ page }) => {
  await setUpVault(page)
  await createCaseAndOpenDashboard(page)
  await page.getByTestId('exhibit-list-link').click()
  await expect(page.getByTestId('exhibit-list-no-documents')).toBeVisible()
})

test('checking a document in assigns a real letter, and reordering updates the letters live', async ({ page }) => {
  await setUpVault(page)
  await createCaseAndOpenDashboard(page)
  await scanRealDocument(page, 'e2e/fixtures/sample-intake-pii.png')
  await scanRealDocument(page, 'e2e/fixtures/sample-motion.png')

  await page.getByTestId('exhibit-list-link').click()
  await expect(page.getByTestId('exhibit-list-screen')).toBeVisible()

  const addCheckboxes = page.getByTestId('exhibit-add-checkbox')
  await expect(addCheckboxes).toHaveCount(2)
  await addCheckboxes.first().click()

  await expect(page.getByTestId('exhibit-row')).toHaveCount(1)
  await expect(page.getByTestId('exhibit-letter').first()).toHaveText('A')

  await addCheckboxes.first().click()
  const rows = page.getByTestId('exhibit-row')
  await expect(rows).toHaveCount(2)
  const letters = page.getByTestId('exhibit-letter')
  await expect(letters.nth(0)).toHaveText('A')
  await expect(letters.nth(1)).toHaveText('B')
  // Real order check, not just that the labels read A/B (which they always would,
  // positionally) — confirm which actual document is first before reordering.
  // Documents list most-recently-added first (DocumentRepository.listForCase), and
  // sample-motion.png was scanned second, so it's the first "ALL DOCUMENTS" checkbox
  // and therefore the first one checked in here.
  await expect(rows.nth(0)).toContainText('sample-motion.png')
  await expect(rows.nth(1)).toContainText('sample-intake-pii.png')

  // Move the second exhibit up — it should now genuinely be first, still labeled A.
  await page.getByTestId('exhibit-move-up').nth(1).click()
  await expect(rows.nth(0)).toContainText('sample-intake-pii.png')
  await expect(rows.nth(1)).toContainText('sample-motion.png')
  await expect(letters.nth(0)).toHaveText('A')
  await expect(letters.nth(1)).toHaveText('B')
})

test('a saved exhibit list persists across a reload, and downloads real PDFs', async ({ page }) => {
  await setUpVault(page)
  await createCaseAndOpenDashboard(page)
  await scanRealDocument(page, 'e2e/fixtures/sample-intake-pii.png')

  await page.getByTestId('exhibit-list-link').click()
  await page.getByTestId('exhibit-add-checkbox').click()
  await page.getByTestId('exhibit-description-input').fill('Signed intake form')
  await page.getByTestId('exhibit-list-save').click()
  await expect(page.getByTestId('exhibit-list-save-note')).toBeVisible()

  const [listDownload] = await Promise.all([page.waitForEvent('download'), page.getByTestId('exhibit-list-download').click()])
  expect(listDownload.suggestedFilename()).toBe('Exhibit-List.pdf')
  const listBytes = await readFile((await listDownload.path())!)
  expect(listBytes.subarray(0, 4).toString('latin1')).toBe('%PDF')

  const [coverDownload] = await Promise.all([page.waitForEvent('download'), page.getByTestId('exhibit-list-download-covers').click()])
  expect(coverDownload.suggestedFilename()).toBe('Exhibit-Cover-Sheets.pdf')
  const coverBytes = await readFile((await coverDownload.path())!)
  expect(coverBytes.subarray(0, 4).toString('latin1')).toBe('%PDF')

  await page.reload()
  await page.getByTestId('unlock-passphrase').fill(TEST_PASSPHRASE)
  await page.getByTestId('unlock-submit').click()
  await expect(page.getByTestId('exhibit-list-screen')).toBeVisible()
  await expect(page.getByTestId('exhibit-row')).toHaveCount(1)
  await expect(page.getByTestId('exhibit-description-input')).toHaveValue('Signed intake form')
})
