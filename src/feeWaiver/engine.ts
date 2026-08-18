export interface PovertyGuidelineTable {
  year: number
  /** ISO date the table took effect. */
  effectiveDate: string
  baseHouseholdSize: number
  baseAnnualIncome: number
  additionalPersonIncrement: number
}

/**
 * 2026 HHS Poverty Guidelines for the 48 contiguous states and D.C. — 91 Fed. Reg.
 * 1797 (Jan. 15, 2026), effective Jan. 13, 2026. Alaska and Hawaii publish separate,
 * higher figures every year that this doesn't model — same "narrow but real, not a
 * plausible-looking guess" discipline as the deadline engine's seeded jurisdictions.
 * These figures update annually every January; this table needs a corresponding
 * annual update, the same maintenance burden the deadline engine's own seeded rules
 * already carry.
 */
export const FEDERAL_POVERTY_GUIDELINES_2026: PovertyGuidelineTable = {
  year: 2026,
  effectiveDate: '2026-01-13',
  baseHouseholdSize: 1,
  baseAnnualIncome: 15_960,
  additionalPersonIncrement: 5_680,
}

/** The federal poverty guideline annual income for a given household size. */
export function povertyGuidelineIncome(householdSize: number, table: PovertyGuidelineTable = FEDERAL_POVERTY_GUIDELINES_2026): number {
  const extraPeople = Math.max(0, Math.floor(householdSize) - table.baseHouseholdSize)
  return table.baseAnnualIncome + extraPeople * table.additionalPersonIncrement
}

export type FeeWaiverEligibility = 'eligible' | 'not_eligible' | 'undetermined'

export interface FeeWaiverResult {
  eligibility: FeeWaiverEligibility
  /** Empty for a jurisdiction this app has no real rule for at all. */
  ruleCitation: string
  explanation: string
  /** The annual household-income cutoff actually applied, if this jurisdiction's test is income-based. */
  thresholdAnnualIncome: number | null
}

export interface FeeWaiverInput {
  householdSize: number
  annualIncome: number
  /** Rule 3.51(a)(1)'s separate, no-calculation-needed pathway — receiving certain means-tested public benefits. */
  receivesPublicBenefits: boolean
}

const CA_POVERTY_MULTIPLIER = 2 // 200% of the federal poverty guideline, Cal. Gov. Code § 68632(b)(1)

/**
 * Deliberately narrow, the same discipline as the deadline engine (Chunk 12) and the
 * mail-service-extension engine (Chunk 23): only California has a real, checkable
 * bright-line income test this can compute — and even that was verified carefully,
 * not assumed. An earlier, still-published description of Rule 3.51 uses 125% of
 * the federal poverty guideline; that was the standard BEFORE a 2022 budget-trailer
 * amendment (via SB 355) raised it to the current 200% now codified at Cal. Gov.
 * Code § 68632(b)(1) — the 125% figure is the outdated one, not this app's.
 *
 * Federal in forma pauperis status (28 U.S.C. § 1915(a)(1)) has NO fixed income
 * threshold at all: it turns on a judge's discretionary review of a sworn affidavit
 * that the applicant can't afford to pay. There is no number to compute here, so
 * 'federal' honestly returns 'undetermined' with an explanation of why, rather than
 * inventing a threshold federal law doesn't actually have.
 */
export function checkFeeWaiverEligibility(jurisdiction: string, input: FeeWaiverInput): FeeWaiverResult {
  if (jurisdiction === 'CA') {
    if (input.receivesPublicBenefits) {
      return {
        eligibility: 'eligible',
        ruleCitation: 'Cal. Rules of Court, rule 3.51(a)(1)',
        explanation:
          'Receiving a means-tested public benefit (e.g. CalWORKs, SSI, CalFresh, or Medi-Cal) qualifies for a fee waiver without an income calculation.',
        thresholdAnnualIncome: null,
      }
    }

    const threshold = povertyGuidelineIncome(input.householdSize) * CA_POVERTY_MULTIPLIER
    const eligible = input.annualIncome <= threshold
    return {
      eligibility: eligible ? 'eligible' : 'not_eligible',
      ruleCitation: 'Cal. Gov. Code § 68632(b)(1)',
      explanation: eligible
        ? `Household income of $${input.annualIncome.toLocaleString()}/year is at or below 200% of the federal poverty guideline for a household of ${input.householdSize} ($${threshold.toLocaleString()}/year).`
        : `Household income of $${input.annualIncome.toLocaleString()}/year exceeds 200% of the federal poverty guideline for a household of ${input.householdSize} ($${threshold.toLocaleString()}/year). A waiver may still be available by showing you can't pay for both the fees and life's necessities (Cal. Rules of Court, rule 3.52) — this app doesn't evaluate that discretionary path.`,
      thresholdAnnualIncome: threshold,
    }
  }

  if (jurisdiction === 'federal') {
    return {
      eligibility: 'undetermined',
      ruleCitation: '28 U.S.C. § 1915(a)(1)',
      explanation:
        "Federal in forma pauperis status has no fixed income threshold — a judge decides based on your sworn affidavit that you can't afford to pay the fees. This app can't predict that decision, but you can still submit the affidavit and ask.",
      thresholdAnnualIncome: null,
    }
  }

  return {
    eligibility: 'undetermined',
    ruleCitation: '',
    explanation: "We don't have fee waiver rules for this jurisdiction yet. Contact the court clerk or a local legal aid office to ask about a fee waiver.",
    thresholdAnnualIncome: null,
  }
}
