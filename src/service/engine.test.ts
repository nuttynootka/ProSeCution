import { describe, expect, it } from 'vitest'
import { computeMailServiceExtension, SEEDED_MAIL_EXTENSION_JURISDICTIONS } from './engine'

describe('computeMailServiceExtension', () => {
  it('grants 3 extra days for federal mail service, citing Fed. R. Civ. P. 6(d)', () => {
    expect(computeMailServiceExtension('federal', 'mail')).toEqual({ days: 3, ruleCitation: 'Fed. R. Civ. P. 6(d)' })
  })

  it('grants 5 extra days for California mail service, citing Cal. Civ. Proc. Code § 1013(a) — not the federal figure', () => {
    expect(computeMailServiceExtension('CA', 'mail')).toEqual({
      days: 5,
      ruleCitation: 'Cal. Civ. Proc. Code § 1013(a)',
    })
  })

  it('grants nothing for personal service, even in a seeded jurisdiction', () => {
    expect(computeMailServiceExtension('federal', 'personal')).toBeNull()
    expect(computeMailServiceExtension('CA', 'personal')).toBeNull()
  })

  it('grants nothing for electronic service — the 2016 FRCP amendment specifically removed it', () => {
    expect(computeMailServiceExtension('federal', 'electronic')).toBeNull()
    expect(computeMailServiceExtension('CA', 'electronic')).toBeNull()
  })

  it('returns null for an unseeded jurisdiction rather than guessing a number of days', () => {
    expect(computeMailServiceExtension('TX', 'mail')).toBeNull()
  })

  it('exposes exactly the jurisdictions it has real rules for', () => {
    expect(SEEDED_MAIL_EXTENSION_JURISDICTIONS).toEqual(['federal', 'CA'])
  })
})
