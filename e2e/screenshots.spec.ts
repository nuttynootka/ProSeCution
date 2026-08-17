import { test } from '@playwright/test'
import { DESTINATIONS } from '../src/nav/destinations'

// Not an assertion suite — this captures the current look of every screen at phone
// size so visual progress can be reviewed without a device. Output lands in
// screenshots/ and is regenerated each run.

test('capture every screen', async ({ page }) => {
  for (const destination of DESTINATIONS) {
    await page.goto(`/#${destination.path}`)
    await page.getByTestId(destination.testId).waitFor({ state: 'visible' })
    await page.screenshot({
      path: `screenshots/${destination.label.toLowerCase()}.png`,
    })
  }
})
