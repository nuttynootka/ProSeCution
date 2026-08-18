import type { Deadline } from './types'

const CRLF = '\r\n'
const PRODID = '-//PLCM//Pro Se Legal Case Manager//EN'

/**
 * RFC 5545 §3.3.11 TEXT escaping: backslash, semicolon, and comma are
 * meta-characters in this value type and must be backslash-escaped; a literal
 * newline becomes the two-character sequence `\n`, not an actual line break —
 * an unescaped one would be indistinguishable from RFC 5545's own line folding.
 */
function escapeText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r\n|\n|\r/g, '\\n')
}

/**
 * RFC 5545 §3.1 line folding: no physical line may exceed 75 *octets* (not
 * characters — a fold that split a multi-byte UTF-8 character mid-sequence would
 * corrupt it), and a folded continuation is a CRLF followed by exactly one space.
 * The leading space is itself part of the next line's 75-octet budget.
 */
function foldLine(line: string): string {
  const bytes = new TextEncoder().encode(line)
  if (bytes.length <= 75) return line

  const decoder = new TextDecoder()
  const segments: string[] = []
  let start = 0
  let budget = 75

  while (start < bytes.length) {
    let end = Math.min(start + budget, bytes.length)
    // Back off if `end` lands inside a multi-byte sequence (a UTF-8 continuation
    // byte has its top two bits set to 10, i.e. matches 0x80..0xBF).
    while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end -= 1
    segments.push(decoder.decode(bytes.slice(start, end)))
    start = end
    budget = 74 // the next line's leading space counts toward its own 75-octet limit
  }

  return segments.join(CRLF + ' ')
}

function icsDate(epochMs: number): string {
  const d = new Date(epochMs)
  const y = d.getUTCFullYear().toString().padStart(4, '0')
  const m = (d.getUTCMonth() + 1).toString().padStart(2, '0')
  const day = d.getUTCDate().toString().padStart(2, '0')
  return `${y}${m}${day}`
}

function icsDateTimeStamp(epochMs: number): string {
  const d = new Date(epochMs)
  const y = d.getUTCFullYear().toString().padStart(4, '0')
  const m = (d.getUTCMonth() + 1).toString().padStart(2, '0')
  const day = d.getUTCDate().toString().padStart(2, '0')
  const hh = d.getUTCHours().toString().padStart(2, '0')
  const mm = d.getUTCMinutes().toString().padStart(2, '0')
  const ss = d.getUTCSeconds().toString().padStart(2, '0')
  return `${y}${m}${day}T${hh}${mm}${ss}Z`
}

const MS_PER_DAY = 86_400_000

function buildEvent(deadline: Deadline, generatedAt: number): string[] {
  const summary = escapeText(deadline.title)
  const description = escapeText(`${deadline.description} (${deadline.ruleCitation})`)

  return [
    'BEGIN:VEVENT',
    `UID:${deadline.id}@plcm.app`,
    `DTSTAMP:${icsDateTimeStamp(generatedAt)}`,
    // All-day event: a procedural deadline is "due on this date," not at a specific
    // time. DTEND is exclusive per RFC 5545 §3.6.1, so a one-day event ends the day
    // after it starts.
    `DTSTART;VALUE=DATE:${icsDate(deadline.dueDate)}`,
    `DTEND;VALUE=DATE:${icsDate(deadline.dueDate + MS_PER_DAY)}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${description}`,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${summary}`,
    'TRIGGER:-P1D',
    'END:VALARM',
    'END:VEVENT',
  ]
}

/**
 * Builds one RFC 5545 calendar containing one VEVENT per deadline — used for both
 * a single-deadline export and a full-case export, which are the same operation on
 * a list of one versus many. `generatedAt` is a parameter (not `Date.now()` read
 * internally) so the output is deterministic and testable.
 */
export function buildIcsCalendar(deadlines: Deadline[], generatedAt: number = Date.now()): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${PRODID}`,
    'CALSCALE:GREGORIAN',
    ...deadlines.flatMap((d) => buildEvent(d, generatedAt)),
    'END:VCALENDAR',
  ]
  return lines.map(foldLine).join(CRLF) + CRLF
}

/** Sanitized to the conservative subset every filesystem accepts, so a case type or county with punctuation in it can't produce an invalid filename. */
export function icsFilename(label: string): string {
  const safe = label.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'deadlines'
  return `${safe}.ics`
}

/** Triggers a real browser download of the given text as a file — the actual `.ics` handoff to the OS calendar app. Not unit-testable in jsdom; verified against a real browser instead. */
export function triggerIcsDownload(filename: string, icsText: string): void {
  const blob = new Blob([icsText], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}
