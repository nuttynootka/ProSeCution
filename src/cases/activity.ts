import type { Case, Party, PartyRole } from './types'

export interface ActivityEntry {
  id: string
  title: string
  date: number
  meta: string
  hue: string
}

const ROLE_LABELS: Record<PartyRole, string> = {
  plaintiff: 'Plaintiff',
  defendant: 'Defendant',
  third_party: 'Third party',
}

/**
 * Built entirely from data that's actually real today — case creation and party
 * additions. Nothing here is fabricated to look like a fuller timeline; documents,
 * deadlines, and drafts join this once Chunks 7–47 exist to produce them.
 */
export function buildActivityTimeline(caseRecord: Case, parties: readonly Party[]): ActivityEntry[] {
  const entries: ActivityEntry[] = [
    {
      id: `case-created-${caseRecord.id}`,
      title: 'Case created',
      date: caseRecord.createdAt,
      meta: `${caseRecord.caseType} — ${caseRecord.county}, ${caseRecord.state}`,
      hue: '#60a5fa',
    },
    ...parties.map((party) => ({
      id: `party-added-${party.id}`,
      title: `${ROLE_LABELS[party.role]} added`,
      date: party.createdAt,
      meta: party.name,
      hue: '#a78bfa',
    })),
  ]

  return entries.sort((a, b) => b.date - a.date)
}
