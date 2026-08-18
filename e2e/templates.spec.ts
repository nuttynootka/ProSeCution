import { expect, test, type Page } from '@playwright/test'
import { setUpVault } from './helpers/vault'

async function importTemplate(page: Page, name = 'Sample Summons'): Promise<void> {
  await page.getByTestId('nav-intake').click()
  await expect(page.getByTestId('screen-intake')).toBeVisible()
  await page.getByTestId('import-template-fab').click()
  await page.getByTestId('template-file-input').setInputFiles('e2e/fixtures/sample-summons.pdf')
  await expect(page.getByTestId('intake-naming')).toBeVisible()
  await page.getByTestId('intake-template-name').fill(name)
  await page.getByTestId('intake-naming-save').click()
  await expect(page.getByTestId('template-row')).toBeVisible()
}

test('importing a real PDF reads its actual page count via pdf.js, not a guess', async ({ page }) => {
  await setUpVault(page)
  await importTemplate(page)

  await expect(page.getByTestId('template-row')).toContainText('Sample Summons')
  // The fixture is a real 2-page PDF (e2e/fixtures/sample-summons.pdf) — this is
  // pdf.js's own parsed count, not something the UI made up.
  await expect(page.getByTestId('template-row')).toContainText('2 pages')
})

test('opening a template renders its real first page onto a canvas', async ({ page }) => {
  await setUpVault(page)
  await importTemplate(page)
  await page.getByTestId('template-row').click()

  await expect(page.getByTestId('template-studio-screen')).toBeVisible()
  const canvas = page.getByTestId('template-canvas')
  await expect(canvas).toBeVisible()
  const box = await canvas.boundingBox()
  expect(box!.width).toBeGreaterThan(50)
  expect(box!.height).toBeGreaterThan(50)
})

test('tapping the page creates a field, and it can be typed, labeled, and deleted', async ({ page }) => {
  await setUpVault(page)
  await importTemplate(page)
  await page.getByTestId('template-row').click()

  const stage = page.getByTestId('template-stage')
  const box = (await stage.boundingBox())!
  await stage.click({ position: { x: box.width * 0.3, y: box.height * 0.2 } })

  await expect(page.getByTestId('template-field')).toHaveCount(1)
  await expect(page.getByTestId('field-editor')).toBeVisible()

  await page.getByTestId('field-label-input').fill('Plaintiff name')
  await page.getByTestId('chip-field-type-MULTI_LINE_RULED').click()
  await expect(page.getByTestId('field-max-lines-input')).toBeVisible()
  await page.getByTestId('field-max-lines-input').fill('5')

  await page.getByTestId('field-delete').click()
  await expect(page.getByTestId('template-field')).toHaveCount(0)
  await expect(page.getByTestId('field-editor')).toHaveCount(0)
})

test('dragging a field\'s corner handle actually resizes it', async ({ page }) => {
  await setUpVault(page)
  await importTemplate(page)
  await page.getByTestId('template-row').click()

  const stage = page.getByTestId('template-stage')
  const box = (await stage.boundingBox())!
  await stage.click({ position: { x: box.width * 0.3, y: box.height * 0.3 } })

  const field = page.getByTestId('template-field')
  const before = (await field.boundingBox())!

  const handle = page.getByTestId('field-handle-bottomRight')
  await handle.hover()
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.8, { steps: 5 })
  await page.mouse.up()

  const after = (await field.boundingBox())!
  expect(after.width).toBeGreaterThan(before.width)
  expect(after.height).toBeGreaterThan(before.height)
})

test('a saved field mapping persists and reloads when the page is revisited', async ({ page }) => {
  await setUpVault(page)
  await importTemplate(page)
  await page.getByTestId('template-row').click()

  const stage = page.getByTestId('template-stage')
  const box = (await stage.boundingBox())!
  await stage.click({ position: { x: box.width * 0.4, y: box.height * 0.3 } })
  await page.getByTestId('field-label-input').fill('Case number')
  await page.getByTestId('field-key-input').fill('case.number')

  await page.getByTestId('studio-save').click()
  await expect(page.getByTestId('studio-save-note')).toBeVisible()

  await page.getByTestId('studio-back').click()
  await expect(page.getByTestId('screen-intake')).toBeVisible()
  await page.getByTestId('template-row').click()

  await expect(page.getByTestId('template-field')).toHaveCount(1)
  await page.getByTestId('template-field').click()
  await expect(page.getByTestId('field-label-input')).toHaveValue('Case number')
  await expect(page.getByTestId('field-key-input')).toHaveValue('case.number')
})

test('page navigation keeps each page\'s fields separate and saves before switching', async ({ page }) => {
  await setUpVault(page)
  await importTemplate(page)
  await page.getByTestId('template-row').click()

  await expect(page.getByTestId('studio-prev-page')).toBeDisabled()

  const stage = page.getByTestId('template-stage')
  const box = (await stage.boundingBox())!
  await stage.click({ position: { x: box.width * 0.3, y: box.height * 0.3 } })
  await page.getByTestId('field-label-input').fill('Page 1 field')

  await page.getByTestId('studio-next-page').click()
  await expect(page.getByText('PAGE 2 OF 2')).toBeVisible()
  await expect(page.getByTestId('template-field')).toHaveCount(0)

  await page.getByTestId('studio-prev-page').click()
  await expect(page.getByText('PAGE 1 OF 2')).toBeVisible()
  await expect(page.getByTestId('template-field')).toHaveCount(1)
  await page.getByTestId('template-field').click()
  await expect(page.getByTestId('field-label-input')).toHaveValue('Page 1 field')
})
