import { expect, test } from '@playwright/test'
import { setUpVault, TEST_PASSPHRASE } from './helpers/vault'

test('selecting a provider shows its real training disclosure, and settings persist across reload', async ({ page }) => {
  await setUpVault(page)
  await page.getByTestId('nav-vault').click()
  await expect(page.getByTestId('llm-provider-settings')).toBeVisible()

  // Groq is the default — free, no card.
  await expect(page.getByTestId('llm-provider-disclosure')).toContainText('Groq')

  await page.getByRole('radio', { name: 'Google Gemini' }).click()
  await expect(page.getByTestId('llm-provider-disclosure')).toContainText('train')
  await expect(page.getByTestId('llm-provider-api-key')).toBeVisible()

  await page.getByTestId('llm-provider-api-key').fill('test-gemini-key')
  await page.getByTestId('llm-provider-model').fill('gemini-2.0-flash')
  await page.getByTestId('llm-provider-save').click()
  await expect(page.getByTestId('llm-provider-saved-note')).toBeVisible()

  await page.reload()
  await page.getByTestId('unlock-passphrase').fill(TEST_PASSPHRASE)
  await page.getByTestId('unlock-submit').click()
  // HashRouter preserves the route across reload — already back on Vault.
  await expect(page.getByTestId('llm-provider-settings')).toBeVisible()
  await expect(page.getByRole('radio', { name: 'Google Gemini' })).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByTestId('llm-provider-api-key')).toHaveValue('test-gemini-key')
})

test('Ollama has no API key field but a real, editable server address', async ({ page }) => {
  await setUpVault(page)
  await page.getByTestId('nav-vault').click()
  await page.getByRole('radio', { name: 'Ollama (local/custom)' }).click()
  await expect(page.getByTestId('llm-provider-api-key')).toHaveCount(0)
  await expect(page.getByTestId('llm-provider-base-url')).toBeVisible()
})

test('a real successful test-connection response is parsed and shown honestly', async ({ page }) => {
  await page.route('https://api.groq.com/openai/v1/chat/completions', async (route) => {
    await route.fulfill({ json: { choices: [{ message: { content: 'OK' } }] } })
  })

  await setUpVault(page)
  await page.getByTestId('nav-vault').click()
  await page.getByTestId('llm-provider-api-key').fill('gsk_test_key')
  await page.getByTestId('llm-provider-test').click()

  const result = page.getByTestId('llm-provider-test-result')
  await expect(result).toHaveAttribute('data-outcome', 'ok')
  await expect(result).toContainText('OK')
})

test('a failed test-connection response is reported honestly, not silently swallowed', async ({ page }) => {
  await page.route('https://api.groq.com/openai/v1/chat/completions', async (route) => {
    await route.fulfill({ status: 401, body: '{"error":"invalid_api_key"}' })
  })

  await setUpVault(page)
  await page.getByTestId('nav-vault').click()
  await page.getByTestId('llm-provider-api-key').fill('bad-key')
  await page.getByTestId('llm-provider-test').click()

  const result = page.getByTestId('llm-provider-test-result')
  await expect(result).toHaveAttribute('data-outcome', 'http-error')
  await expect(result).toContainText('401')
})
