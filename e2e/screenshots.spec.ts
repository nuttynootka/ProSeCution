import { test } from '@playwright/test'
import { DESTINATIONS } from '../src/nav/destinations'
import { setUpVault } from './helpers/vault'

// Not an assertion suite — captures the current look of every screen at phone size
// for visual review. Output lands in screenshots/ and is regenerated each run.

test('capture every screen', async ({ page }) => {
  await setUpVault(page)

  for (const destination of DESTINATIONS) {
    await page.goto(`/#${destination.path}`)
    await page.getByTestId(destination.testId).waitFor({ state: 'visible' })
    await page.screenshot({
      path: `screenshots/${destination.label.toLowerCase()}.png`,
    })
  }
})
