import { describe, expect, it } from 'vitest'
import { categorizeDocument } from './categorize'

describe('categorizeDocument', () => {
  it('recognizes a court order by its signing language, not just the word "order"', () => {
    const text = `
      SUPERIOR COURT OF CALIFORNIA
      IT IS HEREBY ORDERED that Defendant's motion is GRANTED.
      Dated: March 3, 2026
    `
    expect(categorizeDocument(text)).toBe('Order')
  })

  it('classifies "IT IS SO ORDERED" as an order too', () => {
    expect(categorizeDocument('IT IS SO ORDERED.')).toBe('Order')
  })

  it('classifies a motion as Motion even when it requests an order', () => {
    // The tricky case the rule ordering exists for: this contains "order" but is
    // not itself a signed order — it's a request for one.
    const text = 'NOTICE OF MOTION AND MOTION FOR ORDER COMPELLING DISCOVERY RESPONSES'
    expect(categorizeDocument(text)).toBe('Motion')
  })

  it('classifies a motion to dismiss', () => {
    expect(categorizeDocument('NOTICE OF MOTION AND MOTION TO DISMISS')).toBe('Motion')
  })

  it('classifies a summons as a pleading', () => {
    const text = 'SUMMONS\nYou are hereby notified that you have been sued.'
    expect(categorizeDocument(text)).toBe('Pleading')
  })

  it('classifies a complaint as a pleading', () => {
    expect(categorizeDocument('COMPLAINT FOR BREACH OF CONTRACT')).toBe('Pleading')
  })

  it('classifies an answer as a pleading', () => {
    expect(categorizeDocument("DEFENDANT'S ANSWER TO COMPLAINT")).toBe('Pleading')
  })

  it('classifies an exhibit cover page', () => {
    expect(categorizeDocument('EXHIBIT A\nLease Agreement dated Jan 1, 2025')).toBe('Exhibit')
  })

  it('does not classify the mere word "exhibit" without a letter/number as an Exhibit', () => {
    expect(categorizeDocument('Please see the exhibit attached to this filing.')).toBe('Other')
  })

  it('classifies a letter as correspondence', () => {
    const text = 'Dear Mr. Cordova,\n\nThis letter confirms our conversation.\n\nSincerely,\nMaria Hartley'
    expect(categorizeDocument(text)).toBe('Correspondence')
  })

  it('falls back to Other for text matching no rule', () => {
    expect(categorizeDocument('Random receipt from a hardware store, $42.19 total.')).toBe('Other')
  })

  it('falls back to Other for empty text (e.g. a blank or unreadable scan)', () => {
    expect(categorizeDocument('')).toBe('Other')
  })

  it('is case-insensitive', () => {
    expect(categorizeDocument('notice of motion and motion to compel')).toBe('Motion')
  })

  it('is robust to noisy OCR spacing around keywords', () => {
    expect(categorizeDocument('IT   IS  HEREBY   ORDERED that...')).toBe('Order')
  })
})
