import { describe, expect, it } from 'vitest'
import { hasSeededSources, legalSourcesFor, SEEDED_LEGAL_SOURCE_JURISDICTIONS } from './registry'

describe('legalSourcesFor', () => {
  it('returns only always-relevant sources when no case type is given', () => {
    const sources = legalSourcesFor('CA')
    expect(sources.map((s) => s.category).sort()).toEqual(['case-law', 'court-rules', 'statutes'])
  })

  it('adds the case-type-specific agency source when a matching case type is given', () => {
    const sources = legalSourcesFor('CA', 'Eviction / Landlord-Tenant')
    expect(sources.map((s) => s.id)).toContain('ca-selfhelp-eviction')
    expect(sources).toHaveLength(4) // 3 always-relevant + 1 eviction-specific
  })

  it('excludes an agency source that does not match the given case type', () => {
    const sources = legalSourcesFor('CA', 'Small Claims')
    expect(sources.map((s) => s.id)).not.toContain('ca-child-support')
    expect(sources).toHaveLength(3) // just the always-relevant ones
  })

  it('returns real, https URLs for every seeded source', () => {
    for (const jurisdiction of SEEDED_LEGAL_SOURCE_JURISDICTIONS) {
      for (const source of legalSourcesFor(jurisdiction)) {
        expect(source.url).toMatch(/^https:\/\//)
      }
    }
  })

  it('returns nothing for an unseeded jurisdiction, rather than guessing', () => {
    expect(legalSourcesFor('TX')).toEqual([])
    expect(hasSeededSources('TX')).toBe(false)
  })

  it('exposes exactly the jurisdictions it has real sources for', () => {
    expect(SEEDED_LEGAL_SOURCE_JURISDICTIONS).toEqual(['federal', 'CA'])
    expect(hasSeededSources('federal')).toBe(true)
    expect(hasSeededSources('CA')).toBe(true)
  })
})
