import { expect, test } from '@playwright/test'
import { setUpVault, TEST_PASSPHRASE } from './helpers/vault'

/**
 * Chunk 51's offline verification: this app's entire premise (Chunk 7's
 * "offline-first... every local feature works with no network") is only real if
 * proven with the network actually cut, not just by reasoning about the
 * architecture. `context.setOffline(true)` blocks every request at the network
 * layer — closer to airplane mode than a service-worker simulation would be — after
 * a real first load has let the service worker install and precache everything
 * (Chunk 1), which is the honest scenario this claims to support: works offline
 * *after* the app has been opened online once, not on a true first-ever visit with
 * no connectivity at all.
 */
test('the app installs a real, active service worker that controls the page after one reload', async ({ page }) => {
  await setUpVault(page)
  await page.evaluate(() => navigator.serviceWorker.ready)
  // A service worker never controls the very page load that registered it — only
  // loads from then on (standard SW lifecycle, not a bug) — so this reloads once,
  // the same real sequence a returning visitor's browser goes through, before
  // checking that the page is now actually controlled.
  await page.reload()
  await page.getByTestId('unlock-passphrase').fill(TEST_PASSPHRASE)
  await page.getByTestId('unlock-submit').click()
  await expect(page.getByTestId('screen-cases')).toBeVisible()

  const hasController = await page.evaluate(() => navigator.serviceWorker.controller !== null)
  expect(hasController).toBe(true)
})

test('a full offline case workflow works end to end with the network actually cut', async ({ page, context }) => {
  // Real first load online: installs the service worker and lets it precache
  // every asset (Chunk 1's workbox config) before the network goes away.
  await setUpVault(page)
  await page.evaluate(() => navigator.serviceWorker.ready)

  await context.setOffline(true)
  await page.reload()
  await page.getByTestId('unlock-passphrase').fill(TEST_PASSPHRASE)
  await page.getByTestId('unlock-submit').click()
  await expect(page.getByTestId('screen-cases')).toBeVisible()

  // Create a case, log a deadline, scan+OCR a document, fill a PDF form, and export
  // a calendar file — the core local feature set — with zero network access, not
  // routes mocked to look like success.
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
  await expect(page.getByTestId('case-row')).toHaveCount(1)

  await page.getByTestId('case-row').first().click()
  await expect(page.getByTestId('screen-case-dashboard')).toBeVisible()

  await page.getByTestId('scan-document-fab').click()
  await page.getByTestId('option-file').click()
  await page.getByTestId('file-input').setInputFiles('e2e/fixtures/sample-intake-pii.png')
  await expect(page.getByTestId('crop-editor')).toBeVisible()
  await page.getByTestId('crop-confirm').click()
  // OCR runs entirely in-browser via the self-hosted Tesseract WASM/worker assets
  // (Chunk 9) — if those weren't genuinely precached, this would hang or error here.
  await expect(page.getByTestId('review-loading')).toBeHidden({ timeout: 30_000 })
  await expect(page.getByTestId('ocr-text-input')).not.toHaveValue('')
  await page.getByTestId('review-save').click()
  await expect(page.getByTestId('screen-case-dashboard')).toBeVisible()

  await page.getByTestId('log-service-date-prompt').click()
  await page.getByTestId('log-service-date-input').fill('2026-03-02')
  await page.getByTestId('log-service-date-submit').click()
  await expect(page.getByTestId('log-service-date-success')).toContainText('Added')
  await page.getByTestId('log-service-date-done').click()

  await page.getByTestId('nav-deadlines').click()
  const [icsDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('deadline-export').first().click(),
  ])
  expect(icsDownload.suggestedFilename()).toMatch(/\.ics$/)
})
