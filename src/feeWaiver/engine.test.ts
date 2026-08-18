import { describe, expect, it } from 'vitest'
import { checkFeeWaiverEligibility, povertyGuidelineIncome } from './engine'

describe('povertyGuidelineIncome', () => {
  it('returns the base amount for a household of 1', () => {
    expect(povertyGuidelineIncome(1)).toBe(15_960)
  })

  it('adds the per-person increment for larger households', () => {
    expect(povertyGuidelineIncome(4)).toBe(33_000)
    expect(povertyGuidelineIncome(8)).toBe(55_720)
  })

  it('keeps adding the increment past the table\'s listed sizes', () => {
    expect(povertyGuidelineIncome(10)).toBe(55_720 + 2 * 5_680)
  })

  it('never counts a household smaller than the base as negative extra people', () => {
    expect(povertyGuidelineIncome(0)).toBe(15_960)
  })
})

describe('checkFeeWaiverEligibility > California', () => {
  it('is eligible with income at or below 200% of the poverty guideline', () => {
    // 200% of $15,960 (household of 1) = $31,920
    const result = checkFeeWaiverEligibility('CA', { householdSize: 1, annualIncome: 31_920, receivesPublicBenefits: false })
    expect(result.eligibility).toBe('eligible')
    expect(result.ruleCitation).toBe('Cal. Gov. Code § 68632(b)(1)')
    expect(result.thresholdAnnualIncome).toBe(31_920)
  })

  it('is not eligible with income even $1 above the threshold', () => {
    const result = checkFeeWaiverEligibility('CA', { householdSize: 1, annualIncome: 31_921, receivesPublicBenefits: false })
    expect(result.eligibility).toBe('not_eligible')
    expect(result.explanation).toContain('exceeds')
  })

  it('scales the threshold with household size', () => {
    // 200% of $33,000 (household of 4) = $66,000
    const eligible = checkFeeWaiverEligibility('CA', { householdSize: 4, annualIncome: 66_000, receivesPublicBenefits: false })
    expect(eligible.eligibility).toBe('eligible')
    expect(eligible.thresholdAnnualIncome).toBe(66_000)

    const notEligible = checkFeeWaiverEligibility('CA', { householdSize: 4, annualIncome: 70_000, receivesPublicBenefits: false })
    expect(notEligible.eligibility).toBe('not_eligible')
  })

  it('is eligible via public benefits regardless of income, citing the separate rule', () => {
    const result = checkFeeWaiverEligibility('CA', { householdSize: 1, annualIncome: 500_000, receivesPublicBenefits: true })
    expect(result.eligibility).toBe('eligible')
    expect(result.ruleCitation).toBe('Cal. Rules of Court, rule 3.51(a)(1)')
    expect(result.thresholdAnnualIncome).toBeNull()
  })
})

describe('checkFeeWaiverEligibility > federal', () => {
  it('is honestly undetermined — federal IFP has no fixed income threshold to compute', () => {
    const result = checkFeeWaiverEligibility('federal', { householdSize: 1, annualIncome: 1, receivesPublicBenefits: false })
    expect(result.eligibility).toBe('undetermined')
    expect(result.ruleCitation).toBe('28 U.S.C. § 1915(a)(1)')
    expect(result.explanation).toContain('affidavit')
    expect(result.thresholdAnnualIncome).toBeNull()
  })

  it('stays undetermined even with public benefits set — that pathway is CA-specific', () => {
    const result = checkFeeWaiverEligibility('federal', { householdSize: 1, annualIncome: 1, receivesPublicBenefits: true })
    expect(result.eligibility).toBe('undetermined')
  })
})

describe('checkFeeWaiverEligibility > unseeded jurisdiction', () => {
  it('is honest about the gap rather than fabricating a threshold', () => {
    const result = checkFeeWaiverEligibility('TX', { householdSize: 1, annualIncome: 1, receivesPublicBenefits: false })
    expect(result.eligibility).toBe('undetermined')
    expect(result.ruleCitation).toBe('')
    expect(result.explanation).toContain("don't have fee waiver rules")
  })
})
