import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { setUpVault, TEST_PASSPHRASE } from './helpers/vault'

/**
 * Chunk 49's accessibility audit: a real automated scan (axe-core, the same engine
 * behind Chrome DevTools' own Lighthouse/axe panel), not a manual skim of the JSX —
 * axe catches the concrete, checkable WCAG 2 A/AA violations (missing accessible
 * names, contrast failures, unlabeled form fields, ARIA misuse) that a visual read
 * of the code would miss or over-claim. Scoped to wcag2a/wcag2aa, the same two
 * levels Lighthouse's own accessibility score is built from.
 */
async function scan(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  if (results.violations.length > 0) {
    const detail = results.violations
      .map(
        (v) =>
          `  [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} node(s)) — ${v.nodes[0]?.target.join(' ')}\n    ${v.nodes[0]?.failureSummary}\n    html: ${v.nodes[0]?.html}`,
      )
      .join('\n')
    throw new Error(`${results.violations.length} axe violation(s) on "${label}":\n${detail}`)
  }
}

test('the first-time passphrase setup screen has no WCAG A/AA violations', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('setup-passphrase').waitFor({ state: 'visible' })
  await scan(page, 'passphrase setup')
})

test('the unlock screen (existing vault) has no WCAG A/AA violations', async ({ page }) => {
  await setUpVault(page)
  await page.reload()
  await page.getByTestId('unlock-passphrase').waitFor({ state: 'visible' })
  await scan(page, 'unlock')
})

test('the empty Cases list has no WCAG A/AA violations', async ({ page }) => {
  await setUpVault(page)
  await scan(page, 'Cases (empty)')
})

test('the New Case Wizard has no WCAG A/AA violations at each step', async ({ page }) => {
  await setUpVault(page)
  await page.getByTestId('new-case-fab').click()
  await scan(page, 'Wizard step 1: jurisdiction')

  await page.getByTestId('chip-state-CA').click()
  await page.getByTestId('county-input').fill('Los Angeles')
  await page.getByTestId('wizard-continue').click()
  await scan(page, 'Wizard step 2: case type/parties')

  await page.getByTestId('chip-case-type-Civil').click()
  await page.getByTestId('plaintiff-name-input').fill('Maria Hartley')
  await page.getByTestId('defendant-name-input').fill('R. Cordova')
  await page.getByTestId('wizard-continue').click()
  await scan(page, 'Wizard step 3: topics')

  await page.getByTestId('wizard-continue').click()
  await scan(page, 'Wizard step 4: fee waiver')
})

test('a full walkthrough of every major populated screen has no WCAG A/AA violations', async ({ page }) => {
  await setUpVault(page)

  // Create a real case, populate it with a deadline, a scanned document, a filled
  // template, and an exhibit list, scanning each screen actually reached along the
  // way — one real app walkthrough rather than N independent from-scratch setups.
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
  await scan(page, 'Cases (populated)')

  await page.getByTestId('case-row').first().click()
  await expect(page.getByTestId('screen-case-dashboard')).toBeVisible()
  await scan(page, 'Case Dashboard')

  await page.getByTestId('scan-document-fab').click()
  await scan(page, 'Capture: choose source')
  await page.getByTestId('option-file').click()
  await page.getByTestId('file-input').setInputFiles('e2e/fixtures/sample-intake-pii.png')
  await expect(page.getByTestId('crop-editor')).toBeVisible()
  await scan(page, 'Capture: crop')
  await page.getByTestId('crop-confirm').click()
  await expect(page.getByTestId('review-loading')).toBeHidden({ timeout: 30_000 })
  await scan(page, 'Document Review')
  await page.getByTestId('review-save').click()
  await expect(page.getByTestId('screen-case-dashboard')).toBeVisible()

  await page.getByTestId('stat-documents').click()
  await scan(page, 'Documents list')
  await page.getByTestId('document-row').click()
  await scan(page, 'Document Detail')
  await page.getByTestId('document-detail-back').click()
  await page.getByTestId('documents-back').click()

  await expect(page.getByTestId('screen-case-dashboard')).toBeVisible()
  await page.getByTestId('exhibit-list-link').click()
  await scan(page, 'Exhibit List')
  await page.getByTestId('exhibit-list-back').click()

  await page.getByTestId('nav-deadlines').click()
  await scan(page, 'Deadlines (empty)')

  await page.getByTestId('nav-intake').click()
  await scan(page, 'Intake / timeline (populated)')

  await page.getByTestId('nav-counsel').click()
  await scan(page, 'Counsel: Drafting tab')
  await page.getByTestId('counsel-tab-audit').click()
  await scan(page, 'Counsel: Opposing audit tab')

  await page.getByTestId('nav-vault').click()
  await scan(page, 'Vault settings')

  await page.getByTestId('nav-intake').click()
  await page.getByTestId('import-template-fab').click()
  await scan(page, 'Import template: naming')
  await page.getByTestId('template-file-input').setInputFiles('e2e/fixtures/sample-summons.pdf')
  await page.getByTestId('intake-template-name').fill('Sample Summons')
  await page.getByTestId('intake-naming-save').click()
  await page.getByTestId('template-row').click()
  await scan(page, 'Template Studio')
})
