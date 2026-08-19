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

async function createCaseAndOpenAudit(page: Page): Promise<void> {
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
  await page.getByTestId('counsel-tab-audit').click()
  await expect(page.getByTestId('audit-form')).toBeVisible()
}

async function configureProvider(page: Page): Promise<void> {
  await page.getByTestId('nav-vault').click()
  await page.getByTestId('llm-provider-api-key').fill('gsk_test_key')
  await page.getByTestId('llm-provider-save').click()
  await expect(page.getByTestId('llm-provider-saved-note')).toBeVisible()
  await page.getByTestId('nav-counsel').click()
  await page.getByTestId('counsel-tab-audit').click()
}

test('prompts to configure a provider first, when none is set up', async ({ page }) => {
  await setUpVault(page)
  await createCaseAndOpenAudit(page)
  await page.getByTestId('audit-filing-input').fill('COMPLAINT: Defendant owes $5,000.')
  await page.getByTestId('audit-submit').click()
  await expect(page.getByTestId('audit-no-provider')).toBeVisible()
})

test('a real analysis renders the strength meter, a procedural-gap card, and response options', async ({ page }) => {
  await mockRealSources(page)
  await page.route(GROQ_URL, (route) =>
    route.fulfill({
      json: {
        choices: [
          {
            message: {
              content: JSON.stringify({
                claims_allegations: [{ allegation: 'Defendant owes $5,000', type: 'claim' }],
                procedural_gaps: [{ description: 'The complaint is unverified', rule_citation: 'Cal. Civ. Proc. Code § 446' }],
                factual_contradictions: ['Paragraph 3 conflicts with Paragraph 7'],
                argument_strength_score: 4,
                response_options: [{ title: 'Move to dismiss', legal_basis: 'Cal. Civ. Proc. Code § 430.10(e)', suggested_text: 'Defendant respectfully moves...' }],
              }),
            },
          },
        ],
      },
    }),
  )

  await setUpVault(page)
  await createCaseAndOpenAudit(page)
  await configureProvider(page)
  await page.getByTestId('audit-filing-input').fill('COMPLAINT: Defendant owes $5,000.')
  await page.getByTestId('audit-submit').click()

  await expect(page.getByTestId('audit-strength-score')).toHaveText('4', { timeout: 15_000 })
  await expect(page.getByTestId('audit-gap-card')).toHaveCount(1)
  await expect(page.getByTestId('audit-gap-card')).toContainText('unverified')
  await expect(page.getByTestId('audit-gap-card')).toContainText('Cal. Civ. Proc. Code § 446')
  await expect(page.getByTestId('audit-contradictions')).toContainText('Paragraph 3 conflicts with Paragraph 7')
  await expect(page.getByTestId('audit-response-options')).toContainText('Move to dismiss')
})

test('proceeds and marks gaps NOT PROVIDED when local sources cannot be reached, rather than blocking the audit', async ({ page }) => {
  await page.route(CA_CODES_URL, (route) => route.abort())
  await page.route(CA_RULES_URL, (route) => route.abort())
  await page.route(CA_OPINIONS_URL, (route) => route.abort())
  await page.route(GROQ_URL, (route) =>
    route.fulfill({
      json: {
        choices: [
          {
            message: {
              content: JSON.stringify({
                claims_allegations: [],
                procedural_gaps: [{ description: 'Unable to verify prerequisites' }],
                factual_contradictions: [],
                argument_strength_score: 5,
                response_options: [],
              }),
            },
          },
        ],
      },
    }),
  )

  await setUpVault(page)
  await createCaseAndOpenAudit(page)
  await configureProvider(page)
  await page.getByTestId('audit-filing-input').fill('COMPLAINT text.')
  await page.getByTestId('audit-submit').click()

  await expect(page.getByTestId('audit-strength-score')).toHaveText('5', { timeout: 15_000 })
  await expect(page.getByTestId('audit-unreachable-note')).toBeVisible()
  await expect(page.getByTestId('audit-gap-card')).toContainText('NOT PROVIDED')
})
