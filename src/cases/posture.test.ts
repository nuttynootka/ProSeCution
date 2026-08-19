import { describe, expect, it } from 'vitest'
import type { Deadline } from '../deadlines'
import type { Document } from '../documents'
import { LITIGATION_STAGES } from './types'
import { advancedStage, computePostureScore, detectStageSignal, stageIndex } from './posture'

function deadline(trigger: Deadline['trigger'], status: Deadline['status'] = 'pending'): Pick<Deadline, 'trigger' | 'status'> {
  return { trigger, status }
}

function doc(documentType?: Document['documentType']): Pick<Document, 'documentType'> {
  return { documentType }
}

describe('stageIndex', () => {
  it('matches each stage to its procedural position', () => {
    expect(stageIndex('pleadings')).toBe(0)
    expect(stageIndex('trial')).toBe(LITIGATION_STAGES.length - 1)
  })
})

describe('computePostureScore', () => {
  it('returns a score for every stage', () => {
    for (const stage of LITIGATION_STAGES) {
      expect(typeof computePostureScore(stage, [])).toBe('number')
    }
  })

  it('increases with procedural progress at a fixed completion ratio', () => {
    const scores = LITIGATION_STAGES.map((stage) => computePostureScore(stage, []))
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]).toBeGreaterThan(scores[i - 1])
    }
  })

  it('never reaches 100 — no tracked case is "done"', () => {
    const allCompleted = Array.from({ length: 10 }, () => ({ status: 'completed' as const }))
    for (const stage of LITIGATION_STAGES) {
      expect(computePostureScore(stage, allCompleted)).toBeLessThan(100)
    }
  })

  it('scores higher when more of the real deadlines are actually completed', () => {
    const noneCompleted = [{ status: 'pending' as const }, { status: 'pending' as const }]
    const allCompleted = [{ status: 'completed' as const }, { status: 'completed' as const }]
    expect(computePostureScore('discovery', allCompleted)).toBeGreaterThan(computePostureScore('discovery', noneCompleted))
  })
})

describe('detectStageSignal', () => {
  it('stays at pleadings with no advancing signals', () => {
    expect(detectStageSignal([deadline('service_of_summons')], [doc('Pleading')])).toBe('pleadings')
  })

  it('detects discovery from a real discovery_request deadline', () => {
    expect(detectStageSignal([deadline('discovery_request')], [])).toBe('discovery')
  })

  it('detects motions from a real filing_of_motion deadline', () => {
    expect(detectStageSignal([deadline('filing_of_motion')], [])).toBe('motions')
  })

  it('detects motions from a real court_order deadline', () => {
    expect(detectStageSignal([deadline('court_order')], [])).toBe('motions')
  })

  it('detects motions from a real Motion document, even with no deadline signal', () => {
    expect(detectStageSignal([], [doc('Motion')])).toBe('motions')
  })

  it('never auto-detects trial — no signal in this data model implies it', () => {
    const everySignal = [deadline('discovery_request'), deadline('filing_of_motion'), deadline('court_order')]
    const everyDoc = [doc('Motion'), doc('Order'), doc('Pleading')]
    expect(detectStageSignal(everySignal, everyDoc)).toBe('motions')
  })

  it('returns the most advanced signal found among several', () => {
    expect(detectStageSignal([deadline('discovery_request'), deadline('filing_of_motion')], [])).toBe('motions')
  })

  it('ignores an undefined documentType rather than crashing', () => {
    expect(detectStageSignal([], [doc(undefined)])).toBe('pleadings')
  })
})

describe('advancedStage', () => {
  it('advances when the signal is further along than the current stage', () => {
    expect(advancedStage('pleadings', 'discovery')).toBe('discovery')
  })

  it('never regresses a stage the case already reached', () => {
    expect(advancedStage('motions', 'pleadings')).toBe('motions')
  })

  it('is a no-op when the signal matches the current stage', () => {
    expect(advancedStage('discovery', 'discovery')).toBe('discovery')
  })
})
