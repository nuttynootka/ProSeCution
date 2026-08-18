import { describe, expect, it } from 'vitest'
import { detectPii, redactText, type PiiMatch } from './detectPii'

const TODAY = new Date(2024, 0, 1) // fixed reference date — keeps minor/adult classification deterministic

describe('detectPii > SSN', () => {
  it('detects a plain dashed SSN', () => {
    const matches = detectPii('My number is 555-44-3333 on the form.')
    expect(matches).toHaveLength(1)
    expect(matches[0]).toMatchObject({ type: 'ssn', text: '555-44-3333' })
  })

  it('detects a labeled SSN without dashes, capturing only the digits', () => {
    const text = 'SSN: 555443333 was provided.'
    const matches = detectPii(text)
    expect(matches).toHaveLength(1)
    expect(matches[0].text).toBe('555443333')
    expect(text.slice(matches[0].start, matches[0].end)).toBe('555443333')
  })

  it('recognizes "Social Security Number" as a label', () => {
    const matches = detectPii('Social Security Number: 555-44-3333')
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe('ssn')
  })

  it('does not double-count a labeled SSN that also matches the plain dashed pattern', () => {
    const matches = detectPii('SSN: 555-44-3333')
    expect(matches).toHaveLength(1)
  })

  it.each([
    ['area 000 is never issued', '000-12-3456'],
    ['area 666 is never issued', '666-12-3456'],
    ['area 900+ is never issued', '923-45-6789'],
    ['group 00 is never issued', '123-00-4567'],
    ['serial 0000 is never issued', '123-45-0000'],
  ])('rejects a format-valid but SSA-impossible SSN: %s', (_label, ssn) => {
    expect(detectPii(`Number: ${ssn}`)).toHaveLength(0)
  })

  it('does not mistake a 3-3-4 phone number for a 3-2-4 SSN', () => {
    expect(detectPii('Call 555-867-5309 for details.')).toHaveLength(0)
  })

  it('cites Fed. R. Civ. P. 5.2', () => {
    const [match] = detectPii('555-44-3333')
    expect(match.ruleCitation).toContain('Fed. R. Civ. P. 5.2')
  })
})

describe('detectPii > DOB and minors', () => {
  it('parses a labeled MM/DD/YYYY date of birth', () => {
    const matches = detectPii('DOB: 03/03/1975', { today: TODAY })
    expect(matches).toHaveLength(1)
    expect(matches[0]).toMatchObject({ type: 'dob', text: '03/03/1975' })
  })

  it('parses an ISO date after "Date of Birth"', () => {
    const matches = detectPii('Date of Birth: 1975-03-03', { today: TODAY })
    expect(matches).toHaveLength(1)
    expect(matches[0].text).toBe('1975-03-03')
  })

  it('parses a month-name date after "Born on"', () => {
    const matches = detectPii('Born on March 3, 1975', { today: TODAY })
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe('dob')
  })

  it('parses "D.O.B." with an abbreviated month and no comma', () => {
    const matches = detectPii('D.O.B. Jan 9 1999', { today: TODAY })
    expect(matches).toHaveLength(1)
    expect(matches[0].text).toBe('Jan 9 1999')
  })

  it('classifies a DOB under 18 years old as minor-dob, not dob', () => {
    const matches = detectPii('DOB: 05/12/2010', { today: TODAY }) // 13 years old as of TODAY
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe('minor-dob')
    expect(matches[0].ruleCitation).toContain('minor')
  })

  it('classifies a DOB 18 or older as plain dob', () => {
    const matches = detectPii('DOB: 01/01/2006', { today: TODAY }) // exactly 18 as of TODAY
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe('dob')
  })

  it('rejects a date of birth in the future', () => {
    expect(detectPii('DOB: 12/31/2030', { today: TODAY })).toHaveLength(0)
  })

  it('rejects an implausibly old date of birth rather than assuming it is real', () => {
    expect(detectPii('DOB: 01/01/1800', { today: TODAY })).toHaveLength(0)
  })

  it('rejects a calendar-invalid date (Feb 30) instead of silently rolling it over', () => {
    expect(detectPii('DOB: 02/30/2010', { today: TODAY })).toHaveLength(0)
  })

  it('does not flag an unlabeled date as a DOB', () => {
    expect(detectPii('Filed on 03/03/1975.', { today: TODAY })).toHaveLength(0)
  })
})

