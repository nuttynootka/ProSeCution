import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { setUpVault, TEST_PASSPHRASE } from './helpers/vault'

/**
 * Chunk 29's "Local MVP complete" review gate: every feature built across Chunks
 * 1-28 has its own dedicated spec already — this test's job isn't to re-verify any
 * one of them again, it's to prove they actually COMPOSE, chained together in one
 * realistic session the way a real self-represented litigant would actually use
 * this app, end to end: create a case, scan and redact a document, calculate and
 * export a deadline, fill and download a court form, log proof of service, and
 * back the whole thing up and restore it — all in the same case, same vault,
 * without resetting state between steps the way isolated specs do.
 */
test('a full case lifecycle: create, capture, redact, deadline, calendar, fill PDF, proof of service, backup/restore', async ({
  page,
}) => {
  await setUpVault(page)

  // 1. Create the case through the wizard, including a real fee-waiver check.
  await page.getByTestId('new-case-fab').click()
  await page.getByTestId('chip-state-CA').click()
  await page.getByTestId('county-input').fill('Los Angeles')
  await page.getByTestId('wizard-continue').click()
  await page.getByTestId('chip-case-type-Civil').click()
  await page.getByTestId('plaintiff-name-input').fill('Maria Hartley')
  await page.getByTestId('defendant-name-input').fill('R. Cordova')
  await page.getByTestId('wizard-continue').click()
  await page.getByTestId('wizard-continue').click()
  await page.getByTestId('fee-waiver-yes').click()
  await page.getByTestId('fee-waiver-household-size').fill('1')
  await page.getByTestId('fee-waiver-annual-income').fill('20000')
  await expect(page.getByTestId('fee-waiver-result')).toHaveAttribute('data-eligibility', 'eligible')
  await page.getByTestId('wizard-create').click()
  await expect(page.getByTestId('case-row')).toHaveCount(1)
  await page.getByTestId('case-row').first().click()
  await expect(page.getByTestId('screen-case-dashboard')).toBeVisible()
  await expect(page.getByTestId('fee-waiver-badge')).toHaveAttribute('data-status', 'eligible')

  // 2. Capture and OCR a document containing real sensitive data, then redact it.
  await page.getByTestId('scan-document-fab').click()
  await page.getByTestId('option-file').click()
  await page.getByTestId('file-input').setInputFiles('e2e/fixtures/sample-intake-pii.png')
  await expect(page.getByTestId('crop-editor')).toBeVisible()
  await page.getByTestId('crop-confirm').click()
  await expect(page.getByTestId('review-loading')).toBeHidden({ timeout: 30_000 })
  await expect(page.getByTestId('redaction-panel')).toBeVisible()
  await page.getByTestId('redaction-apply').click()
  await expect(page.getByTestId('redaction-applied-note')).toBeVisible()
  await page.getByTestId('review-save').click()
  await expect(page.getByTestId('screen-case-dashboard')).toBeVisible()

  // 3. Log the service date, calculating a real deadline, and export it to a calendar.
  await page.getByTestId('log-service-date-prompt').click()
  await page.getByTestId('log-service-date-input').fill('2026-03-02')
  await page.getByTestId('log-service-date-submit').click()
  await expect(page.getByTestId('log-service-date-success')).toBeVisible()
  await page.getByTestId('log-service-date-done').click()
  await page.getByTestId('nav-deadlines').click()
  await expect(page.getByTestId('deadline-item')).toHaveCount(1);
  const [icsDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('deadline-export').click(),
  ])
  expect(icsDownload.suggestedFilename()).toMatch(/\.ics$/)

  // 4. Import a PDF template, map a field, and fill it from the case's real data.
  await page.getByTestId('nav-cases').click()
  await page.getByTestId('case-row').first().click()
  await page.getByTestId('nav-intake').click()
  await page.getByTestId('import-template-fab').click()
  await page.getByTestId('template-file-input').setInputFiles('e2e/fixtures/sample-summons.pdf')
  await page.getByTestId('intake-template-name').fill('Sample Summons')
  await page.getByTestId('intake-naming-save').click()
  await page.getByTestId('template-row').click()
  const stage = page.getByTestId('template-stage')
  const box = (await stage.boundingBox())!
  await stage.click({ position: { x: box.width * 0.3, y: box.height * 0.3 } })
  await page.getByTestId('field-label-input').fill('Plaintiff')
  await page.getByTestId('field-key-input').fill('plaintiff.name')
  await page.getByTestId('studio-save').click()
  await page.getByTestId('studio-back').click()
  await page.getByTestId('nav-cases').click()
  await page.getByTestId('case-row').first().click()
  await page.getByTestId('fill-form-prompt').click()
  await page.getByTestId('fill-form-template-option').click()
  await expect(page.getByTestId('fill-form-field-input')).toHaveValue('Maria Hartley')
  const [pdfDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('fill-form-generate').click(),
  ])
  expect(pdfDownload.suggestedFilename()).toBe('Sample-Summons.pdf')
  await expect(page.getByTestId('fill-form-compliance')).toBeVisible()
  await page.getByTestId('fill-form-back').click()
  await expect(page.getByTestId('screen-case-dashboard')).toBeVisible()

  // 5. Log proof of service against the real deadline from step 3.
  await page.getByTestId('log-proof-of-service-prompt').click()
  await page.getByRole('radio', { name: 'R. Cordova' }).click()
  await page.getByTestId('log-proof-of-service-document').fill('Sample Summons')
  await page.getByTestId('log-proof-of-service-address').fill('123 Main St, Los Angeles, CA 90001')
  await page.getByTestId('log-proof-of-service-date').fill('2026-03-05')
  await page.getByRole('radio', { name: 'File a written response' }).click()
  await page.getByTestId('log-proof-of-service-submit').click()
  await expect(page.getByTestId('log-proof-of-service-extension')).toContainText('Cal. Civ. Proc. Code § 1013(a)')
  await page.getByTestId('log-proof-of-service-done').click()

  // The mail-service extension really landed as a second real deadline.
  await page.getByTestId('nav-deadlines').click()
  await expect(page.getByTestId('deadline-item')).toHaveCount(2)

  // 6. Back the whole case up, wipe storage for real, restore, and confirm
  // everything from every step above survived — the actual point of this test.
  await page.getByTestId('nav-vault').click()
  await page.getByTestId('backup-export-passphrase').fill('journey backup passphrase')
  const [backupDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('backup-export-submit').click(),
  ])
  await expect(page.getByTestId('backup-export-success')).toBeVisible()
  const backupPath = await backupDownload.path()

  await page.evaluate(() => indexedDB.deleteDatabase('plcm'))
  await page.reload()
  await expect(page.getByTestId('setup-passphrase')).toBeVisible()
  await setUpVault(page, TEST_PASSPHRASE)
  await expect(page.getByTestId('case-row')).toHaveCount(0)

  await page.getByTestId('nav-vault').click()
  await page.getByTestId('backup-import-file').setInputFiles(backupPath!)
  await page.getByTestId('backup-import-passphrase').fill('journey backup passphrase')
  await page.getByTestId('backup-import-submit').click()
  await expect(page.getByTestId('backup-import-success')).toBeVisible()

  await page.getByTestId('nav-cases').click()
  await expect(page.getByTestId('case-row')).toHaveCount(1)
  await page.getByTestId('case-row').first().click()
  await expect(page.getByTestId('screen-case-dashboard')).toBeVisible()
  await expect(page.getByTestId('fee-waiver-badge')).toHaveAttribute('data-status', 'eligible')
  await expect(page.getByTestId('stat-documents')).toContainText('1')

  await page.getByTestId('nav-deadlines').click()
  await expect(page.getByTestId('deadline-item')).toHaveCount(2)

  // The redacted document's text survived restore with the redaction intact.
  await page.getByTestId('nav-cases').click()
  await page.getByTestId('case-row').first().click()
  await page.getByTestId('stat-documents').click()
  await page.getByTestId('document-row').click()
  const restoredText = await page.getByTestId('document-detail-text').inputValue()
  expect(restoredText).toContain('[REDACTED-SSN]')
  expect(restoredText).not.toContain('555-44-3333')

  const bytes = await readFile(backupPath!)
  expect(bytes.subarray(0, 1).toString('utf-8')).toBe('{')
})
