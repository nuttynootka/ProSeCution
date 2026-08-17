import { expect, test } from '@playwright/test'
import { setUpVault, TEST_PASSPHRASE } from './helpers/vault'

test('creating a case through the wizard end to end', async ({ page }) => {
  await setUpVault(page)

  await page.getByTestId('new-case-fab').click()
  await expect(page.getByTestId('wizard-step-0')).toBeVisible()

  // Continue is disabled until both required fields on this step are filled.
  await expect(page.getByTestId('wizard-continue')).toBeDisabled()
  await page.getByTestId('chip-state-CA').click()
  await expect(page.getByTestId('wizard-continue')).toBeDisabled()
  await page.getByTestId('county-input').fill('Los Angeles')
  await expect(page.getByTestId('wizard-continue')).toBeEnabled()
  await page.getByTestId('wizard-continue').click()

  await expect(page.getByTestId('wizard-step-1')).toBeVisible()
  await expect(page.getByTestId('wizard-continue')).toBeDisabled()
  await page.getByTestId('chip-case-type-Civil').click()
  await page.getByTestId('plaintiff-name-input').fill('Maria Hartley')
  await page.getByTestId('defendant-name-input').fill('R. Cordova')
  await expect(page.getByTestId('wizard-continue')).toBeEnabled()
  await page.getByTestId('wizard-continue').click()

  // Step 2 (topics stub): the CTA says what it does rather than doing nothing.
  await expect(page.getByTestId('wizard-step-2')).toBeVisible()
  await page.getByTestId('topics-scan-cta').click()
  await expect(page.getByTestId('topics-scan-cta')).toHaveText(/later update/)
  await page.getByTestId('wizard-continue').click()

  // Step 3 (fee waiver stub): choosing "Yes" doesn't block case creation.
  await expect(page.getByTestId('wizard-step-3')).toBeVisible()
  await page.getByTestId('fee-waiver-yes').click()
  await page.getByTestId('wizard-create').click()

  // Back on Cases, the new case is visible.
  await expect(page.getByTestId('screen-cases')).toBeVisible()
  await expect(page.getByTestId('case-row')).toHaveCount(1)
  await expect(page.getByTestId('case-row')).toContainText('Civil')
  await expect(page.getByTestId('case-row')).toContainText('Los Angeles, CA')
})

test('the created case survives a reload and re-unlock — proof it is really persisted, not just in React state', async ({
  page,
}) => {
  await setUpVault(page)
  await page.getByTestId('new-case-fab').click()
  await page.getByTestId('chip-state-WA').click()
  await page.getByTestId('county-input').fill('King')
  await page.getByTestId('wizard-continue').click()
  await page.getByTestId('chip-case-type-Small Claims').click()
  await page.getByTestId('plaintiff-name-input').fill('Plaintiff Test')
  await page.getByTestId('defendant-name-input').fill('Defendant Test')
  await page.getByTestId('wizard-continue').click()
  await page.getByTestId('wizard-continue').click()
  await page.getByTestId('wizard-create').click()
  await expect(page.getByTestId('case-row')).toHaveCount(1)

  await page.reload()

  // A fresh load means a fresh (locked) VaultService instance — the unlock form,
  // not the setup form, since the vault already exists on disk.
  await expect(page.getByTestId('unlock-passphrase')).toBeVisible()
  await page.getByTestId('unlock-passphrase').fill(TEST_PASSPHRASE)
  await page.getByTestId('unlock-submit').click()

  await expect(page.getByTestId('case-row')).toHaveCount(1)
  await expect(page.getByTestId('case-row')).toContainText('Small Claims')
  await expect(page.getByTestId('case-row')).toContainText('King, WA')
})

test('the stored case record contains no plaintext — encryption is actually exercised through the real UI', async ({
  page,
}) => {
  await setUpVault(page)
  await page.getByTestId('new-case-fab').click()
  await page.getByTestId('chip-state-NY').click()
  await page.getByTestId('county-input').fill('Distinctive County Name Osgood')
  await page.getByTestId('wizard-continue').click()
  await page.getByTestId('chip-case-type-Employment').click()
  await page.getByTestId('plaintiff-name-input').fill('Zbigniew Plaintifferson')
  await page.getByTestId('defendant-name-input').fill('Quetzalcoatl Defendantez')
  await page.getByTestId('wizard-continue').click()
  await page.getByTestId('wizard-continue').click()
  await page.getByTestId('wizard-create').click()
  await expect(page.getByTestId('case-row')).toHaveCount(1)

  // Reads IndexedDB directly (not via an app module import): Playwright runs
  // against the production preview build here, where /src/*.ts isn't a servable
  // path — that only resolves against the Vite dev server. Going straight to the
  // browser's storage layer is also the more honest test: it's what's actually on
  // disk, not what the app's own (possibly buggy) read path reports back.
  const rawContainsPlaintext = await page.evaluate(async () => {
    const raw = await new Promise<string>((resolve, reject) => {
      const request = indexedDB.open('plcm')
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const idb = request.result
        const tx = idb.transaction(['cases', 'parties'], 'readonly')
        const result: { cases: unknown[]; parties: unknown[] } = { cases: [], parties: [] }
        tx.objectStore('cases').getAll().onsuccess = (e) => {
          result.cases = (e.target as IDBRequest).result
        }
        tx.objectStore('parties').getAll().onsuccess = (e) => {
          result.parties = (e.target as IDBRequest).result
        }
        tx.oncomplete = () => {
          idb.close()
          resolve(JSON.stringify(result))
        }
        tx.onerror = () => reject(tx.error)
      }
    })
    return {
      hasCounty: raw.includes('Osgood'),
      hasPlaintiffName: raw.includes('Plaintifferson'),
      hasDefendantName: raw.includes('Defendantez'),
    }
  })

  expect(rawContainsPlaintext).toEqual({
    hasCounty: false,
    hasPlaintiffName: false,
    hasDefendantName: false,
  })
})

test('back from the first step returns to Cases without creating anything', async ({ page }) => {
  await setUpVault(page)
  await page.getByTestId('new-case-fab').click()
  await expect(page.getByTestId('wizard-step-0')).toBeVisible()

  await page.getByTestId('wizard-back').click()

  await expect(page.getByTestId('screen-cases')).toBeVisible()
  await expect(page.getByTestId('case-row')).toHaveCount(0)
})
