import { expect, test, type Page } from '@playwright/test'
import { setUpVault } from './helpers/vault'

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'

async function importTemplate(page: Page, fixture: string, name = 'Sample'): Promise<void> {
  await page.getByTestId('nav-intake').click()
  await expect(page.getByTestId('screen-intake')).toBeVisible()
  await page.getByTestId('import-template-fab').click()
  await page.getByTestId('template-file-input').setInputFiles(fixture)
  await expect(page.getByTestId('intake-naming')).toBeVisible()
  await page.getByTestId('intake-template-name').fill(name)
  await page.getByTestId('intake-naming-save').click()
  await expect(page.getByTestId('template-row')).toBeVisible()
}

async function configureProvider(page: Page): Promise<void> {
  await page.getByTestId('nav-vault').click()
  await page.getByTestId('llm-provider-api-key').fill('gsk_test_key')
  await page.getByTestId('llm-provider-save').click()
  await expect(page.getByTestId('llm-provider-saved-note')).toBeVisible()
  await page.getByTestId('nav-intake').click()
}

test('prompts to configure a provider first, when none is set up', async ({ page }) => {
  await setUpVault(page)
  await importTemplate(page, 'e2e/fixtures/sample-summons.pdf')
  await page.getByTestId('template-row').click()

  await page.getByTestId('studio-auto-suggest').click()
  await expect(page.getByTestId('studio-suggest-note')).toContainText('Set up an AI provider')
})

test('auto-suggests real fields from the PDF\'s actual text layer and adds them to the page', async ({ page }) => {
  await page.route(GROQ_URL, (route) =>
    route.fulfill({
      json: {
        choices: [
          {
            message: {
              content: JSON.stringify([
                {
                  field_id: 'suggested-case-no',
                  type: 'SINGLE_LINE',
                  bounding_box: { left: 200, top: 120, width: 150, height: 14 },
                  label: 'Case No.',
                  suggested_global_key: 'case_number',
                },
              ]),
            },
          },
        ],
      },
    }),
  )

  await setUpVault(page)
  await configureProvider(page)
  await importTemplate(page, 'e2e/fixtures/sample-summons.pdf')
  await page.getByTestId('template-row').click()
  await expect(page.getByTestId('template-field')).toHaveCount(0)

  await page.getByTestId('studio-auto-suggest').click()
  await expect(page.getByTestId('studio-suggest-note')).toContainText('Suggested fields added')
  await expect(page.getByTestId('template-field')).toHaveCount(1)

  await page.getByTestId('template-field').click()
  await expect(page.getByTestId('field-label-input')).toHaveValue('Case No.')
  await expect(page.getByTestId('field-key-input')).toHaveValue('case.number')
})

test('honestly reports no extractable text on a scanned, image-only page instead of guessing', async ({ page }) => {
  const llmSpy: string[] = []
  await page.route(GROQ_URL, (route) => {
    llmSpy.push(route.request().url())
    return route.fulfill({ json: { choices: [{ message: { content: '[]' } }] } })
  })

  await setUpVault(page)
  await configureProvider(page)
  await importTemplate(page, 'e2e/fixtures/sample-scanned-page.pdf', 'Scanned Page')
  await page.getByTestId('template-row').click()

  await page.getByTestId('studio-auto-suggest').click()
  await expect(page.getByTestId('studio-suggest-note')).toContainText('No extractable text')
  await expect(page.getByTestId('template-field')).toHaveCount(0)
  expect(llmSpy).toEqual([])
})
