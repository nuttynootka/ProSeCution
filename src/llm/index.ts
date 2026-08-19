import { db, vault } from '../vault'
import { LlmSettingsRepository } from './LlmSettingsRepository'

export { getProviderDef, LLM_PROVIDERS } from './providers'
export type { LlmProviderDef } from './providers'
export { buildLlmRequest, extractLlmReplyText } from './requestAdapter'
export type { LlmRequestSpec } from './requestAdapter'
export { testConnection } from './testConnection'
export type { TestConnectionOutcome, TestConnectionResult } from './testConnection'
export { LlmSettingsRepository } from './LlmSettingsRepository'
export type { LlmProviderConfig, LlmSettingsContent } from './LlmSettingsRepository'

export const llmSettingsRepository = new LlmSettingsRepository(db, vault)
