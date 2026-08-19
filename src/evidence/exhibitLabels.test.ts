import { describe, expect, it } from 'vitest'
import { exhibitLabel } from './exhibitLabels'

describe('exhibitLabel', () => {
  it('labels the first 26 exhibits A through Z', () => {
    expect(exhibitLabel(0)).toBe('A')
    expect(exhibitLabel(1)).toBe('B')
    expect(exhibitLabel(25)).toBe('Z')
  })

  it('doubles the letter for the next 26 (AA, BB, ... ZZ) rather than spreadsheet-style AA/AB/AC', () => {
    expect(exhibitLabel(26)).toBe('AA')
    expect(exhibitLabel(27)).toBe('BB')
    expect(exhibitLabel(51)).toBe('ZZ')
  })

  it('triples the letter for the range after that', () => {
    expect(exhibitLabel(52)).toBe('AAA')
    expect(exhibitLabel(53)).toBe('BBB')
  })

  it('rejects a negative index rather than returning something nonsensical', () => {
    expect(() => exhibitLabel(-1)).toThrow(RangeError)
  })
})
