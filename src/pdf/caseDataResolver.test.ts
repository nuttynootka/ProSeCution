import { describe, expect, it } from 'vitest'
import type { Case, Party } from '../cases'
import { resolveGlobalKey } from './caseDataResolver'

function makeCase(overrides: Partial<Case> = {}): Case {
  return {
    id: 'c1',
    createdAt: 0,
    updatedAt: 0,
    state: 'CA',
    county: 'Los Angeles',
    caseType: 'Civil',
    currentStage: 'pleadings',
    ...overrides,
  }
}

function makeParty(overrides: Partial<Party> = {}): Party {
  return { id: 'p1', caseId: 'c1', createdAt: 0, updatedAt: 0, name: 'Maria Hartley', role: 'plaintiff', ...overrides }
}

describe('resolveGlobalKey', () => {
  it('resolves case.number when set', () => {
    const data = { case: makeCase({ caseNumber: '24CV1234' }), parties: [] }
    expect(resolveGlobalKey('case.number', data)).toBe('24CV1234')
  })

  it('resolves case.number as undefined when unset, not an empty string or placeholder', () => {
    const data = { case: makeCase(), parties: [] }
    expect(resolveGlobalKey('case.number', data)).toBeUndefined()
  })

  it('resolves case.county and case.type directly', () => {
    const data = { case: makeCase({ county: 'San Diego', caseType: 'Small Claims' }), parties: [] }
    expect(resolveGlobalKey('case.county', data)).toBe('San Diego')
    expect(resolveGlobalKey('case.type', data)).toBe('Small Claims')
  })

  it('resolves case.state through formatJurisdiction, so "federal" is capitalized', () => {
    const data = { case: makeCase({ state: 'federal' }), parties: [] }
    expect(resolveGlobalKey('case.state', data)).toBe('Federal')
  })

  it('resolves plaintiff.name from the party with role plaintiff', () => {
    const data = {
      case: makeCase(),
      parties: [makeParty({ role: 'plaintiff', name: 'Maria Hartley' }), makeParty({ role: 'defendant', name: 'R. Cordova', id: 'p2' })],
    }
    expect(resolveGlobalKey('plaintiff.name', data)).toBe('Maria Hartley')
    expect(resolveGlobalKey('defendant.name', data)).toBe('R. Cordova')
  })

  it('resolves undefined when no party has the requested role', () => {
    const data = { case: makeCase(), parties: [makeParty({ role: 'third_party' })] }
    expect(resolveGlobalKey('plaintiff.name', data)).toBeUndefined()
  })

  it('resolves an unknown key as undefined rather than throwing', () => {
    const data = { case: makeCase(), parties: [] }
    expect(resolveGlobalKey('not.a.real.key', data)).toBeUndefined()
  })
})
