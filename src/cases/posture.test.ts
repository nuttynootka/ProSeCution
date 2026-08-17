import { describe, expect, it } from 'vitest'
import { LITIGATION_STAGES } from './types'
import { placeholderPostureScore, stageIndex } from './posture'

describe('placeholderPostureScore', () => {
  it('returns a score for every stage', () => {
    for (const stage of LITIGATION_STAGES) {
      expect(typeof placeholderPostureScore(stage)).toBe('number')
    }
  })

  it('increases monotonically with procedural progress', () => {
    const scores = LITIGATION_STAGES.map(placeholderPostureScore)
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]).toBeGreaterThan(scores[i - 1])
    }
  })

  it('never reaches 100 — no tracked case is "done"', () => {
    for (const stage of LITIGATION_STAGES) {
      expect(placeholderPostureScore(stage)).toBeLessThan(100)
    }
  })
})

describe('stageIndex', () => {
  it('matches each stage to its procedural position', () => {
    expect(stageIndex('pleadings')).toBe(0)
    expect(stageIndex('trial')).toBe(LITIGATION_STAGES.length - 1)
  })
})
