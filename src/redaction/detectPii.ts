/**
 * Pure, offline, regex/checksum-based PII detection over OCR'd or typed text. No
 * network call, no LLM — this only needs to run against document text the app
 * already has on-device, and a rule-based pass is precise enough for the four
 * identifier types the blueprint calls out (SSN, DOB, minors, financial accounts)
 * without needing a model. Agent E (Stage 9) is reserved for genuinely ambiguous
 * cases a rule can't resolve, not for replacing this.
 *
 * Deliberately scoped down on "minor names": detecting that a *name* belongs to a
 * minor from text alone needs real NLP (named-entity recognition plus real-world
 * knowledge of which named person is under 18) — a regex engine guessing at that
 * would produce far more false positives/negatives than it's worth trusting. What
 * this DOES detect reliably is a date of birth, and a date of birth alone is enough
 * to compute an age — so a DOB that resolves to under 18 is flagged as a minor's
 * identifying information, which is the specific, checkable claim regex-level
 * detection can actually stand behind.
 */

export type PiiType = 'ssn' | 'dob' | 'minor-dob' | 'financial-account'

export interface PiiMatch {
  type: PiiType
  /** The exact substring matched, as found in the source text — never reconstructed. */
  text: string
  start: number
  end: number
  ruleCitation: string
}

export interface DetectPiiOptions {
  /** Injectable so minor-age detection is deterministic in tests. Defaults to the real current date. */
  today?: Date
}

const SSN_RULE = 'Fed. R. Civ. P. 5.2(a)(1) — Social Security numbers are limited to the last four digits in public filings.'
const DOB_RULE = 'Fed. R. Civ. P. 5.2(a)(3) — dates of birth are limited to the birth year in public filings.'
const MINOR_DOB_RULE =
  "Fed. R. Civ. P. 5.2(a)(2)–(3) — a minor's identifying information is limited to initials, and dates of birth to the birth year."
const FINANCIAL_RULE =
  'Fed. R. Civ. P. 5.2(a)(4) — financial account numbers are limited to the last four digits in public filings.'

function overlaps(a: { start: number; end: number }, b: { start: number; end: number }): boolean {
  return a.start < b.end && b.start < a.end
}

function addIfNotOverlapping(matches: PiiMatch[], next: PiiMatch): void {
  if (matches.some((m) => overlaps(m, next))) return
  matches.push(next)
}

// --- SSN --------------------------------------------------------------------

// SSA never issues an area of 000/666/900-999, a group of 00, or a serial of 0000 —
// checking this rules out a meaningful share of format-valid-but-real-world-impossible
// matches (e.g. a form's "000-00-0000" placeholder) without needing any context.
function isPlausibleSsn(area: string, group: string, serial: string): boolean {
  const areaNum = Number(area)
  if (area === '000' || area === '666' || areaNum >= 900) return false
  if (group === '00') return false
  if (serial === '0000') return false
  return true
}

// Captures the digit run as a single group in both patterns, rather than one group
// per component, so the reported match span is always just the identifier itself —
// never a label like "SSN:" swept in alongside it, which would also make redactText
// delete text that was never actually part of the sensitive value.
const SSN_DIGITS_PATTERN = /^(\d{3})[\s-]?(\d{2})[\s-]?(\d{4})$/
const SSN_LABELED_PATTERN = /\b(?:SSN|Social\s+Security(?:\s+Number)?)\.?\s*:?\s*(\d{3}[\s-]?\d{2}[\s-]?\d{4})\b/gi
const SSN_DASHED_PATTERN = /\b(\d{3}-\d{2}-\d{4})\b/g

function detectSsn(text: string): PiiMatch[] {
  const matches: PiiMatch[] = []
  for (const pattern of [SSN_LABELED_PATTERN, SSN_DASHED_PATTERN]) {
    pattern.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = pattern.exec(text))) {
      const digitsText = m[1]
      const parts = digitsText.match(SSN_DIGITS_PATTERN)
      if (!parts || !isPlausibleSsn(parts[1], parts[2], parts[3])) continue
      const start = m.index + m[0].length - digitsText.length
      addIfNotOverlapping(matches, {
        type: 'ssn',
        text: digitsText,
        start,
        end: start + digitsText.length,
        ruleCitation: SSN_RULE,
      })
    }
  }
  return matches
}

// --- DOB --------------------------------------------------------------------

const MONTH_LOOKUP: Record<string, number> = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3, may: 4,
  jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8, september: 8,
  oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
}

const DATE_SUB_PATTERN = String.raw`\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[/\-.]\d{1,2}[/\-.]\d{4}|[A-Za-z]{3,9}\.?\s+\d{1,2},?\s+\d{4}`

const DOB_LABELED_PATTERN = new RegExp(
  String.raw`\b(?:DOB|D\.O\.B\.|Date\s+of\s+Birth|Born(?:\s+on)?)\s*:?\s*(${DATE_SUB_PATTERN})\b`,
  'gi',
)

/** Returns null for anything that doesn't parse to a real calendar date. */
function parseDateLoose(s: string): Date | null {
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (m) return buildDate(Number(m[1]), Number(m[2]) - 1, Number(m[3]))

  m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/)
  if (m) return buildDate(Number(m[3]), Number(m[1]) - 1, Number(m[2]))

  m = s.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})$/)
  if (m) {
    const monthIndex = MONTH_LOOKUP[m[1].toLowerCase()]
    if (monthIndex === undefined) return null
    return buildDate(Number(m[3]), monthIndex, Number(m[2]))
  }

  return null
}

/** Rejects e.g. "Feb 30" — JS Date silently rolls those into the next month otherwise. */
function buildDate(year: number, monthIndex: number, day: number): Date | null {
  const date = new Date(year, monthIndex, day)
  if (date.getFullYear() !== year || date.getMonth() !== monthIndex || date.getDate() !== day) return null
  return date
}

