import { expect, test } from '@playwright/test'
import { setUpVault } from './helpers/vault'

async function createCaseAndOpenDashboard(page: import('@playwright/test').Page): Promise<void> {
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

// e2e/fixtures/sample-motion.png is a real rendered page of text reading "NOTICE OF
// MOTION AND MOTION TO DISMISS" / "Case No. 24CV1234" / "Superior Court of
// California, County of Los Angeles" / "Plaintiff Maria Hartley vs. Defendant R.
// Cordova" — this exercises the real Tesseract WASM pipeline end to end (not a mock),
// and checks its actual output, not just that recognize() resolved.
test('scanning a real document runs OCR, categorizes it, and extracts the case number', async ({ page }) => {
  await setUpVault(page)
  await createCaseAndOpenDashboard(page)

  await page.getByTestId('scan-document-fab').click()
  await page.getByTestId('option-file').click()
  await page.getByTestId('file-input').setInputFiles('e2e/fixtures/sample-motion.png')
  await expect(page.getByTestId('crop-editor')).toBeVisible()
  await page.getByTestId('crop-confirm').click()

  await expect(page.getByTestId('review-screen')).toBeVisible()
  // Real OCR over a real WASM worker — give it real time, not a token wait.
  await expect(page.getByTestId('review-loading')).toBeHidden({ timeout: 30_000 })

  // The rule-based categorizer read "MOTION" out of the actual recognized text and
  // pre-selected the right chip.
  await expect(page.getByTestId('chip-document-type-Motion')).toHaveAttribute('aria-checked', 'true')

  // A confidence badge backed by Tesseract's real reported confidence, not a fake one.
  await expect(page.getByTestId('ocr-confidence')).toBeVisible()
  await expect(page.getByTestId('ocr-confidence')).toContainText('% confidence')

  // The recognized text itself contains the document's actual words.
  await expect(page.getByTestId('ocr-text-input')).toHaveValue(/MOTION TO DISMISS/i)

  // extractCaseNumber found "Case No. 24CV1234" in the real OCR output and pre-filled it.
  await expect(page.getByTestId('case-number-input')).toHaveValue('24CV1234')

  await page.getByTestId('review-save').click()

  // The case number made it all the way from pixels on a scanned image to the case
  // record — shown back on the dashboard as proof it actually persisted.
  await expect(page.getByTestId('screen-case-dashboard')).toBeVisible()
  await expect(page.getByTestId('case-number-display')).toHaveText('24CV1234')
})

test('the honest-stub template card says it is not built yet, without pretending to do anything', async ({ page }) => {
  await setUpVault(page)
  await createCaseAndOpenDashboard(page)

  await page.getByTestId('scan-document-fab').click()
  await page.getByTestId('option-file').click()
  await page.getByTestId('file-input').setInputFiles('public/icons/icon-192.png')
  await expect(page.getByTestId('crop-editor')).toBeVisible()
  await page.getByTestId('crop-confirm').click()
  await expect(page.getByTestId('review-loading')).toBeHidden({ timeout: 30_000 })

  // A blank icon has no text at all, so the real redaction panel (Chunk 22) has
  // nothing to show here — only the still-stubbed template card is checked.
  await expect(page.getByTestId('redaction-panel')).toHaveCount(0)

  await page.getByTestId('stub-template').click()
  await expect(page.getByText('Template mapping arrives in a later update.')).toBeVisible()
})

test('correcting the document type and case number by hand saves the correction', async ({ page }) => {
  await setUpVault(page)
  await createCaseAndOpenDashboard(page)

  await page.getByTestId('scan-document-fab').click()
  await page.getByTestId('option-file').click()
  // A blank icon has no text for OCR to find — the review screen still has to work
  // with nothing extracted, falling back to manual entry.
  await page.getByTestId('file-input').setInputFiles('public/icons/icon-192.png')
  await expect(page.getByTestId('crop-editor')).toBeVisible()
  await page.getByTestId('crop-confirm').click()
  await expect(page.getByTestId('review-loading')).toBeHidden({ timeout: 30_000 })

  await page.getByTestId('chip-document-type-Pleading').click()
  await page.getByTestId('case-number-input').fill('BC999999')
  await page.getByTestId('review-save').click()

  await expect(page.getByTestId('screen-case-dashboard')).toBeVisible()
  await expect(page.getByTestId('case-number-display')).toHaveText('BC999999')
})
