import type { Document } from '../documents/types'
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
 * Built entirely from data that's actually real today — case creation, party
 * additions, and (as of Chunk 8) documents added. Nothing here is fabricated to look
 * like a fuller timeline; deadlines and drafts join this once Chunks 12–16 and 43
 * exist to produce them.
 */
export function buildActivityTimeline(
  caseRecord: Case,
  parties: readonly Party[],
  documents: readonly Document[] = [],
): ActivityEntry[] {
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
    ...documents.map((doc) => ({
      id: `document-added-${doc.id}`,
      title: 'Document added',
      date: doc.createdAt,
      meta: doc.originalFilename,
      hue: '#34d399',
    })),
  ]

  return entries.sort((a, b) => b.date - a.date)
}
