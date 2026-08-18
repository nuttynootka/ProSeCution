import { describe, expect, it } from 'vitest'
import { extractCaseNumber } from './extractFields'

describe('extractCaseNumber', () => {
  it('extracts a California-style case number after "Case No."', () => {
    expect(extractCaseNumber('Case No. 24CV1234')).toBe('24CV1234')
  })

  it('extracts after the fully spelled-out "Case Number:" label', () => {
    // "Number" does not contain "No" as a prefix (Num-, not No-), so this needs its
    // own alternative in the pattern, not just falling out of "No" matching loosely.
    expect(extractCaseNumber('Case Number: BC123456')).toBe('BC123456')
  })

  it('extracts a hyphenated case number', () => {
    expect(extractCaseNumber('Case No: 22-CV-00123')).toBe('22-CV-00123')
  })

  it('extracts a federal-style case number with a colon in the number itself', () => {
    expect(extractCaseNumber('Case No. 2:24-cv-01234')).toBe('2:24-CV-01234')
  })

  it('is tolerant of irregular OCR spacing', () => {
    expect(extractCaseNumber('Case   No.   24CV1234')).toBe('24CV1234')
  })

  it('is case-insensitive on the label and normalizes the number to uppercase', () => {
    expect(extractCaseNumber('case no. 24cv1234')).toBe('24CV1234')
  })

  it('finds the case number wherever it appears in a longer document', () => {
    const text = `
      SUPERIOR COURT OF CALIFORNIA
      COUNTY OF LOS ANGELES

      Case No. 24CV1234

      NOTICE OF MOTION AND MOTION TO DISMISS
    `
    expect(extractCaseNumber(text)).toBe('24CV1234')
  })

  it('returns null when there is no case number label at all', () => {
    expect(extractCaseNumber('Dear Mr. Cordova, this letter confirms our conversation.')).toBeNull()
  })

  it('returns null for empty text', () => {
    expect(extractCaseNumber('')).toBeNull()
  })
})
