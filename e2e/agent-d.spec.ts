import { expect, test, type Page } from '@playwright/test'
import { setUpVault } from './helpers/vault'

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const CA_CODES_URL = 'https://leginfo.legislature.ca.gov/faces/codesTOCSelected.xhtml'
const CA_RULES_URL = 'https://www.courts.ca.gov/rules.htm'
const CA_OPINIONS_URL = 'https://www.courts.ca.gov/opinions.htm'

async function mockRealSources(page: Page): Promise<void> {
  for (const url of [CA_CODES_URL, CA_RULES_URL, CA_OPINIONS_URL]) {
    await page.route(url, (route) => route.fulfill({ body: '<p>Real seeded source text.</p>', contentType: 'text/html' }))
  }
}

async function createCaseAndOpenCounsel(page: Page): Promise<void> {
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
  await page.getByTestId('nav-counsel').click()
  await expect(page.getByTestId('screen-counsel')).toBeVisible()
}

async function configureProvider(page: Page): Promise<void> {
  await page.getByTestId('nav-vault').click()
  await page.getByTestId('llm-provider-api-key').fill('gsk_test_key')
  await page.getByTestId('llm-provider-save').click()
  await expect(page.getByTestId('llm-provider-saved-note')).toBeVisible()
  await page.getByTestId('nav-counsel').click()
}

async function fillDraftingForm(page: Page): Promise<void> {
  await page.getByTestId('drafting-motion-title').fill('Motion to Dismiss')
  await page.getByTestId('drafting-facts-input').fill('The defendant breached the lease on multiple occasions.')
}

test('prompts to configure a provider first, when none is set up', async ({ page }) => {
  await setUpVault(page)
  await createCaseAndOpenCounsel(page)
  await fillDraftingForm(page)
  await page.getByTestId('drafting-generate').click()
  await expect(page.getByTestId('drafting-no-provider')).toBeVisible()
})

test('runs the real three-stage pipeline end to end and requires the adoption gate before adopting', async ({ page }) => {
  await mockRealSources(page)
  let callCount = 0
  await page.route(GROQ_URL, (route) => {
    callCount += 1
    const bodies = [
      { choices: [{ message: { content: '{"sections":[{"heading":"Argument","citations":["[California Codes]"]}]}' } }] },
      { choices: [{ message: { content: 'Full motion body arguing the lease was breached, citing [California Codes].' } }] },
      { choices: [{ message: { content: 'Revised, polished motion body — final version.' } }] },
    ]
    return route.fulfill({ json: bodies[callCount - 1] })
  })

  await setUpVault(page)
  await createCaseAndOpenCounsel(page)
  await configureProvider(page)
  await fillDraftingForm(page)
  await page.getByTestId('drafting-generate').click()

  await expect(page.getByTestId('drafting-final-text')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId('drafting-final-text')).toContainText('Revised, polished motion body')

  await page.getByTestId('drafting-adopt-open').click()
  await expect(page.getByTestId('upl-adoption-gate')).toBeVisible()

  // Can't adopt without checking the box first.
  await expect(page.getByTestId('upl-adoption-confirm')).toBeDisabled()
  await page.getByTestId('upl-adoption-checkbox').check()
  await page.getByTestId('upl-adoption-confirm').click()

  await expect(page.getByTestId('drafting-adopted-note')).toBeVisible()
  await expect(page.getByTestId('drafting-download')).toBeVisible()
})

test('stops before drafting when the outline still cites something outside the corpus after one retry', async ({ page }) => {
  await mockRealSources(page)
  let callCount = 0
  await page.route(GROQ_URL, (route) => {
    callCount += 1
    const bodies = [
      { choices: [{ message: { content: '{"sections":[{"citations":["[Fake Statute One]"]}]}' } }] },
      { choices: [{ message: { content: '{"sections":[{"citations":["[Fake Statute Two]"]}]}' } }] },
    ]
    return route.fulfill({ json: bodies[callCount - 1] })
  })

  await setUpVault(page)
  await createCaseAndOpenCounsel(page)
  await configureProvider(page)
  await fillDraftingForm(page)
  await page.getByTestId('drafting-generate').click()

  await expect(page.getByTestId('drafting-status-note')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId('drafting-status-note')).toContainText('Fake Statute Two')
  await expect(page.getByTestId('drafting-final-text')).toHaveCount(0)
})
