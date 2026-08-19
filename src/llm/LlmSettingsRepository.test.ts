import { afterEach, describe, expect, it } from 'vitest'
import { PlcmDatabase } from '../vault/db'
import { VaultService } from '../vault/VaultService'
import { LlmSettingsRepository } from './LlmSettingsRepository'

let openDbs: { delete: () => Promise<void> }[] = []

async function harness() {
  const db = new PlcmDatabase(`test-${crypto.randomUUID()}`)
  const vault = new VaultService(db)
  await vault.setUp('test passphrase')
  openDbs.push(db)
  return { db, vault, settings: new LlmSettingsRepository(db, vault) }
}

afterEach(async () => {
  await Promise.all(openDbs.map((db) => db.delete()))
  openDbs = []
})

describe('LlmSettingsRepository', () => {
  it('returns honest defaults — no active provider — before anything is saved', async () => {
    const { settings } = await harness()
    expect(await settings.get()).toEqual({ activeProviderId: null, providerConfigs: {} })
  })

  it('saves and reloads a real API key and model', async () => {
    const { settings } = await harness()
    await settings.updateProviderConfig('groq', { apiKey: 'gsk_real_key', selectedModel: 'llama-3.3-70b-versatile' })
    await settings.setActiveProvider('groq')

    const loaded = await settings.get()
    expect(loaded.activeProviderId).toBe('groq')
    expect(loaded.providerConfigs.groq).toEqual({ apiKey: 'gsk_real_key', selectedModel: 'llama-3.3-70b-versatile' })
  })

  it('stores the settings encrypted — the raw Dexie record has no plaintext API key', async () => {
    const { db, settings } = await harness()
    await settings.updateProviderConfig('groq', { apiKey: 'gsk_super_secret_value' })
    const raw = await db.llmSettings.get('singleton')
    expect(raw!.dataEnc).not.toContain('gsk_super_secret_value')
  })

  it('updating one provider does not disturb another provider\'s saved config', async () => {
    const { settings } = await harness()
    await settings.updateProviderConfig('groq', { apiKey: 'groq-key' })
    await settings.updateProviderConfig('anthropic', { apiKey: 'anthropic-key' })
    await settings.updateProviderConfig('groq', { selectedModel: 'a-new-model' })

    const loaded = await settings.get()
    expect(loaded.providerConfigs.groq).toEqual({ apiKey: 'groq-key', selectedModel: 'a-new-model' })
    expect(loaded.providerConfigs.anthropic).toEqual({ apiKey: 'anthropic-key' })
  })
})
