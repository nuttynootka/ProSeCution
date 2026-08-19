import { expect, test, type Page } from '@playwright/test'
import { DESTINATIONS } from '../src/nav/destinations'
import { setUpVault } from './helpers/vault'

// Not an assertion suite — captures the current look of every screen at phone size
// for visual review. Output lands in screenshots/ and is regenerated each run.

async function createCase(page: Page): Promise<void> {
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
}

test('capture every screen', async ({ page }) => {
  await setUpVault(page)
  // Counsel's real screen (Chunk 42) only renders once a case exists.
  await createCase(page)

  for (const destination of DESTINATIONS) {
    await page.goto(`/#${destination.path}`)
    await page.getByTestId(destination.testId).waitFor({ state: 'visible' })
    await page.screenshot({
      path: `screenshots/${destination.label.toLowerCase()}.png`,
    })
  }
})
