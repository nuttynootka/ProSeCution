import { expect, test, type Page } from '@playwright/test'
import { setUpVault } from './helpers/vault'

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'

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

async function scanAndReachReview(page: Page): Promise<void> {
  await page.getByTestId('scan-document-fab').click()
  await page.getByTestId('option-file').click()
  await page.getByTestId('file-input').setInputFiles('e2e/fixtures/sample-intake-pii.png')
  await expect(page.getByTestId('crop-editor')).toBeVisible()
  await page.getByTestId('crop-confirm').click()
  await expect(page.getByTestId('review-loading')).toBeHidden({ timeout: 30_000 })
}

async function configureProvider(page: Page): Promise<void> {
  await page.getByTestId('nav-vault').click()
  await page.getByTestId('llm-provider-api-key').fill('gsk_test_key')
  await page.getByTestId('llm-provider-save').click()
  await expect(page.getByTestId('llm-provider-saved-note')).toBeVisible()
  await page.getByTestId('nav-cases').click()
  await page.getByTestId('case-row').first().click()
}

// "923-45-6789" is format-valid but SSA-impossible (area 900+ is never issued) — the
// confident detectPii() rule declines to trust it, so it surfaces only as an
// ambiguous candidate, not a confident redaction-panel row. Editing the OCR text by
// hand re-scans it for real (same pattern redaction.spec.ts already relies on).
const AMBIGUOUS_TEXT = 'Reference: 923-45-6789 noted on this filing for context purposes only.'

test('prompts to configure a provider first, when none is set up', async ({ page }) => {
  await setUpVault(page)
  await createCaseAndOpenDashboard(page)
  await scanAndReachReview(page)

  await page.getByTestId('ocr-text-input').fill(AMBIGUOUS_TEXT)
  await expect(page.getByTestId('agent-e-panel')).toBeVisible()
  await expect(page.getByTestId('agent-e-review')).toHaveText('Ask AI to review 1 item')

  await page.getByTestId('agent-e-review').click()
  await expect(page.getByTestId('agent-e-note')).toContainText('Set up an AI provider')
})

test('a real AI review that flags the ambiguous item adds it to the redaction checklist', async ({ page }) => {
  await page.route(GROQ_URL, (route) =>
    route.fulfill({
      json: {
        choices: [
          {
            message: {
              content: JSON.stringify([
                { id: 'candidate-0', is_sensitive: true, reason: 'Structured like a real SSN despite the unusual area number.' },
              ]),
            },
          },
        ],
      },
    }),
  )

  await setUpVault(page)
  await createCaseAndOpenDashboard(page)
  await configureProvider(page)
  await scanAndReachReview(page)

  await page.getByTestId('ocr-text-input').fill(AMBIGUOUS_TEXT)
  await expect(page.getByTestId('redaction-panel')).toHaveCount(0)
  await expect(page.getByTestId('agent-e-review')).toBeVisible()

  await page.getByTestId('agent-e-review').click()
  await expect(page.getByTestId('agent-e-note')).toContainText('Reviewed')

  await expect(page.getByTestId('redaction-panel')).toBeVisible()
  const rows = page.getByTestId('redaction-match')
  await expect(rows).toHaveCount(1)
  await expect(rows).toContainText('923-45-6789')

  await page.getByTestId('redaction-apply').click()
  const textAfterRedaction = await page.getByTestId('ocr-text-input').inputValue()
  expect(textAfterRedaction).toContain('[REDACTED-SSN]')
  expect(textAfterRedaction).not.toContain('923-45-6789')
})

test('an AI review that clears the item leaves it out of the redaction checklist', async ({ page }) => {
  await page.route(GROQ_URL, (route) =>
    route.fulfill({
      json: {
        choices: [
          { message: { content: JSON.stringify([{ id: 'candidate-0', is_sensitive: false, reason: 'This is a made-up docket reference, not an SSN.' }]) } },
        ],
      },
    }),
  )

  await setUpVault(page)
  await createCaseAndOpenDashboard(page)
  await configureProvider(page)
  await scanAndReachReview(page)

  await page.getByTestId('ocr-text-input').fill(AMBIGUOUS_TEXT)
  await page.getByTestId('agent-e-review').click()

  await expect(page.getByTestId('agent-e-note')).toContainText('Reviewed')
  await expect(page.getByTestId('redaction-panel')).toHaveCount(0)
})
