import { expect, test, type Page } from '@playwright/test'
import { DESTINATIONS, START_PATH } from '../src/nav/destinations'
import { setUpVault } from './helpers/vault'

// Chunk 1's acceptance test: the shell loads, every destination is reachable from the
// bottom bar, and unknown routes fall back to the start destination. Updated for
// Chunk 5: everything now sits behind the passphrase gate, so each test sets up a
// fresh vault first.

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

test.beforeEach(async ({ page }) => {
  await setUpVault(page)
})

test('opens on the start destination', async ({ page }) => {
  expect(page.url()).toContain(`#${START_PATH}`)
})

test('every destination is reachable from the bottom bar', async ({ page }) => {
  // Counsel's real screen (Chunk 42) only renders once a case exists — with none,
  // it honestly shows an empty state instead, a different testid entirely.
  await createCase(page)

  for (const destination of DESTINATIONS) {
    await page.getByTestId(`nav-${destination.label.toLowerCase()}`).click()
    await expect(page.getByTestId(destination.testId)).toBeVisible()
    expect(page.url()).toContain(`#${destination.path}`)
  }
})

test('marks only the current destination as active', async ({ page }) => {
  await page.getByTestId('nav-vault').click()

  // React Router's NavLink sets aria-current="page" on the active link — checking
  // that (rather than a CSS class) survives style refactors and is what assistive
  // tech actually relies on.
  const active = page.locator('[aria-current="page"]')
  await expect(active).toHaveCount(1)
  await expect(active).toHaveAttribute('data-testid', 'nav-vault')
})

test('unknown routes redirect to the start destination', async ({ page }) => {
  await page.goto('/#/does-not-exist')
  await expect(page.getByTestId('screen-cases')).toBeVisible()
})
