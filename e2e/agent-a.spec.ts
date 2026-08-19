import { expect, test, type Page } from '@playwright/test'
import { setUpVault } from './helpers/vault'

const CA_CODES_URL = 'https://leginfo.legislature.ca.gov/faces/codesTOCSelected.xhtml'
const CA_RULES_URL = 'https://www.courts.ca.gov/rules.htm'
const CA_OPINIONS_URL = 'https://www.courts.ca.gov/opinions.htm'
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'

async function mockRealSources(page: Page): Promise<void> {
  for (const url of [CA_CODES_URL, CA_RULES_URL, CA_OPINIONS_URL]) {
    await page.route(url, (route) => route.fulfill({ body: '<p>Real seeded source text.</p>', contentType: 'text/html' }))
  }
}

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
  await page.getByTestId('case-row').first().click()
  await expect(page.getByTestId('screen-case-dashboard')).toBeVisible()
}

test('prompts to configure a provider first, when none is set up', async ({ page }) => {
  await setUpVault(page)
  await createCaseAndOpenDashboard(page)
  await page.getByTestId('ask-agent-a-prompt').click()
  await expect(page.getByTestId('ask-agent-a-no-provider')).toBeVisible()
})

test('answers a real question with a verified citation and flags an unverified one', async ({ page }) => {
  await mockRealSources(page)
  await page.route(GROQ_URL, (route) =>
    route.fulfill({
      json: { choices: [{ message: { content: 'You have 30 days [California Codes]. See also [Not A Real Source].' } }] },
    }),
  )

  await setUpVault(page)
  await createCaseAndOpenDashboard(page)

  // Configure a provider first, through the real Vault settings UI.
  await page.getByTestId('nav-vault').click()
  await page.getByTestId('llm-provider-api-key').fill('gsk_test_key')
  await page.getByTestId('llm-provider-save').click()
  await expect(page.getByTestId('llm-provider-saved-note')).toBeVisible()

  await page.getByTestId('nav-cases').click()
  await page.getByTestId('case-row').first().click()
  await page.getByTestId('ask-agent-a-prompt').click()
  await page.getByTestId('ask-agent-a-input').fill('How long do I have to respond?')
  await page.getByTestId('ask-agent-a-submit').click()

  await expect(page.getByTestId('ask-agent-a-answer')).toContainText('30 days')
  await expect(page.getByTestId('ask-agent-a-citation')).toHaveText('California Codes')
  await expect(page.getByTestId('ask-agent-a-unverified')).toContainText('Not A Real Source')
})

test('shows the real out-of-bounds explanation instead of a fabricated answer', async ({ page }) => {
  await mockRealSources(page)
  await page.route(GROQ_URL, (route) =>
    route.fulfill({
      json: { choices: [{ message: { content: 'ERR_OUT_OF_BOUNDS_LEGAL_CORPUS Missing: specific filing fee schedule.' } }] },
    }),
  )

  await setUpVault(page)
  await createCaseAndOpenDashboard(page)
  await page.getByTestId('nav-vault').click()
  await page.getByTestId('llm-provider-api-key').fill('gsk_test_key')
  await page.getByTestId('llm-provider-save').click()
  await page.getByTestId('nav-cases').click()
  await page.getByTestId('case-row').first().click()
  await page.getByTestId('ask-agent-a-prompt').click()
  await page.getByTestId('ask-agent-a-input').fill('How much does filing cost?')
  await page.getByTestId('ask-agent-a-submit').click()

  await expect(page.getByTestId('ask-agent-a-status-note')).toBeVisible()
  await expect(page.getByTestId('ask-agent-a-answer')).toContainText('Missing: specific filing fee schedule')
})
