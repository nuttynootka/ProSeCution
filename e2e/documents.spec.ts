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
  await page.getByTestId('case-row').click()
  await expect(page.getByTestId('screen-case-dashboard')).toBeVisible()
}

async function scanFixtureDocument(page: Page): Promise<void> {
  await page.getByTestId('scan-document-fab').click()
  await page.getByTestId('option-file').click()
  await page.getByTestId('file-input').setInputFiles('e2e/fixtures/sample-motion.png')
  await expect(page.getByTestId('crop-editor')).toBeVisible()
  await page.getByTestId('crop-confirm').click()
  await expect(page.getByTestId('review-loading')).toBeHidden({ timeout: 30_000 })
  await page.getByTestId('review-save').click()
  await expect(page.getByTestId('screen-case-dashboard')).toBeVisible()
}

test('the documents stat card is empty until a document exists, then links to the list', async ({ page }) => {
  await setUpVault(page)
  await createCaseAndOpenDashboard(page)

  await page.getByTestId('stat-documents').click()
  await expect(page.getByTestId('documents-empty')).toBeVisible()
  await page.getByTestId('documents-back').click()
  await expect(page.getByTestId('screen-case-dashboard')).toBeVisible()
})

test('the real scanned document appears in both the timeline and the correct folder, and is findable by search', async ({
  page,
}) => {
  await setUpVault(page)
  await createCaseAndOpenDashboard(page)
  await scanFixtureDocument(page)

  await page.getByTestId('stat-documents').click()
  await expect(page.getByTestId('screen-documents')).toBeVisible()

  // Timeline is the default view.
  await expect(page.getByTestId('document-timeline')).toBeVisible()
  await expect(page.getByTestId('document-row')).toHaveCount(1)
  await expect(page.getByTestId('document-row')).toContainText('sample-motion.png')
  await expect(page.getByTestId('document-row')).toContainText('% confidence')

  // The rule-based categorizer read "Motion" from the real OCR text, so the document
  // lands in the Motion folder, not a generic bucket.
  await page.getByTestId('chip-document-view-folders').click()
  await expect(page.getByTestId('document-folders')).toBeVisible()
  await expect(page.getByTestId('folder-Motion')).toBeVisible()
  await expect(page.getByTestId('folder-Motion').getByTestId('document-row')).toHaveCount(1)
  await expect(page.getByTestId('folder-Pleading')).toHaveCount(0)

  // Search matches the real OCR'd text, not just the filename.
  await page.getByTestId('document-search').fill('DISMISS')
  await expect(page.getByTestId('document-row')).toHaveCount(1)
  await page.getByTestId('document-search').fill('no-such-text-anywhere')
  await expect(page.getByTestId('documents-no-results')).toBeVisible()
  await expect(page.getByTestId('document-row')).toHaveCount(0)
})

test('opening a document from the list shows its real preview image and persisted OCR fields', async ({ page }) => {
  await setUpVault(page)
  await createCaseAndOpenDashboard(page)
  await scanFixtureDocument(page)

  await page.getByTestId('stat-documents').click()
  await page.getByTestId('document-row').click()

  await expect(page.getByTestId('document-detail-screen')).toBeVisible()
  await expect(page.getByTestId('document-preview-image')).toBeVisible()
  await expect(page.getByTestId('chip-document-type-Motion')).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByTestId('document-detail-confidence')).toContainText('% confidence')
  await expect(page.getByTestId('document-detail-text')).toHaveValue(/MOTION TO DISMISS/i)
})

test('correcting a document from the detail screen persists and is reflected back in the list', async ({ page }) => {
  await setUpVault(page)
  await createCaseAndOpenDashboard(page)
  await scanFixtureDocument(page)

  await page.getByTestId('stat-documents').click()
  await page.getByTestId('document-row').click()

  await page.getByTestId('chip-document-type-Pleading').click()
  await page.getByTestId('document-detail-text').fill('hand-corrected text with a UNIQUE-MARKER-9182 in it')
  await page.getByTestId('document-detail-save').click()

  await expect(page.getByTestId('screen-documents')).toBeVisible()
  await expect(page.getByTestId('document-row')).toContainText('Pleading')

  // The hand-typed correction is itself searchable — proof the save round-tripped
  // through the real repository, not just local component state.
  await page.getByTestId('document-search').fill('UNIQUE-MARKER-9182')
  await expect(page.getByTestId('document-row')).toHaveCount(1)
})

test('deleting a document requires a second tap, then removes it for real', async ({ page }) => {
  await setUpVault(page)
  await createCaseAndOpenDashboard(page)
  await scanFixtureDocument(page)

  await page.getByTestId('stat-documents').click()
  await page.getByTestId('document-row').click()

  await page.getByTestId('document-detail-delete').click()
  // First tap only arms the confirmation — nothing is deleted yet.
  await expect(page.getByTestId('document-detail-screen')).toBeVisible()
  await page.getByTestId('document-detail-delete').click()

  await expect(page.getByTestId('documents-empty')).toBeVisible()
})
