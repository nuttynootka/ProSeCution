import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { buildActivityTimeline, type ActivityEntry } from '../cases/activity'
import { placeholderPostureScore, STAGE_LABELS, stageIndex } from '../cases/posture'
import {
  caseRepository,
  LITIGATION_STAGES,
  partyRepository,
  type Case,
  type LitigationStage,
} from '../cases'
import { PlaceholderScreen } from '../components/PlaceholderScreen'
import styles from './CaseDashboardScreen.module.css'

const STAGE_DESCRIPTIONS: Record<LitigationStage, string> = {
  pleadings: 'Case filed. Nothing else tracked yet — deadlines, documents and drafts will show up here as they are added.',
  discovery: 'In discovery. Deadline, document and draft tracking will appear here once those features are built.',
  motions: 'Motion practice underway. Deadline, document and draft tracking will appear here once those features are built.',
  trial: 'Preparing for trial. Deadline, document and draft tracking will appear here once those features are built.',
}

export function CaseDashboardScreen() {
  const { caseId } = useParams<{ caseId: string }>()
  const navigate = useNavigate()
  const [caseRecord, setCaseRecord] = useState<Case | null | undefined>(undefined)
  const [activity, setActivity] = useState<ActivityEntry[]>([])

  useEffect(() => {
    if (!caseId) return
    let cancelled = false
    Promise.all([caseRepository.get(caseId), partyRepository.listForCase(caseId)]).then(
      ([foundCase, parties]) => {
        if (cancelled) return
        setCaseRecord(foundCase ?? null)
        if (foundCase) setActivity(buildActivityTimeline(foundCase, parties))
      },
    )
    return () => {
      cancelled = true
    }
  }, [caseId])

  if (caseRecord === undefined) return null

  if (caseRecord === null) {
    return (
      <PlaceholderScreen title="Case not found" plannedIn="It may have been deleted." testId="case-not-found" />
    )
  }

  const score = placeholderPostureScore(caseRecord.currentStage)
  const currentIndex = stageIndex(caseRecord.currentStage)
  const ringDeg = score * 3.6

  return (
    <div data-testid="screen-case-dashboard">
      <div className={styles.header}>
        <button
          type="button"
          className={styles.back}
          onClick={() => navigate('/cases')}
          aria-label="Back to cases"
          data-testid="dashboard-back"
        >
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
            <path
              d="M9.5 2.5L4 7.5L9.5 12.5"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <div>
          <div className={styles.headerKicker}>{caseRecord.caseType.toUpperCase()}</div>
          <div className={styles.headerTitle}>
            {caseRecord.county}, {caseRecord.state}
          </div>
        </div>
      </div>

      <div className={styles.body}>
        <div className={styles.postureOuter}>
          <div className={styles.postureInner}>
            <div className={styles.postureTop}>
              <div className={styles.ring}>
                <div
                  className={styles.ringTrack}
                  style={{
                    background: `conic-gradient(from -90deg, #2563eb 0deg, #7c3aed ${ringDeg * 0.7}deg, #4c1d95 ${ringDeg}deg, rgba(255,255,255,.07) ${ringDeg}deg 360deg)`,
                  }}
                />
                <div className={styles.ringCenter}>
                  <div className={styles.ringScore} data-testid="posture-score">
                    {score}
                  </div>
                  <div className={styles.ringLabel}>POSTURE</div>
                </div>
              </div>
              <div className={styles.postureText}>
                <div className={styles.postureHeadline}>{STAGE_LABELS[caseRecord.currentStage]}</div>
                <div className={styles.postureSub}>{STAGE_DESCRIPTIONS[caseRecord.currentStage]}</div>
              </div>
            </div>

            <div className={styles.stageBar}>
              {LITIGATION_STAGES.map((stage, i) => (
                <div
                  key={stage}
                  className={i <= currentIndex ? `${styles.stageSegment} ${styles.stageSegmentFilled}` : styles.stageSegment}
                />
              ))}
            </div>
            <div className={styles.stageLabels}>
              {LITIGATION_STAGES.map((stage) => (
                <span key={stage} className={stage === caseRecord.currentStage ? styles.stageLabelCurrent : undefined}>
                  {STAGE_LABELS[stage].toUpperCase()}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className={styles.statRow}>
          <div className={styles.statCard}>
            <div className={styles.statValue}>0</div>
            <div className={styles.statLabel}>
              DEADLINES
              <br />
              IN 14 DAYS
            </div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statValue}>0</div>
            <div className={styles.statLabel}>
              DOCUMENTS
              <br />
              INDEXED
            </div>
          </div>
          <div className={`${styles.statCard} ${styles.statCardAccent}`}>
            <div className={styles.statValue}>0</div>
            <div className={`${styles.statLabel} ${styles.statLabelAccent}`}>
              DRAFTS
              <br />
              AWAITING YOU
            </div>
          </div>
        </div>

        <div className={styles.timelineLabel}>Case timeline</div>

        {activity.map((entry) => (
          <div key={entry.id} className={styles.activityRow} data-testid="activity-row">
            <div className={styles.activityBar} style={{ background: entry.hue, boxShadow: `0 0 10px ${entry.hue}` }} />
            <div style={{ minWidth: 0 }}>
              <div className={styles.activityHead}>
                <div className={styles.activityTitle}>{entry.title}</div>
                <div className={styles.activityDate}>{new Date(entry.date).toLocaleDateString()}</div>
              </div>
              <div className={styles.activityMeta}>{entry.meta}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
