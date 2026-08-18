import { expect, test, type Page } from '@playwright/test'
import { setUpVault } from './helpers/vault'

async function createCaseAndOpenDashboard(page: Page): Promise<void> {
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
  await page.getByTestId('case-row').click()
  await expect(page.getByTestId('screen-case-dashboard')).toBeVisible()
}

test('importing an image file goes through crop before saving', async ({ page }) => {
  await setUpVault(page)
  await createCaseAndOpenDashboard(page)
  await expect(page.getByTestId('stat-documents')).toContainText('0')

  await page.getByTestId('scan-document-fab').click()
  await expect(page.getByTestId('capture-screen')).toBeVisible()

  await page.getByTestId('option-file').click()
  await page.getByTestId('file-input').setInputFiles('public/icons/icon-192.png')

  await expect(page.getByTestId('crop-editor')).toBeVisible()
  await page.getByTestId('crop-confirm').click()

  // Back on the dashboard: the count is real, and the timeline shows it.
  await expect(page.getByTestId('screen-case-dashboard')).toBeVisible()
  await expect(page.getByTestId('stat-documents')).toContainText('1')
  await expect(page.getByTestId('activity-row').filter({ hasText: 'Document added' })).toHaveCount(1)
  await expect(page.getByTestId('activity-row').filter({ hasText: 'Document added' })).toContainText(
    'icon-192.png',
  )
})

test('importing a non-image file (PDF) skips crop and saves directly', async ({ page }) => {
  await setUpVault(page)
  await createCaseAndOpenDashboard(page)

  await page.getByTestId('scan-document-fab').click()
  await page.getByTestId('option-file').click()
  await page.getByTestId('file-input').setInputFiles({
    name: 'motion.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4 fake pdf content for testing'),
  })

  // No crop step for a PDF — straight back to the dashboard.
  await expect(page.getByTestId('screen-case-dashboard')).toBeVisible()
  await expect(page.getByTestId('stat-documents')).toContainText('1')
  await expect(page.getByTestId('activity-row').filter({ hasText: 'Document added' })).toContainText('motion.pdf')
})

test('capturing a photo with the camera goes through crop before saving', async ({ page }) => {
  await setUpVault(page)
  await createCaseAndOpenDashboard(page)

  await page.getByTestId('scan-document-fab').click()
  await page.getByTestId('option-camera').click()

  await expect(page.getByTestId('camera-capture')).toBeVisible()
  await expect(page.getByTestId('camera-shutter')).toBeEnabled({ timeout: 10_000 })
  await page.getByTestId('camera-shutter').click()

  await expect(page.getByTestId('crop-editor')).toBeVisible()
  await page.getByTestId('crop-confirm').click()

  await expect(page.getByTestId('screen-case-dashboard')).toBeVisible()
  await expect(page.getByTestId('stat-documents')).toContainText('1')
})

test('cropping to a smaller region actually produces a smaller saved image', async ({ page }) => {
  await setUpVault(page)
  await createCaseAndOpenDashboard(page)

  await page.getByTestId('scan-document-fab').click()
  await page.getByTestId('option-file').click()
  await page.getByTestId('file-input').setInputFiles('public/icons/icon-512.png')
  await expect(page.getByTestId('crop-editor')).toBeVisible()

  // Drag the bottom-right handle to roughly the center of the image, halving the
  // crop area — a real pointer drag, not just calling the crop-math function directly.
  const image = page.getByTestId('crop-image')
  const box = (await image.boundingBox())!
  const handle = page.getByTestId('crop-handle-bottomRight')

  await handle.hover()
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5, { steps: 5 })
  await page.mouse.up()

  await expect(page.getByTestId('crop-confirm')).toHaveText('Crop & continue')

  const originalBytes = await page.evaluate(async () => {
    const res = await fetch('./icons/icon-512.png')
    return (await res.arrayBuffer()).byteLength
  })

  await page.getByTestId('crop-confirm').click()
  await expect(page.getByTestId('screen-case-dashboard')).toBeVisible()

  // Read the stored document's actual size back out of IndexedDB directly (not
  // through an app import — see wizard.spec.ts for why) to confirm the crop was
  // real, not a no-op that saved the full image regardless.
  const storedSize = await page.evaluate(async () => {
    return new Promise<number>((resolve, reject) => {
      const request = indexedDB.open('plcm')
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const idb = request.result
        const tx = idb.transaction(['documents'], 'readonly')
        tx.objectStore('documents').getAll().onsuccess = (e) => {
          const docs = (e.target as IDBRequest).result
          resolve(docs[0].fileCiphertext.length)
        }
      }
    })
  })

  expect(storedSize).toBeLessThan(originalBytes)
})

test('canceling from the camera returns to the choose screen without saving', async ({ page }) => {
  await setUpVault(page)
  await createCaseAndOpenDashboard(page)

  await page.getByTestId('scan-document-fab').click()
  await page.getByTestId('option-camera').click()
  await expect(page.getByTestId('camera-capture')).toBeVisible()

  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByTestId('capture-screen')).toBeVisible()

  // Confirm nothing was actually saved, not just that we landed on a different
  // screen — go back to the dashboard and check the real count.
  await page.getByTestId('capture-back').click()
  await expect(page.getByTestId('stat-documents')).toContainText('0')
})

test('canceling from crop returns to the choose screen without saving', async ({ page }) => {
  await setUpVault(page)
  await createCaseAndOpenDashboard(page)

  await page.getByTestId('scan-document-fab').click()
  await page.getByTestId('option-file').click()
  await page.getByTestId('file-input').setInputFiles('public/icons/icon-192.png')
  await expect(page.getByTestId('crop-editor')).toBeVisible()

  await page.getByTestId('crop-cancel').click()

  await expect(page.getByTestId('capture-screen')).toBeVisible()
})

test('back from the capture screen returns to the case dashboard', async ({ page }) => {
  await setUpVault(page)
  await createCaseAndOpenDashboard(page)

  await page.getByTestId('scan-document-fab').click()
  await page.getByTestId('capture-back').click()

  await expect(page.getByTestId('screen-case-dashboard')).toBeVisible()
  await expect(page.getByTestId('stat-documents')).toContainText('0')
})