function ageAt(dob: Date, today: Date): number {
  let age = today.getFullYear() - dob.getFullYear()
  const hadBirthdayThisYear =
    today.getMonth() > dob.getMonth() || (today.getMonth() === dob.getMonth() && today.getDate() >= dob.getDate())
  if (!hadBirthdayThisYear) age -= 1
  return age
}

function detectDob(text: string, today: Date): PiiMatch[] {
  const matches: PiiMatch[] = []
  DOB_LABELED_PATTERN.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = DOB_LABELED_PATTERN.exec(text))) {
    const dateText = m[1]
    const dob = parseDateLoose(dateText)
    if (!dob || dob > today) continue
    const age = ageAt(dob, today)
    if (age > 120) continue // implausible — more likely a mis-parsed date than a real DOB

    const dateStart = m.index + m[0].length - dateText.length
    const isMinor = age < 18
    matches.push({
      type: isMinor ? 'minor-dob' : 'dob',
      text: dateText,
      start: dateStart,
      end: dateStart + dateText.length,
      ruleCitation: isMinor ? MINOR_DOB_RULE : DOB_RULE,
    })
  }
  return matches
}

// --- Financial accounts ------------------------------------------------------

function luhnValid(digits: string): boolean {
  let sum = 0
  let double = false
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48
    if (double) {
      d *= 2
      if (d > 9) d -= 9
    }
    sum += d
    double = !double
  }
  return sum % 10 === 0
}

// ABA routing-number check digit (see 12 CFR Part 210 App. B): 3(d1+d4+d7) + 7(d2+d5+d8) + (d3+d6+d9) ≡ 0 (mod 10).
function routingChecksumValid(digits: string): boolean {
  if (digits.length !== 9) return false
  const d = digits.split('').map(Number)
  const sum = 3 * (d[0] + d[3] + d[6]) + 7 * (d[1] + d[4] + d[7]) + 1 * (d[2] + d[5] + d[8])
  return sum % 10 === 0
}

const CARD_NUMBER_PATTERN = /\b(?:\d[ -]?){12,18}\d\b/g
const LABELED_ACCOUNT_PATTERN = /\b(?:Account|Acct)\.?\s*(?:#|No\.?|Number)\s*:?\s*(\d{6,17})\b/gi
const LABELED_ROUTING_PATTERN = /\b(?:Routing)\.?\s*(?:#|No\.?|Number)?\s*:?\s*(\d{9})\b/gi

function detectFinancialAccounts(text: string): PiiMatch[] {
  const matches: PiiMatch[] = []

  LABELED_ROUTING_PATTERN.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = LABELED_ROUTING_PATTERN.exec(text))) {
    if (!routingChecksumValid(m[1])) continue
    const start = m.index + m[0].length - m[1].length
    addIfNotOverlapping(matches, {
      type: 'financial-account',
      text: m[1],
      start,
      end: start + m[1].length,
      ruleCitation: FINANCIAL_RULE,
    })
  }

  LABELED_ACCOUNT_PATTERN.lastIndex = 0
  while ((m = LABELED_ACCOUNT_PATTERN.exec(text))) {
    const start = m.index + m[0].length - m[1].length
    addIfNotOverlapping(matches, {
      type: 'financial-account',
      text: m[1],
      start,
      end: start + m[1].length,
      ruleCitation: FINANCIAL_RULE,
    })
  }

  CARD_NUMBER_PATTERN.lastIndex = 0
  while ((m = CARD_NUMBER_PATTERN.exec(text))) {
    const digits = m[0].replace(/[ -]/g, '')
    if (digits.length < 13 || digits.length > 19) continue
    if (!luhnValid(digits)) continue
    addIfNotOverlapping(matches, {
      type: 'financial-account',
      text: m[0],
      start: m.index,
      end: m.index + m[0].length,
      ruleCitation: FINANCIAL_RULE,
    })
  }

  return matches
}

/**
 * Scans free text for SSNs, dates of birth (flagging minors' DOBs distinctly), and
 * financial account numbers. Matches are non-overlapping — the most specific /
 * highest-precision detector for a span wins — and returned in source order.
 */
export function detectPii(text: string, options: DetectPiiOptions = {}): PiiMatch[] {
  const today = options.today ?? new Date()
  const matches: PiiMatch[] = []
  for (const m of detectSsn(text)) addIfNotOverlapping(matches, m)
  for (const m of detectDob(text, today)) addIfNotOverlapping(matches, m)
  for (const m of detectFinancialAccounts(text)) addIfNotOverlapping(matches, m)
  return matches.sort((a, b) => a.start - b.start)
}

const REDACTION_LABEL: Record<PiiType, string> = {
  ssn: 'SSN',
  dob: 'DOB',
  'minor-dob': 'MINOR DOB',
  'financial-account': 'ACCOUNT',
}

/**
 * Replaces each match's span with a labeled placeholder. Takes matches as an
 * explicit argument, rather than re-running detectPii itself, so a caller can first
 * apply manual overrides (Chunk 22 — add a missed one, drop a false positive) and
 * have this redact exactly what the user confirmed, not just what the engine guessed.
 */
export function redactText(text: string, matches: PiiMatch[]): string {
  let result = ''
  let cursor = 0
  for (const match of [...matches].sort((a, b) => a.start - b.start)) {
    if (match.start < cursor) continue // overlapping/out-of-order input — skip rather than corrupt output
    result += text.slice(cursor, match.start)
    result += `[REDACTED-${REDACTION_LABEL[match.type]}]`
    cursor = match.end
  }
  result += text.slice(cursor)
  return result
}
