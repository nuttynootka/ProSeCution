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

// e2e/fixtures/sample-intake-pii.png is a real rendered image whose text reads:
// "CLIENT INTAKE FORM / Case No. 24CV5678 / Superior Court of California, County of
// Lo[s Angeles] / Client: Jordan Alvarez / SSN: 555-44-3333 / DOB: 03/03/1975 /
// Account Number: 1234567890" — real Tesseract WASM OCR over a real image, then real
// detectPii() over the real recognized text, not a mocked/seeded string.
test('a scan with real sensitive text shows the actual detected items, not a static list', async ({ page }) => {
  await setUpVault(page)
  await createCaseAndOpenDashboard(page)

  await page.getByTestId('scan-document-fab').click()
  await page.getByTestId('option-file').click()
  await page.getByTestId('file-input').setInputFiles('e2e/fixtures/sample-intake-pii.png')
  await expect(page.getByTestId('crop-editor')).toBeVisible()
  await page.getByTestId('crop-confirm').click()
  await expect(page.getByTestId('review-loading')).toBeHidden({ timeout: 30_000 })

  await expect(page.getByTestId('redaction-panel')).toBeVisible()
  const rows = page.getByTestId('redaction-match')
  await expect(rows).toHaveCount(3)

  await expect(rows.filter({ hasText: 'SSN' })).toContainText('555-44-3333')
  await expect(rows.filter({ hasText: 'Date of birth' })).toContainText('03/03/1975')
  await expect(rows.filter({ hasText: 'Financial account' })).toContainText('1234567890')
})

test('manual override: unchecking an item keeps it out of the redaction, and the saved text proves it', async ({
  page,
}) => {
  await setUpVault(page)
  await createCaseAndOpenDashboard(page)

  await page.getByTestId('scan-document-fab').click()
  await page.getByTestId('option-file').click()
  await page.getByTestId('file-input').setInputFiles('e2e/fixtures/sample-intake-pii.png')
  await expect(page.getByTestId('crop-editor')).toBeVisible()
  await page.getByTestId('crop-confirm').click()
  await expect(page.getByTestId('review-loading')).toBeHidden({ timeout: 30_000 })

  const rows = page.getByTestId('redaction-match')
  await expect(rows).toHaveCount(3)

  // Override: the date of birth here is actually the client's own — not sensitive
  // enough in this filer's judgment to redact — so uncheck only that one.
  const dobRow = rows.filter({ hasText: 'Date of birth' })
  await dobRow.getByTestId('redaction-match-checkbox').uncheck()

  await expect(page.getByTestId('redaction-apply')).toHaveText('Redact 2 items')
  await page.getByTestId('redaction-apply').click()

  await expect(page.getByTestId('redaction-panel')).toHaveCount(0)
  await expect(page.getByTestId('redaction-applied-note')).toBeVisible()

  const textAfterRedaction = await page.getByTestId('ocr-text-input').inputValue()
  expect(textAfterRedaction).toContain('[REDACTED-SSN]')
  expect(textAfterRedaction).toContain('[REDACTED-ACCOUNT]')
  expect(textAfterRedaction).not.toContain('555-44-3333')
  expect(textAfterRedaction).not.toContain('1234567890')
  // The overridden item survives, in the clear, exactly because it was unchecked.
  expect(textAfterRedaction).toContain('03/03/1975')

  await page.getByTestId('review-save').click()
  await expect(page.getByTestId('screen-case-dashboard')).toBeVisible()

  // The redaction wasn't just a display-only edit — it's what actually got persisted.
  await page.getByTestId('stat-documents').click()
  await page.getByTestId('document-row').click()
  const savedText = await page.getByTestId('document-detail-text').inputValue()
  expect(savedText).toContain('[REDACTED-SSN]')
  expect(savedText).not.toContain('555-44-3333')
  expect(savedText).toContain('03/03/1975')
})

test('editing the scanned text by hand re-scans it, rather than trusting stale matches', async ({ page }) => {
  await setUpVault(page)
  await createCaseAndOpenDashboard(page)

  await page.getByTestId('scan-document-fab').click()
  await page.getByTestId('option-file').click()
  await page.getByTestId('file-input').setInputFiles('e2e/fixtures/sample-intake-pii.png')
  await expect(page.getByTestId('crop-editor')).toBeVisible()
  await page.getByTestId('crop-confirm').click()
  await expect(page.getByTestId('review-loading')).toBeHidden({ timeout: 30_000 })

  await expect(page.getByTestId('redaction-match')).toHaveCount(3)

  // Replace the recognized text entirely with something containing no PII at all —
  // if the panel still showed the old matches, their offsets would point at the
  // wrong substrings of this brand-new text.
  await page.getByTestId('ocr-text-input').fill('Just a plain note with nothing sensitive in it.')
  await expect(page.getByTestId('redaction-panel')).toHaveCount(0)
})
