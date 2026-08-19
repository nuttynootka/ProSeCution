import { expect, test } from '@playwright/test'
import { setUpVault } from './helpers/vault'

/**
 * Chromium under Playwright doesn't fire a real `beforeinstallprompt` event (there's
 * no genuine installability signal in this automated context), so this dispatches a
 * synthetic one with the same shape the browser's real event carries — the same
 * "can't get a real signal here, so exercise the real handling code with a faithful
 * stand-in" approach this app already uses elsewhere for things this sandbox can't
 * produce for real.
 */
async function dispatchFakeInstallPrompt(page: import('@playwright/test').Page, outcome: 'accepted' | 'dismissed') {
  await page.evaluate((outcome) => {
    const event = new Event('beforeinstallprompt', { cancelable: true }) as Event & {
      prompt?: () => Promise<void>
      userChoice?: Promise<{ outcome: string }>
    }
    event.prompt = async () => {}
    event.userChoice = Promise.resolve({ outcome })
    window.dispatchEvent(event)
  }, outcome)
}

test('no install prompt renders without a real installability signal', async ({ page }) => {
  await setUpVault(page)
  await page.getByTestId('nav-vault').click()
  await expect(page.getByTestId('screen-vault')).toBeVisible()
  await expect(page.getByTestId('install-prompt')).toHaveCount(0)
})

test('a real installability signal shows the prompt, and installing consumes it', async ({ page }) => {
  await setUpVault(page)
  await page.getByTestId('nav-vault').click()
  await expect(page.getByTestId('screen-vault')).toBeVisible()
  await dispatchFakeInstallPrompt(page, 'accepted')

  await expect(page.getByTestId('install-prompt')).toBeVisible()
  await page.getByTestId('install-prompt-install').click()
  await expect(page.getByTestId('install-prompt')).toHaveCount(0)
})

test('dismissing the prompt hides it without installing', async ({ page }) => {
  await setUpVault(page)
  await page.getByTestId('nav-vault').click()
  await expect(page.getByTestId('screen-vault')).toBeVisible()
  await dispatchFakeInstallPrompt(page, 'dismissed')

  await expect(page.getByTestId('install-prompt')).toBeVisible()
  await page.getByTestId('install-prompt-dismiss').click()
  await expect(page.getByTestId('install-prompt')).toHaveCount(0)
})
