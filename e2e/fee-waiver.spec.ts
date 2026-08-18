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

async function runWizardThroughFeeWaiverStep(page: Page, state: string): Promise<void> {
  await page.getByTestId('new-case-fab').click()
  await page.getByTestId(`chip-state-${state}`).click()
  await page.getByTestId('county-input').fill('Los Angeles')
  await page.getByTestId('wizard-continue').click()
  await page.getByTestId('chip-case-type-Civil').click()
  await page.getByTestId('plaintiff-name-input').fill('Maria Hartley')
  await page.getByTestId('defendant-name-input').fill('R. Cordova')
  await page.getByTestId('wizard-continue').click()
  await page.getByTestId('wizard-continue').click() // topics stub
  await expect(page.getByTestId('wizard-step-3')).toBeVisible()
  await page.getByTestId('fee-waiver-yes').click()
}

test('low income shows real eligibility, citing the actual CA statute, and persists onto the created case', async ({ page }) => {
  await setUpVault(page)
  await runWizardThroughFeeWaiverStep(page, 'CA')

  await page.getByTestId('fee-waiver-household-size').fill('1')
  await page.getByTestId('fee-waiver-annual-income').fill('20000')

  const result = page.getByTestId('fee-waiver-result')
  await expect(result).toHaveAttribute('data-eligibility', 'eligible')
  await expect(result).toContainText('Likely eligible')
  await expect(result).toContainText('Cal. Gov. Code')

  await page.getByTestId('wizard-create').click()
  await expect(page.getByTestId('screen-cases')).toBeVisible()
  await page.getByTestId('case-row').first().click()

  const badge = page.getByTestId('fee-waiver-badge')
  await expect(badge).toHaveAttribute('data-status', 'eligible')
  await expect(badge).toContainText('LIKELY ELIGIBLE')

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('fee-waiver-download-worksheet').click(),
  ])
  const path = await download.path()
  const bytes = await readFile(path!)
  expect(bytes.subarray(0, 4).toString('latin1')).toBe('%PDF')
  const text = await extractPdfText(bytes)
  expect(text).toContain('NOT an official court form')
  expect(text).toContain('LIKELY ELIGIBLE')
  expect(text).toContain('Cal. Gov. Code § 68632(b)(1)')
  expect(text).toContain('$20,000')
})

test('income above the threshold shows real ineligibility, not a fabricated pass', async ({ page }) => {
  await setUpVault(page)
  await runWizardThroughFeeWaiverStep(page, 'CA')

  await page.getByTestId('fee-waiver-household-size').fill('1')
  await page.getByTestId('fee-waiver-annual-income').fill('200000')

  const result = page.getByTestId('fee-waiver-result')
  await expect(result).toHaveAttribute('data-eligibility', 'not_eligible')
  await expect(result).toContainText('Likely not eligible')

  await page.getByTestId('wizard-create').click()
  await page.getByTestId('case-row').first().click()
  await expect(page.getByTestId('fee-waiver-badge')).toHaveAttribute('data-status', 'not_eligible')
})

test('receiving public benefits qualifies regardless of income, citing the separate rule', async ({ page }) => {
  await setUpVault(page)
  await runWizardThroughFeeWaiverStep(page, 'CA')

  await page.getByRole('radio', { name: 'I receive public benefits' }).click()

  const result = page.getByTestId('fee-waiver-result')
  await expect(result).toHaveAttribute('data-eligibility', 'eligible')
  await expect(result).toContainText('rule 3.51(a)(1)')
})

test('a federal case is honestly undetermined, not a guessed threshold', async ({ page }) => {
  await setUpVault(page)
  await runWizardThroughFeeWaiverStep(page, 'federal')

  await page.getByTestId('fee-waiver-annual-income').fill('10000')

  const result = page.getByTestId('fee-waiver-result')
  await expect(result).toHaveAttribute('data-eligibility', 'undetermined')
  await expect(result).toContainText('28 U.S.C. § 1915(a)(1)')
  await expect(result).toContainText('affidavit')
})
