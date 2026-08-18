export type DocumentType = 'Pleading' | 'Motion' | 'Order' | 'Exhibit' | 'Correspondence' | 'Other'

interface Rule {
  type: DocumentType
  pattern: RegExp
}

/**
 * First match wins, so ordering encodes priority — most specific pattern first.
 * "Order" is checked before "Motion" deliberately: a "Motion for an Order to..." is
 * a motion (a request), not a court order, but it contains the word "order." Only
 * judge-signing language ("IT IS HEREBY ORDERED") is specific enough to mean the
 * document actually is one.
 *
 * This is intentionally simple pattern matching, not ML classification — matching
 * the plan's own "rule-based categorization" for this chunk. Every category maps to
 * the blueprint's `document_type` enum.
 */
// \s+ rather than literal single spaces throughout: OCR output can carry irregular
// spacing between characters/words, and these patterns need to tolerate that.
const RULES: Rule[] = [
  { type: 'Order', pattern: /\bIT\s+IS\s+(HEREBY\s+)?(SO\s+)?ORDERED\b/i },
  { type: 'Order', pattern: /\bCOURT\s+ORDER\b/i },
  { type: 'Motion', pattern: /\bMOTION\b/i },
  { type: 'Pleading', pattern: /\b(COMPLAINT|SUMMONS|ANSWER\s+TO\s+COMPLAINT|CROSS-COMPLAINT)\b/i },
  // \b after the designator matters: without it, "exhibit attached" matches too —
  // [A-Z0-9] under /i accepts lowercase, so it'd match "a" at the start of
  // "attached." The trailing \b requires that character to stand alone (A, 1, B2),
  // not begin a longer word.
  { type: 'Exhibit', pattern: /\bEXHIBIT\s+[A-Z0-9]\b/i },
  { type: 'Correspondence', pattern: /\bDear\s+[A-Z]/ },
]

/** Rule-based classification from OCR'd text. Falls back to 'Other' when nothing matches — never guesses. */
export function categorizeDocument(ocrText: string): DocumentType {
  for (const rule of RULES) {
    if (rule.pattern.test(ocrText)) return rule.type
  }
  return 'Other'
}
