import { expect, test } from '@playwright/test'
import { setUpVault, TEST_PASSPHRASE } from './helpers/vault'

test('shows real online/persistence status, and locking the vault genuinely re-requires the passphrase', async ({ page }) => {
  await setUpVault(page)
  await page.getByTestId('nav-vault').click()
  await expect(page.getByTestId('screen-vault')).toBeVisible()

  await expect(page.getByTestId('online-status')).toHaveText('Online')
  await expect(page.getByTestId('persistence-status')).not.toHaveText('Checking storage…')

  await page.getByTestId('lock-vault').click()

  // A real lock, not a UI-only state flip — the app reloads and genuinely demands
  // the passphrase again, the same screen a freshly-opened, never-unlocked app shows.
  await expect(page.getByTestId('unlock-passphrase')).toBeVisible()
  await page.getByTestId('unlock-passphrase').fill(TEST_PASSPHRASE)
  await page.getByTestId('unlock-submit').click()
  // The reload preserves the route (HashRouter) — back on the same Vault screen,
  // now genuinely re-unlocked rather than merely still showing stale UI.
  await expect(page.getByTestId('screen-vault')).toBeVisible()
})
