import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import { setUpVault } from './helpers/vault'

/**
 * Real text extraction, not a hex-search guess at pdf-lib's encoding: the font
 * fillTemplate embeds (Chunk 20, IBM Plex Mono via fontkit) comes out as a Type0/CID
 * composite font, whose content stream encodes each glyph as a per-font glyph ID —
 * not the character's own code point — so a earlier version of this check that
 * hex-searched the raw content stream for the drawn text stopped finding anything
 * once the font changed, even though the text was genuinely there. pdf.js's own
 * text-extraction (its Node-targeted "legacy" build) does the real decoding a PDF
 * reader actually needs.
 */
async function extractPdfText(bytes: Buffer): Promise<string> {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(bytes) }).promise
  const texts: string[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    texts.push(content.items.map((item) => ('str' in item ? item.str : '')).join(' '))
  }
  await doc.destroy()
  return texts.join('\n')
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
  expect(await extractPdfText(bytes)).toContain('Maria Hartley-Overridden')
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
