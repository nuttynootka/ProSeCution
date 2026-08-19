export type LegalSourceCategory = 'statutes' | 'case-law' | 'court-rules' | 'agency'

export interface LegalSource {
  id: string
  label: string
  url: string
  category: LegalSourceCategory
  /** Case types (from wizard/constants.ts's CASE_TYPES) this source is especially relevant to. Absent = relevant to every case type — true of statutes/case-law/court-rules, false of a specific agency. */
  caseTypes?: string[]
}

/**
 * The in-browser replacement for Stage 8's original pre-embedded server-side corpus
 * (see the plan's "Architecture history" pivot 3): rather than ingesting and indexing
 * legal text ourselves, this is a curated allowlist of the real, authoritative source
 * pages retrieval (Chunk 31) is restricted to — always current, since nothing here is a
 * copy, just a pointer to the government's own page.
 *
 * Deliberately narrow, the exact same discipline as every other jurisdiction table in
 * this app (deadlines' Chunk 12, mail-service extension's Chunk 23, fee waiver's Chunk
 * 24): only CA and federal are seeded, each with a real, checked URL — not a plausible
 * guess for all 50 states. `hasSeededSources` lets a caller distinguish "we don't cover
 * this jurisdiction yet" from "this jurisdiction has no sources," the same honesty
 * pattern `hasSeededRules` (Chunk 12) already established.
 */
const SOURCES: Record<string, LegalSource[]> = {
  federal: [
    { id: 'federal-us-code', label: 'United States Code', url: 'https://uscode.house.gov/', category: 'statutes' },
    {
      id: 'federal-frcp',
      label: 'Federal Rules of Civil Procedure',
      url: 'https://www.uscourts.gov/rules-policies/current-rules-practice-procedure/federal-rules-civil-procedure',
      category: 'court-rules',
    },
    { id: 'federal-case-law', label: 'CourtListener (federal case law)', url: 'https://www.courtlistener.com/', category: 'case-law' },
  ],
  CA: [
    { id: 'ca-codes', label: 'California Codes', url: 'https://leginfo.legislature.ca.gov/faces/codesTOCSelected.xhtml', category: 'statutes' },
    { id: 'ca-rules-of-court', label: 'California Rules of Court', url: 'https://www.courts.ca.gov/rules.htm', category: 'court-rules' },
    { id: 'ca-opinions', label: 'California Courts Opinions', url: 'https://www.courts.ca.gov/opinions.htm', category: 'case-law' },
    {
      id: 'ca-selfhelp-eviction',
      label: 'California Courts Self-Help: Eviction',
      url: 'https://selfhelp.courts.ca.gov/eviction',
      category: 'agency',
      caseTypes: ['Eviction / Landlord-Tenant'],
    },
    {
      id: 'ca-child-support',
      label: 'California Department of Child Support Services',
      url: 'https://childsupport.ca.gov/',
      category: 'agency',
      caseTypes: ['Family Law'],
    },
    {
      id: 'ca-civil-rights',
      label: 'California Civil Rights Department',
      url: 'https://calcivilrights.ca.gov/',
      category: 'agency',
      caseTypes: ['Employment'],
    },
    {
      id: 'ca-dfpi',
      label: 'California Department of Financial Protection and Innovation',
      url: 'https://dfpi.ca.gov/',
      category: 'agency',
      caseTypes: ['Debt Collection Defense'],
    },
  ],
}

export const SEEDED_LEGAL_SOURCE_JURISDICTIONS: readonly string[] = Object.keys(SOURCES)

export function hasSeededSources(jurisdiction: string): boolean {
  return jurisdiction in SOURCES
}

/**
 * Every source for the jurisdiction whose `caseTypes` is either absent (always
 * relevant) or includes the given case type. Omitting `caseType` returns only the
 * always-relevant sources (statutes/case-law/court-rules) — useful for a caller that
 * doesn't know the case type yet, or wants the jurisdiction-wide baseline.
 */
export function legalSourcesFor(jurisdiction: string, caseType?: string): LegalSource[] {
  const all = SOURCES[jurisdiction] ?? []
  return all.filter((source) => !source.caseTypes || (caseType !== undefined && source.caseTypes.includes(caseType)))
}
