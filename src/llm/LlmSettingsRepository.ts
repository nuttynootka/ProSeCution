import { decryptContent, encryptContent } from '../vault/contentEnvelope'
import type { PlcmDatabase, StoredLlmSettingsRecord } from '../vault/db'
import type { VaultService } from '../vault/VaultService'

export interface LlmProviderConfig {
  apiKey?: string
  selectedModel?: string
  /** Only meaningful for a provider with an editable base URL (Ollama) — see providers.ts. */
  baseUrl?: string
}

export interface LlmSettingsContent {
  activeProviderId: string | null
  providerConfigs: Record<string, LlmProviderConfig>
}

const DEFAULT_SETTINGS: LlmSettingsContent = { activeProviderId: null, providerConfigs: {} }

/** Singleton settings row, same shape as VaultService's own vaultMeta table — BYOK API keys are exactly the kind of sensitive field the existing content-envelope encryption already exists for. */
export class LlmSettingsRepository {
  #db: PlcmDatabase
  #vault: VaultService

  constructor(db: PlcmDatabase, vault: VaultService) {
    this.#db = db
    this.#vault = vault
  }

  /** Returns real, honest defaults (no provider selected) rather than throwing when nothing has been saved yet. */
  async get(): Promise<LlmSettingsContent> {
    const record = await this.#db.llmSettings.get('singleton')
    if (!record) return DEFAULT_SETTINGS
    return decryptContent<LlmSettingsContent>(this.#vault, record.dataEnc)
  }

  async save(content: LlmSettingsContent): Promise<void> {
    const record: StoredLlmSettingsRecord = { id: 'singleton', dataEnc: await encryptContent(this.#vault, content) }
    await this.#db.llmSettings.put(record)
  }

  /** Merges a patch into one provider's config without disturbing the others or the active-provider selection. */
  async updateProviderConfig(providerId: string, patch: Partial<LlmProviderConfig>): Promise<LlmSettingsContent> {
    const current = await this.get()
    const updated: LlmSettingsContent = {
      ...current,
      providerConfigs: {
        ...current.providerConfigs,
        [providerId]: { ...current.providerConfigs[providerId], ...patch },
      },
    }
    await this.save(updated)
    return updated
  }

  async setActiveProvider(providerId: string | null): Promise<LlmSettingsContent> {
    const current = await this.get()
    const updated: LlmSettingsContent = { ...current, activeProviderId: providerId }
    await this.save(updated)
    return updated
  }
}