describe('detectPii > financial accounts', () => {
  it('detects a Luhn-valid card number', () => {
    const matches = detectPii('Card on file: 4111 1111 1111 1111')
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe('financial-account')
  })

  it('rejects a Luhn-invalid number of the same length', () => {
    expect(detectPii('Card on file: 4111 1111 1111 1112')).toHaveLength(0)
  })

  it('detects a labeled account number', () => {
    const text = 'Account #: 1234567890'
    const matches = detectPii(text)
    expect(matches).toHaveLength(1)
    expect(matches[0].text).toBe('1234567890')
  })

  it('detects a checksum-valid ABA routing number labeled "Routing"', () => {
    // 026009593 is Bank of America's long-published, publicly known routing number.
    const matches = detectPii('Routing Number: 026009593')
    expect(matches).toHaveLength(1)
    expect(matches[0].text).toBe('026009593')
  })

  it('rejects a 9-digit "Routing" value that fails the ABA checksum', () => {
    expect(detectPii('Routing Number: 123456789')).toHaveLength(0)
  })

  it('does not flag an unlabeled 9-digit number as a routing number', () => {
    expect(detectPii('Reference 123456789 on the invoice.')).toHaveLength(0)
  })

  it('cites Fed. R. Civ. P. 5.2 for financial accounts', () => {
    const [match] = detectPii('Account #: 1234567890')
    expect(match.ruleCitation).toContain('Fed. R. Civ. P. 5.2')
  })
})

describe('detectPii > false-positive traps', () => {
  // A realistic slice of case-management text with several things that LOOK like the
  // patterns above but genuinely are not — the honest test of a rule-based detector
  // isn't just "does it find real PII," it's "does it leave everything else alone."
  const text = [
    'Case No. 24CV01234, Superior Court of California, County of Los Angeles.',
    'Hearing scheduled for 03/03/2025 at 9:00 AM in Department 12.',
    'Plaintiff may be reached at (555) 867-5309.',
    'Total damages claimed: $45,678.90.',
    'Exhibit reference number: 2024-000-778.',
    'Filing fee paid: $435.00.',
  ].join(' ')

  it('flags nothing in text with only case numbers, phone numbers, dates, and amounts', () => {
    expect(detectPii(text, { today: TODAY })).toHaveLength(0)
  })
})

describe('detectPii > precision/recall over a seeded mixed document', () => {
  // A single document combining every true-positive type this engine claims to find,
  // interleaved with every near-miss trap it claims to avoid — checked against an
  // exact expected set, not just "at least one" or "none," so both a missed detection
  // (recall) and a spurious one (precision) fail the test.
  const seeded = [
    'Client: Maria Hartley. SSN: 555-44-3333.',
    "Client's minor son DOB: 05/12/2015.",
    "Client's own DOB: Born on March 3, 1975.",
    'Bank account on file, Account #: 1234567890, Routing Number: 026009593.',
    'Credit card used for filing fee: 4111 1111 1111 1111.',
    'Case No. 24CV01234, hearing 03/03/2025, phone (555) 867-5309, fees $435.00.',
  ].join(' ')

  it('finds exactly the seeded true positives, in source order, with none of the traps', () => {
    const matches = detectPii(seeded, { today: TODAY })
    const summary = matches.map((m) => ({ type: m.type, text: m.text }))

    expect(summary).toEqual([
      { type: 'ssn', text: '555-44-3333' },
      { type: 'minor-dob', text: '05/12/2015' },
      { type: 'dob', text: 'March 3, 1975' },
      { type: 'financial-account', text: '1234567890' },
      { type: 'financial-account', text: '026009593' },
      { type: 'financial-account', text: '4111 1111 1111 1111' },
    ])
  })
})

describe('redactText', () => {
  it('replaces each match with a labeled placeholder and preserves surrounding text', () => {
    const text = 'SSN: 555-44-3333, filed 01/01/2024.'
    const matches = detectPii(text, { today: TODAY })
    expect(redactText(text, matches)).toBe('SSN: [REDACTED-SSN], filed 01/01/2024.')
  })

  it('redacts multiple matches of different types in one pass', () => {
    const text = 'SSN 555-44-3333 and card 4111 1111 1111 1111 on file.'
    const matches = detectPii(text)
    expect(redactText(text, matches)).toBe('SSN [REDACTED-SSN] and card [REDACTED-ACCOUNT] on file.')
  })

  it('uses a distinct label for a minor DOB versus an adult DOB', () => {
    const text = "Child's DOB: 05/12/2015. Parent's DOB: 03/03/1975."
    const matches = detectPii(text, { today: TODAY })
    expect(redactText(text, matches)).toBe("Child's DOB: [REDACTED-MINOR DOB]. Parent's DOB: [REDACTED-DOB].")
  })

  it('returns the original text unchanged when there are no matches', () => {
    expect(redactText('Nothing sensitive here.', [])).toBe('Nothing sensitive here.')
  })

  it('honors caller-supplied matches directly, so a manual override can drop a false positive', () => {
    const text = 'SSN 555-44-3333 and 078-05-1120.'
    const all = detectPii(text)
    expect(all).toHaveLength(2)
    const overridden = all.filter((m) => m.text === '555-44-3333')
    expect(redactText(text, overridden)).toBe('SSN [REDACTED-SSN] and 078-05-1120.')
  })

  it('skips a match that overlaps one already applied, rather than corrupting the output', () => {
    const text = '555-44-3333'
    const overlapping: PiiMatch[] = [
      { type: 'ssn', text: '555-44-3333', start: 0, end: 11, ruleCitation: 'x' },
      { type: 'ssn', text: '44-3333', start: 4, end: 11, ruleCitation: 'x' },
    ]
    expect(redactText(text, overlapping)).toBe('[REDACTED-SSN]')
  })
})
