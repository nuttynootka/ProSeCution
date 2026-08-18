import { describe, expect, it } from 'vitest'
import type { Document } from '../documents/types'
import { buildActivityTimeline } from './activity'
import type { Case, Party } from './types'

function makeCase(overrides: Partial<Case> = {}): Case {
  return {
    id: 'case-1',
    state: 'CA',
    county: 'Los Angeles',
    caseType: 'Civil',
    currentStage: 'pleadings',
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  }
}

function makeParty(overrides: Partial<Party> = {}): Party {
  return {
    id: 'party-1',
    caseId: 'case-1',
    name: 'Maria Hartley',
    role: 'plaintiff',
    createdAt: 2000,
    updatedAt: 2000,
    ...overrides,
  }
}

function makeDocument(overrides: Partial<Document> = {}): Document {
  return {
    id: 'doc-1',
    caseId: 'case-1',
    originalFilename: 'exhibit-a.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 1024,
    createdAt: 3000,
    updatedAt: 3000,
    ...overrides,
  }
}

describe('buildActivityTimeline', () => {
  it('includes a case-created entry even with no parties', () => {
    const timeline = buildActivityTimeline(makeCase(), [])
    expect(timeline).toHaveLength(1)
    expect(timeline[0].title).toBe('Case created')
  })

  it('includes one entry per party, labeled by role', () => {
    const plaintiff = makeParty({ id: 'p1', role: 'plaintiff', name: 'Maria Hartley' })
    const defendant = makeParty({ id: 'p2', role: 'defendant', name: 'R. Cordova' })

    const timeline = buildActivityTimeline(makeCase(), [plaintiff, defendant])

    expect(timeline).toHaveLength(3)
    expect(timeline.find((e) => e.id === 'party-added-p1')?.title).toBe('Plaintiff added')
    expect(timeline.find((e) => e.id === 'party-added-p2')?.title).toBe('Defendant added')
  })

  it('sorts most recent first', () => {
    const caseRecord = makeCase({ createdAt: 1000 })
    const early = makeParty({ id: 'p1', createdAt: 1500 })
    const late = makeParty({ id: 'p2', createdAt: 2000 })

    const timeline = buildActivityTimeline(caseRecord, [early, late])

    expect(timeline.map((e) => e.id)).toEqual(['party-added-p2', 'party-added-p1', `case-created-${caseRecord.id}`])
  })

  it('does not fabricate entries beyond case creation, party additions, and documents', () => {
    const timeline = buildActivityTimeline(makeCase(), [makeParty()], [makeDocument()])
    expect(timeline.every((e) => e.title === 'Case created' || e.title.endsWith('added'))).toBe(true)
  })

  it('includes one entry per document, and defaults to none when omitted', () => {
    expect(buildActivityTimeline(makeCase(), [])).toHaveLength(1) // no documents param at all

    const doc = makeDocument({ id: 'd1', originalFilename: 'summons.pdf' })
    const timeline = buildActivityTimeline(makeCase(), [], [doc])

    expect(timeline).toHaveLength(2)
    const entry = timeline.find((e) => e.id === 'document-added-d1')
    expect(entry?.title).toBe('Document added')
    expect(entry?.meta).toBe('summons.pdf')
  })

  it('interleaves documents with parties by actual date, not by type', () => {
    const caseRecord = makeCase({ createdAt: 1000 })
    const party = makeParty({ id: 'p1', createdAt: 3000 })
    const doc = makeDocument({ id: 'd1', createdAt: 2000 })

    const timeline = buildActivityTimeline(caseRecord, [party], [doc])

    expect(timeline.map((e) => e.id)).toEqual(['party-added-p1', 'document-added-d1', `case-created-${caseRecord.id}`])
  })
})
