import ical, { type CalendarComponent, type VCalendar, type VEvent } from 'node-ical'
import { describe, expect, it } from 'vitest'
import { buildIcsCalendar, icsFilename } from './ics'
import type { Deadline } from './types'

function isVEvent(component: CalendarComponent | VCalendar | undefined): component is VEvent {
  return component !== undefined && component.type === 'VEVENT'
}

function makeDeadline(overrides: Partial<Deadline> = {}): Deadline {
  return {
    id: 'd1',
    caseId: 'c1',
    createdAt: Date.UTC(2026, 2, 2),
    updatedAt: Date.UTC(2026, 2, 2),
    title: 'File an answer or Rule 12 response',
    description: 'A defendant served with a summons and complaint must serve a responsive pleading within 21 days of service.',
    dueDate: Date.UTC(2026, 2, 23),
    ruleCitation: 'Fed. R. Civ. P. 12(a)(1)(A)(i)',
    isWeekendAdjusted: false,
    trigger: 'service_of_summons',
    triggerDate: Date.UTC(2026, 2, 2),
    status: 'pending',
    ...overrides,
  }
}

// The real test of "is this valid RFC 5545" is whether an independent, third-party
// parser (node-ical, not anything written for this app) accepts it and reads back
// the values that went in — not just that our own generator's output "looks right"
// by eye.
describe('buildIcsCalendar — parses correctly with an independent ICS parser', () => {
  it('round-trips a single deadline\'s core fields', () => {
    const deadline = makeDeadline()
    const text = buildIcsCalendar([deadline], Date.UTC(2026, 2, 2, 12, 30, 0))

    const parsed = ical.sync.parseICS(text)
    const events = Object.values(parsed).filter(isVEvent)

    expect(events).toHaveLength(1)
    const [event] = events
    expect(event.uid).toBe('d1@plcm.app')
    expect(event.summary).toBe(deadline.title)
    expect(event.description).toContain(deadline.ruleCitation)
    expect(event.start.toISOString().slice(0, 10)).toBe('2026-03-23')
    // An all-day event: node-ical marks these with a `dateOnly` flag rather than a datetime.
    expect((event.start as unknown as { dateOnly?: boolean }).dateOnly).toBe(true)
  })

  it('produces one VEVENT per deadline for a multi-deadline (full-case) export', () => {
    const a = makeDeadline({ id: 'd1', title: 'File an answer' })
    const b = makeDeadline({ id: 'd2', title: 'Serve initial disclosures', dueDate: Date.UTC(2026, 3, 15) })

    const parsed = ical.sync.parseICS(buildIcsCalendar([a, b]))
    const events = Object.values(parsed).filter(isVEvent)

    expect(events.map((e) => e.uid).sort()).toEqual(['d1@plcm.app', 'd2@plcm.app'])
  })

  it('escapes special characters and the parser reads back the original unescaped text', () => {
    const deadline = makeDeadline({
      title: 'File a response; note comma, and a backslash \\ here',
      description: 'Multi-line description\nwith a real line break',
    })

    const parsed = ical.sync.parseICS(buildIcsCalendar([deadline]))
    const [event] = Object.values(parsed).filter(isVEvent)

    expect(event.summary).toBe('File a response; note comma, and a backslash \\ here')
    expect(event.description).toContain('Multi-line description\nwith a real line break')
  })

  it('folds a long line at 75 octets and the parser still reconstructs the full unfolded text', () => {
    const longTitle = 'A '.repeat(60) + 'very long deadline title that will need folding across multiple physical lines'
    const deadline = makeDeadline({ title: longTitle })
    const text = buildIcsCalendar([deadline])

    // Confirm folding actually happened — some physical line is short (the fold point).
    const rawLines = text.split('\r\n')
    expect(rawLines.some((l) => l.startsWith('SUMMARY'))).toBe(true)
    const summaryLineIndex = rawLines.findIndex((l) => l.startsWith('SUMMARY'))
    expect(rawLines[summaryLineIndex + 1].startsWith(' ')).toBe(true)

    const parsed = ical.sync.parseICS(text)
    const [event] = Object.values(parsed).filter(isVEvent)
    expect(event.summary).toBe(longTitle)
  })

  it('never emits a physical line longer than 75 octets', () => {
    const deadline = makeDeadline({
      description: 'x'.repeat(300),
    })
    const text = buildIcsCalendar([deadline])
    for (const line of text.split('\r\n')) {
      if (line.length === 0) continue
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75)
    }
  })

  it('includes a VALARM one day before the due date', () => {
    const deadline = makeDeadline()
    const text = buildIcsCalendar([deadline])
    expect(text).toContain('BEGIN:VALARM')
    expect(text).toContain('TRIGGER:-P1D')
    expect(text).toContain('ACTION:DISPLAY')
  })

  it('uses CRLF line endings throughout, per RFC 5545', () => {
    const text = buildIcsCalendar([makeDeadline()])
    expect(text).toContain('\r\n')
    expect(text.includes('\n') && !text.includes('\r\n')).toBe(false)
    // No bare LF without a preceding CR.
    expect(/(?<!\r)\n/.test(text)).toBe(false)
  })

  it('wraps a valid VCALENDAR with the required VERSION and PRODID', () => {
    const text = buildIcsCalendar([makeDeadline()])
    expect(text.startsWith('BEGIN:VCALENDAR')).toBe(true)
    expect(text.trim().endsWith('END:VCALENDAR')).toBe(true)
    expect(text).toContain('VERSION:2.0')
    expect(text).toContain('PRODID:')
  })

  it('produces a parseable empty calendar for zero deadlines', () => {
    const text = buildIcsCalendar([])
    const parsed = ical.sync.parseICS(text)
    const events = Object.values(parsed).filter(isVEvent)
    expect(events).toHaveLength(0)
  })
})

describe('icsFilename', () => {
  it('sanitizes punctuation and spaces to hyphens', () => {
    expect(icsFilename('Smith v. Jones (Civil)')).toBe('Smith-v-Jones-Civil.ics')
  })

  it('falls back to a generic name when the label has nothing usable', () => {
    expect(icsFilename('...')).toBe('deadlines.ics')
  })
})
