export { renderPromptTemplate } from './render'
export type { PromptVars } from './render'
export {
  AGENT_A_GROUNDED_QA,
  AGENT_B_OPPOSING_FILING_AUDITOR,
  AGENT_C_PDF_FIELD_EXTRACTOR,
  AGENT_D_MOTION_DRAFTER,
  AGENT_E_REDACTION_ASSIST,
  DRAFTING_CRITIQUE_PROMPT,
  DRAFTING_FULL_DRAFT_PROMPT,
  DRAFTING_OUTLINE_PROMPT,
  getPromptTemplate,
  PROMPT_TEMPLATES,
  STYLE_GUIDES,
  styleGuideFor,
} from './registry'
export type { PromptTemplate, StyleGuide } from './registry'
