import type { Page } from '@playwright/test'

export const TEST_PASSPHRASE = 'correct horse battery staple test'

/**
 * Every test gets a fresh browser context (fresh IndexedDB), so every test that
 * touches a real screen has to clear PassphraseGate first. Real Argon2id parameters
 * run here, not a fast test stand-in — this is the same code path production uses,
 * so a test passing means the real setup flow works, not an approximation of it.
 */
export async function setUpVault(page: Page, passphrase = TEST_PASSPHRASE) {
  await page.goto('/')
  await page.getByTestId('setup-passphrase').fill(passphrase)
  await page.getByTestId('setup-confirm').fill(passphrase)
  await page.getByTestId('setup-submit').click()
  await page.getByTestId('screen-cases').waitFor({ state: 'visible', timeout: 15_000 })
}
