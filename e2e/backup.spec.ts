import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { setUpVault, TEST_PASSPHRASE } from './helpers/vault'

test('backup, clear storage, restore — the real data survives intact', async ({ page }) => {
  await setUpVault(page)

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

  await page.getByTestId('nav-vault').click()
  await expect(page.getByTestId('screen-vault')).toBeVisible()
  await page.getByTestId('backup-export-passphrase').fill('backup file passphrase')
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('backup-export-submit').click(),
  ])
  await expect(page.getByTestId('backup-export-success')).toBeVisible()
  const backupPath = await download.path()
  const backupBytes = await readFile(backupPath!)
  expect(backupBytes.subarray(0, 1).toString('utf-8')).toBe('{')

  // Simulate a real "clear storage" — wipe IndexedDB entirely and reload, exactly
  // the scenario a new device or a wiped browser profile would present.
  await page.evaluate(() => indexedDB.deleteDatabase('plcm'))
  await page.reload()
  await expect(page.getByTestId('setup-passphrase')).toBeVisible()
  await setUpVault(page, TEST_PASSPHRASE)
  await expect(page.getByTestId('case-row')).toHaveCount(0)

  await page.getByTestId('nav-vault').click()
  await page.getByTestId('backup-import-file').setInputFiles(backupPath!)
  await page.getByTestId('backup-import-passphrase').fill('backup file passphrase')
  await page.getByTestId('backup-import-submit').click()
  await expect(page.getByTestId('backup-import-success')).toBeVisible()

  await page.getByTestId('nav-cases').click()
  await expect(page.getByTestId('case-row')).toHaveCount(1)
  await page.getByTestId('case-row').first().click()
  await expect(page.getByTestId('screen-case-dashboard')).toBeVisible()
  await expect(page.getByTestId('screen-case-dashboard')).toContainText('Los Angeles, CA')
  await page.getByTestId('activity-row').first().waitFor()
  await expect(page.getByText('R. Cordova')).toBeVisible()
})

test('the wrong backup passphrase is rejected honestly, not silently accepted', async ({ page }) => {
  await setUpVault(page)
  await page.getByTestId('nav-vault').click()
  await page.getByTestId('backup-export-passphrase').fill('real passphrase')
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('backup-export-submit').click(),
  ])
  const backupPath = await download.path()

  await page.getByTestId('backup-import-file').setInputFiles(backupPath!)
  await page.getByTestId('backup-import-passphrase').fill('wrong passphrase')
  await page.getByTestId('backup-import-submit').click()
  await expect(page.getByTestId('backup-import-error')).toContainText('Incorrect passphrase')
})
