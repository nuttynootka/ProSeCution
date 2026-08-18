import { inflateSync } from 'node:zlib'
import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import { setUpVault } from './helpers/vault'

/** Same technique as the Vitest-level verification in src/pdf/PdfFillService.test.ts — pdf-lib writes standard-font text as hex strings inside (usually FlateDecode-compressed) content streams, so inflating every stream and searching for the hex form is a real, independent check of what's actually in the downloaded file, not just that the download happened. */
function pdfContainsText(bytes: Buffer, text: string): boolean {
  const raw = bytes.toString('latin1')
  const hex = Buffer.from(text, 'utf-8').toString('hex').toUpperCase()
  let idx = 0
  while (true) {
    const streamStart = raw.indexOf('stream', idx)
    if (streamStart === -1) return false
    const dataStart = streamStart + 7
    const streamEnd = raw.indexOf('endstream', dataStart)
    if (streamEnd === -1) return false
    try {
      const inflated = inflateSync(bytes.subarray(dataStart, streamEnd)).toString('latin1').toUpperCase()
      if (inflated.includes(hex)) return true
    } catch {
      // not a FlateDecode stream — skip
    }
    idx = streamEnd + 9
  }
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

async function importTemplateAndMapField(page: Page): Promise<void> {
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
  await expect(page.getByTestId('studio-save-note')).toBeVisible()
  await page.getByTestId('studio-back').click()
}

test('a field mapped to a known case-data key auto-fills from the real case', async ({ page }) => {
  await setUpVault(page)
  await createCaseAndOpenDashboard(page)
  await importTemplateAndMapField(page)

  await page.getByTestId('nav-cases').click()
  await page.getByTestId('case-row').first().click()
  await page.getByTestId('fill-form-prompt').click()
  await expect(page.getByTestId('fill-form-template-option')).toBeVisible()
  await page.getByTestId('fill-form-template-option').click()

  await expect(page.getByTestId('fill-form-screen')).toBeVisible()
  await expect(page.getByTestId('fill-form-field-input')).toHaveValue('Maria Hartley')
})

test('generating a filled form downloads a real PDF containing the actual entered text', async ({ page }) => {
  await setUpVault(page)
  await createCaseAndOpenDashboard(page)
  await importTemplateAndMapField(page)

  await page.getByTestId('nav-cases').click()
  await page.getByTestId('case-row').first().click()
  await page.getByTestId('fill-form-prompt').click()
  await page.getByTestId('fill-form-template-option').click()

  // The auto-filled value came from the case; hand-edit it too, to prove manual
  // override works on top of auto-fill, not just that auto-fill alone survives.
  await page.getByTestId('fill-form-field-input').fill('Maria Hartley-Overridden')

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('fill-form-generate').click(),
  ])

  expect(download.suggestedFilename()).toBe('Sample-Summons.pdf')
  const path = await download.path()
  const bytes = await readFile(path!)
  expect(bytes.subarray(0, 4).toString('latin1')).toBe('%PDF')
  expect(pdfContainsText(bytes, 'Maria Hartley-Overridden')).toBe(true)
})

test('a template with no mapped fields is honest about it, but still generates a downloadable copy', async ({ page }) => {
  await setUpVault(page)
  await createCaseAndOpenDashboard(page)

  await page.getByTestId('nav-intake').click()
  await page.getByTestId('import-template-fab').click()
  await page.getByTestId('template-file-input').setInputFiles('e2e/fixtures/sample-summons.pdf')
  await page.getByTestId('intake-template-name').fill('Blank Form')
  await page.getByTestId('intake-naming-save').click()

  await page.getByTestId('nav-cases').click()
  await page.getByTestId('case-row').first().click()
  await page.getByTestId('fill-form-prompt').click()
  await page.getByTestId('fill-form-template-option').click()

  await expect(page.getByTestId('fill-form-no-fields')).toBeVisible()
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('fill-form-generate').click(),
  ])
  const path = await download.path()
  const bytes = await readFile(path!)
  expect(bytes.subarray(0, 4).toString('latin1')).toBe('%PDF')
})
