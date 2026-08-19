import type { Deadline, TriggerEvent } from '../deadlines'
import type { Document } from '../documents'
import type { DocumentType } from '../ocr'
import { LITIGATION_STAGES, type LitigationStage } from './types'

export const STAGE_LABELS: Record<LitigationStage, string> = {
  pleadings: 'Pleadings',
  discovery: 'Discovery',
  motions: 'Motions',
  trial: 'Trial',
}

export function stageIndex(stage: LitigationStage): number {
  return LITIGATION_STAGES.indexOf(stage)
}

const STAGE_BASE_SCORE: Record<LitigationStage, number> = {
  pleadings: 10,
  discovery: 40,
  motions: 65,
  trial: 85,
}

/**
 * A real, computed posture score — replacing Chunk 6's fixed per-stage placeholder.
 * The stage sets a floor; the real ratio of completed vs. total deadlines (an
 * honest signal of how much of this case's known procedural work is actually done)
 * nudges the score up within that stage's band. Deliberately capped below 100 —
 * no case being actively tracked here is "done," even one at trial with every
 * known deadline completed so far.
 */
export function computePostureScore(stage: LitigationStage, deadlines: Pick<Deadline, 'status'>[]): number {
  const base = STAGE_BASE_SCORE[stage]
  if (deadlines.length === 0) return base
  const completedRatio = deadlines.filter((d) => d.status === 'completed').length / deadlines.length
  return Math.min(99, Math.round(base + completedRatio * 15))
}

/** The earliest litigation stage each real signal this app can observe actually implies. Deliberately sparse — a signal not listed here says nothing about stage, rather than being guessed at. */
const TRIGGER_MIN_STAGE: Partial<Record<TriggerEvent, LitigationStage>> = {
  discovery_request: 'discovery',
  filing_of_motion: 'motions',
  court_order: 'motions',
}

const DOCUMENT_TYPE_MIN_STAGE: Partial<Record<DocumentType, LitigationStage>> = {
  Motion: 'motions',
  Order: 'motions',
}

/**
 * What this case's own real activity (deadline triggers, document types) suggests
 * about litigation stage — never below 'pleadings' (every case starts there), and
 * deliberately never reaches 'trial' on its own: nothing in this app's current
 * data model reliably signals a trial has actually begun, so auto-detection stops
 * at 'motions' and leaves 'trial' to a person's own manual choice rather than
 * guessing. This matches the blueprint's own stated risk for this feature —
 * "Misdetection → Manual override" — by only ever proposing a stage it has real
 * evidence for.
 */
export function detectStageSignal(deadlines: Pick<Deadline, 'trigger'>[], documents: Pick<Document, 'documentType'>[]): LitigationStage {
  let best: LitigationStage = 'pleadings'
  for (const deadline of deadlines) {
    const candidate = TRIGGER_MIN_STAGE[deadline.trigger]
    if (candidate && stageIndex(candidate) > stageIndex(best)) best = candidate
  }
  for (const doc of documents) {
    const candidate = doc.documentType ? DOCUMENT_TYPE_MIN_STAGE[doc.documentType] : undefined
    if (candidate && stageIndex(candidate) > stageIndex(best)) best = candidate
  }
  return best
}

/**
 * Auto-detection only ever moves a case forward, never back — a stage a case has
 * already reached (whether by real signals or a person's own manual override)
 * isn't silently taken away just because this particular call doesn't currently
 * see a signal for it. A real regression (a misdetection needing correction) is a
 * manual override, a separate, deliberate action — not something this function does.
 */
export function advancedStage(current: LitigationStage, signal: LitigationStage): LitigationStage {
  return stageIndex(signal) > stageIndex(current) ? signal : current
}
