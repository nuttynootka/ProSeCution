import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import { setUpVault } from './helpers/vault'

/** See e2e/fill-form.spec.ts for why real pdf.js text extraction, not a hex-search guess, is the genuine verification technique for the CID-encoded font this app's PDF generators embed. */
async function extractPdfText(bytes: Buffer): Promise<string> {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(bytes) }).promise
  const page = await doc.getPage(1)
  const content = await page.getTextContent()
  const text = content.items.map((item) => ('str' in item ? item.str : '')).join(' ')
  await doc.destroy()
  return text.replace(/\s+/g, ' ').trim()
}

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

test('mail service linked to a real deadline creates a genuine extended deadline, citing the actual CA mail-service rule', async ({
  page,
}) => {
  await setUpVault(page)
  await createCaseAndOpenDashboard(page)

  // A real underlying deadline to link the service to.
  await page.getByTestId('log-service-date-prompt').click()
  await page.getByTestId('log-service-date-input').fill('2026-03-02')
  await page.getByTestId('log-service-date-submit').click()
  await expect(page.getByTestId('log-service-date-success')).toBeVisible()
  await page.getByTestId('log-service-date-done').click()

  await page.getByTestId('log-proof-of-service-prompt').click()
  // Party chips are keyed by party id (a real UUID), not name, so select by the
  // chip's visible, accessible name instead of a predictable data-testid.
  await page.getByRole('radio', { name: 'R. Cordova' }).click()
  await page.getByTestId('log-proof-of-service-document').fill('Motion to Compel Discovery')
  // Mail is the default method — the address field should already be visible.
  await page.getByTestId('log-proof-of-service-address').fill('123 Main St, Los Angeles, CA 90001')
  await page.getByTestId('log-proof-of-service-date').fill('2026-03-05')
  await page.getByRole('radio', { name: 'None' }).waitFor() // the linked-deadline chips render once fetched
  await page.getByRole('radio', { name: 'File a written response' }).click()

  await page.getByTestId('log-proof-of-service-submit').click()

  await expect(page.getByTestId('log-proof-of-service-success')).toBeVisible()
  const extensionNote = page.getByTestId('log-proof-of-service-extension')
  await expect(extensionNote).toBeVisible()
  await expect(extensionNote).toContainText('Cal. Civ. Proc. Code § 1013(a)')

  // Real, downloadable evidence — not just a UI claim.
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('log-proof-of-service-download').click(),
  ])
  const path = await download.path()
  const bytes = await readFile(path!)
  expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-')
  const text = await extractPdfText(bytes)
  expect(text).toContain('CERTIFICATE OF SERVICE')
  expect(text).toContain('Motion to Compel Discovery')
  expect(text).toContain('R. Cordova')
  expect(text).toContain('United States mail')
  expect(text).toContain('123 Main St, Los Angeles, CA 90001')

  // The new deadline really landed on the case's own Deadlines timeline, not just in
  // this card's transient result state.
  await page.getByTestId('log-proof-of-service-done').click()
  await page.getByTestId('nav-deadlines').click()
  await expect(page.getByTestId('deadline-item').filter({ hasText: 'extended for mail service' })).toBeVisible()
})

test('personal service creates no extension, and says so honestly rather than implying one was added', async ({ page }) => {
  await setUpVault(page)
  await createCaseAndOpenDashboard(page)

  await page.getByTestId('log-service-date-prompt').click()
  await page.getByTestId('log-service-date-input').fill('2026-03-02')
  await page.getByTestId('log-service-date-submit').click()
  await page.getByTestId('log-service-date-done').click()

  await page.getByTestId('log-proof-of-service-prompt').click()
  await page.getByRole('radio', { name: 'R. Cordova' }).click()
  await page.getByTestId('log-proof-of-service-document').fill('Opposition to Motion')
  await page.getByTestId('chip-pos-method-personal').click()
  await expect(page.getByTestId('log-proof-of-service-address')).toHaveCount(0)
  await page.getByTestId('log-proof-of-service-date').fill('2026-03-05')
  await page.getByRole('radio', { name: 'File a written response' }).click()

  await page.getByTestId('log-proof-of-service-submit').click()

  await expect(page.getByTestId('log-proof-of-service-success')).toBeVisible()
  await expect(page.getByTestId('log-proof-of-service-no-extension')).toBeVisible()
  await expect(page.getByTestId('log-proof-of-service-extension')).toHaveCount(0)
})
