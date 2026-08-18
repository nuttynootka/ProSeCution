import { describe, expect, it } from 'vitest'
import { formatJurisdiction } from './jurisdiction'

describe('formatJurisdiction', () => {
  it('capitalizes the literal federal jurisdiction key', () => {
    expect(formatJurisdiction('federal')).toBe('Federal')
  })

  it('passes a real state code through unchanged', () => {
    expect(formatJurisdiction('CA')).toBe('CA')
  })
})
