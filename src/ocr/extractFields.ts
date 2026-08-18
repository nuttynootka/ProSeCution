/**
 * Best-effort regex extraction of a case number from OCR'd text. Deliberately not
 * structured multi-field extraction (party names, court name, filing date) — that
 * needs either much more sophisticated heuristics or an LLM (the blueprint's Agent C,
 * Chunk 35), neither of which this chunk builds. A case number is the one field with
 * a reasonably consistent "Case No." / "Case Number" lead-in across jurisdictions,
 * which is what makes a plain regex a defensible approach here and not elsewhere.
 *
 * Returns null on no match rather than guessing — the caller always offers a manual
 * text field regardless, so a miss just means an empty field to fill in, not a
 * fabricated value presented as if it were read off the page.
 */
// "No\.?" and "Number" as alternatives, not just "No" — "Number" does NOT contain
// "No" as a prefix ("Num...", not "No..."), so matching only "No" silently misses
// the fully-spelled-out label, which is at least as common in practice.
// The colon in the value's character class matters too: federal case numbers look
// like "2:24-cv-01234" (district:year-type-number), not just state-style "24CV1234".
const CASE_NUMBER_PATTERN = /\bCase\s+(?:No\.?|Number)\s*:?\s*([A-Z0-9][A-Z0-9:-]{3,})/i

export function extractCaseNumber(ocrText: string): string | null {
  const match = ocrText.match(CASE_NUMBER_PATTERN)
  // Uppercased for consistent display — court case numbers are conventionally
  // uppercase, and OCR/source casing can vary for reasons that have nothing to do
  // with the actual number (font, scan quality).
  return match ? match[1].toUpperCase() : null
}
