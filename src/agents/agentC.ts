import { callLlm, type LlmProviderDef } from '../llm'
import type { PdfTextItem } from '../pdf'
import type { BoundingBox, TemplateField } from '../pdf'
import { getPromptTemplate, renderPromptTemplate } from '../prompts'

export type AgentCStatus = 'suggested' | 'no-text' | 'llm-error' | 'provider-unavailable'

export interface AgentCResult {
  status: AgentCStatus
  /** Suggested fields, ready to merge into Template Studio's field list — the user still reviews/adjusts/deletes each one there, same as a manually tap-placed field; nothing here is auto-applied without that review. */
  fields: TemplateField[]
}

export interface AskAgentCParams {
  textItems: PdfTextItem[]
  provider: LlmProviderDef
  apiKey: string
  model: string
}

/**
 * The prompt's own vocabulary (`party_plaintiff_name`, etc.) mapped to the app's
 * actual closed set of resolvable keys (`caseDataResolver.ts`'s KNOWN_GLOBAL_KEYS).
 * Deliberately not a 1:1 pass-through: several of the prompt's suggested keys
 * (court_name, judge_name, filing_date, other) have no real data behind them yet, so
 * mapping them anyway would silently produce a key that can never resolve — the same
 * "no fabricated key" discipline caseDataResolver.ts already documents for itself.
 */
const GLOBAL_KEY_MAP: Record<string, string> = {
  party_plaintiff_name: 'plaintiff.name',
  party_defendant_name: 'defendant.name',
  case_number: 'case.number',
  case_type: 'case.type',
}

function serializeTextItems(items: PdfTextItem[]): string {
  return items
    .map(
      (item) =>
        `"${item.text}" [${Math.round(item.boundingBox.left)},${Math.round(item.boundingBox.top)},${Math.round(item.boundingBox.width)},${Math.round(item.boundingBox.height)}]`,
    )
    .join('\n')
}

function isBoundingBox(value: unknown): value is BoundingBox {
  if (typeof value !== 'object' || value === null) return false
  const b = value as Record<string, unknown>
  return typeof b.left === 'number' && typeof b.top === 'number' && typeof b.width === 'number' && typeof b.height === 'number'
}

/**
 * Turns the model's raw JSON-array reply into real `TemplateField`s, dropping any
 * entry that doesn't actually have what a field needs — a malformed suggestion is
 * silently skipped, not fabricated into a placeholder field or allowed to crash the
 * whole batch. Malformed JSON overall (the model didn't follow "return only a JSON
 * array") yields no fields at all, same honest-empty-result treatment.
 */
function parseSuggestedFields(replyText: string): TemplateField[] {
  let parsed: unknown
  try {
    // Models occasionally wrap the array in a code fence despite the prompt's
    // "no other text" instruction — stripping fences here is a real, observed
    // accommodation, not speculative defensive coding.
    const cleaned = replyText.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')
    parsed = JSON.parse(cleaned)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []

  const fields: TemplateField[] = []
  for (const raw of parsed) {
    if (typeof raw !== 'object' || raw === null) continue
    const entry = raw as Record<string, unknown>
    if (!isBoundingBox(entry.bounding_box)) continue
    const fieldId = typeof entry.field_id === 'string' && entry.field_id ? entry.field_id : crypto.randomUUID()
    const label = typeof entry.label === 'string' && entry.label ? entry.label : undefined
    const rawKey = typeof entry.suggested_global_key === 'string' ? entry.suggested_global_key : undefined
    const suggestedGlobalKey = rawKey ? GLOBAL_KEY_MAP[rawKey] : undefined

    if (entry.type === 'MULTI_LINE_RULED') {
      const baselineYOffset = typeof entry.baseline_y_offset === 'number' ? entry.baseline_y_offset : 0
      const lineHeight = typeof entry.line_height === 'number' && entry.line_height > 0 ? entry.line_height : 16
      const maxLines = typeof entry.max_lines === 'number' && entry.max_lines > 0 ? Math.round(entry.max_lines) : 3
      fields.push({
        fieldId,
        type: 'MULTI_LINE_RULED',
        boundingBox: entry.bounding_box,
        label,
        suggestedGlobalKey,
        baselineYOffset,
        lineHeight,
        maxLines,
      })
    } else if (entry.type === 'SINGLE_LINE') {
      fields.push({ fieldId, type: 'SINGLE_LINE', boundingBox: entry.bounding_box, label, suggestedGlobalKey })
    }
    // Any other/missing type is dropped rather than guessed at.
  }
  return fields
}

/**
 * Client-side orchestration for the blueprint's Agent C — PDF Field Extractor
 * (Chunk 40), wired into Template Studio (Chunk 18) as an "auto-suggest fields"
 * action instead of requiring every field to be tap-placed by hand. Input is real
 * pdf.js text + position data (`PdfService.getPageTextItems`, Chunk 17/40) — not
 * OCR, since born-digital PDF pages already have a genuine text layer pdf.js can
 * read directly; Tesseract-based OCR (Chunk 9) remains the path for scanned images
 * elsewhere in the app. A page with no extractable text (scanned/image-only PDF, no
 * text layer) honestly reports `no-text` rather than silently returning nothing that
 * looks like "no fields on this page."
 */
export async function suggestFieldsFromPage(params: AskAgentCParams): Promise<AgentCResult> {
  const meaningfulItems = params.textItems.filter((item) => item.text.trim().length > 0)
  if (meaningfulItems.length === 0) {
    return { status: 'no-text', fields: [] }
  }

  const template = getPromptTemplate('agent-c-pdf-field-extractor')!
  const prompt = renderPromptTemplate(template.template, { ocr_text_with_bboxes: serializeTextItems(meaningfulItems) })
  const { text: replyText, circuitOpen } = await callLlm(params.provider, params.apiKey, params.model, prompt)
  if (!replyText) {
    return { status: circuitOpen ? 'provider-unavailable' : 'llm-error', fields: [] }
  }

  return { status: 'suggested', fields: parseSuggestedFields(replyText) }
}
