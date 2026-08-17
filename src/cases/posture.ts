import { LITIGATION_STAGES, type LitigationStage } from './types'

export const STAGE_LABELS: Record<LitigationStage, string> = {
  pleadings: 'Pleadings',
  discovery: 'Discovery',
  motions: 'Motions',
  trial: 'Trial',
}

/**
 * A rough placeholder per the plan (Chunk 6) — an explicit per-stage baseline, not a
 * computed assessment of case health. It says "this case is in Discovery" as a
 * number, nothing more; it does not know whether discovery is going well. Real
 * stage-aware scoring (documents filed, deadlines met vs. missed, motions won) is
 * Chunk 49's job. Deliberately never reaches 100 — no case being actively tracked
 * here is "done."
 */
const PLACEHOLDER_SCORE: Record<LitigationStage, number> = {
  pleadings: 20,
  discovery: 50,
  motions: 75,
  trial: 90,
}

export function placeholderPostureScore(stage: LitigationStage): number {
  return PLACEHOLDER_SCORE[stage]
}

export function stageIndex(stage: LitigationStage): number {
  return LITIGATION_STAGES.indexOf(stage)
}
