import { isFederalHolidayOrWeekend } from './holidays'

const MS_PER_DAY = 86_400_000

function addUtcDays(date: number, days: number): number {
  return date + days * MS_PER_DAY
}

function toUtcMidnight(date: number): number {
  const d = new Date(date)
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}

/** Mirrors the blueprint's `TriggerEvent` enum (10.3 DeadlineCalculationEngine.kt). */
export type TriggerEvent =
  | 'service_of_summons'
  | 'filing_of_complaint'
  | 'filing_of_answer'
  | 'filing_of_motion'
  | 'court_order'
  | 'discovery_request'

export interface CalculatedDeadline {
  title: string
  description: string
  /** UTC midnight of the due date, already rolled forward off any weekend/holiday. */
  dueDate: number
  ruleCitation: string
  isWeekendAdjusted: boolean
}

interface JurisdictionRule {
  trigger: TriggerEvent
  title: string
  description: string
  /** Calendar days from (not including) the trigger date — FRCP 6(a)(1)(A)'s "exclude the day of the event" convention, which every seeded jurisdiction here also follows. */
  days: number
  ruleCitation: string
}

/**
 * Deliberately tiny. A wrong deadline is not a cosmetic bug in this app — it's a
 * missed filing — so this only seeds rules with a citation confident enough to stand
 * behind, rather than a plausible-looking number for every jurisdiction. Every other
 * state/trigger combination returns no deadlines (see `hasSeededRules`), and the
 * caller is expected to say so honestly instead of presenting a guess as fact.
 *
 * Both seeded rules answer the single question a newly-served pro se defendant most
 * urgently needs: how long do I have to respond. Motion-response and discovery
 * deadlines vary too much by motion type and local rule to responsibly hardcode here.
 */
const JURISDICTION_RULES: Record<string, JurisdictionRule[]> = {
  federal: [
    {
      trigger: 'service_of_summons',
      title: 'File an answer or Rule 12 response',
      description:
        'A defendant served with a summons and complaint must serve a responsive pleading within 21 days of service.',
      days: 21,
      ruleCitation: 'Fed. R. Civ. P. 12(a)(1)(A)(i)',
    },
  ],
  CA: [
    {
      trigger: 'service_of_summons',
      title: 'File a written response',
      description:
        'A defendant served with a summons must file a written response with the court within 30 calendar days of service.',
      days: 30,
      ruleCitation: 'Cal. Civ. Proc. Code § 412.20(a)(3)',
    },
  ],
}

export const SEEDED_JURISDICTIONS: readonly string[] = Object.keys(JURISDICTION_RULES)

/** Whether `calculateDeadlines` has any real rules for this jurisdiction at all — lets a caller distinguish "no deadlines apply" from "we don't cover this jurisdiction yet." */
export function hasSeededRules(jurisdiction: string): boolean {
  return jurisdiction in JURISDICTION_RULES
}

function adjustForWeekendAndHoliday(date: number): number {
  let adjusted = date
  while (isFederalHolidayOrWeekend(adjusted)) {
    adjusted = addUtcDays(adjusted, 1)
  }
  return adjusted
}

/**
 * Pure date math — no I/O, no case/document lookups. `triggerDate` is normalized to
 * UTC midnight first so day-counting and holiday comparison aren't thrown off by a
 * caller passing a timestamp with a time-of-day component.
 *
 * State-court holiday calendars can differ from (and add to) the federal one this
 * uses for weekend/holiday adjustment — e.g. many California courts also close for
 * Cesar Chavez Day and the day after Thanksgiving. Not modeling that per-state is a
 * known simplification, not a hidden one: it means an adjusted date could occasionally
 * land on a day a specific state court is actually closed, in which case the true
 * procedural deadline extends one further day under that court's own rule.
 */
export function calculateDeadlines(
  jurisdiction: string,
  trigger: TriggerEvent,
  triggerDate: number,
): CalculatedDeadline[] {
  const normalizedTrigger = toUtcMidnight(triggerDate)
  const rules = JURISDICTION_RULES[jurisdiction] ?? []

  return rules
    .filter((rule) => rule.trigger === trigger)
    .map((rule) => {
      const raw = addUtcDays(normalizedTrigger, rule.days)
      const dueDate = adjustForWeekendAndHoliday(raw)
      return {
        title: rule.title,
        description: rule.description,
        dueDate,
        ruleCitation: rule.ruleCitation,
        isWeekendAdjusted: dueDate !== raw,
      }
    })
}
