import { useEffect, useState } from 'react'
import { caseRepository, type Case } from '../cases'
import { PlaceholderScreen } from '../components/PlaceholderScreen'
import {
  buildIcsCalendar,
  deadlineRepository,
  formatDeadlineUrgency,
  icsFilename,
  triggerIcsDownload,
  urgencyTone,
  type Deadline,
} from '../deadlines'
import styles from './DeadlinesScreen.module.css'

const TONE_CLASS: Record<string, string> = {
  overdue: styles.toneOverdue,
  soon: styles.toneSoon,
  normal: styles.toneNormal,
}

function labelForCase(c: Case | undefined): string {
  return c ? `${c.county}, ${c.state}` : 'Unknown case'
}

interface DeadlineCardProps {
  deadline: Deadline
  caseLabel: string
  onToggleStatus: () => void
  onExport: () => void
}

function DeadlineCard({ deadline, caseLabel, onToggleStatus, onExport }: DeadlineCardProps) {
  const now = Date.now()
  const tone = urgencyTone(deadline.dueDate, now)
  const completed = deadline.status === 'completed'

  return (
    <div className={styles.item} data-testid="deadline-item">
      <div className={`${styles.dot} ${TONE_CLASS[tone]}`} />
      <div className={`${styles.card} ${completed ? styles.cardCompleted : ''}`} data-testid="deadline-card">
        <div className={styles.cardHead}>
          <div className={styles.cardTitle}>{deadline.title}</div>
          {!completed && (
            <div className={`${styles.urgency} ${TONE_CLASS[tone]}`}>{formatDeadlineUrgency(deadline.dueDate, now)}</div>
          )}
        </div>
        <div className={styles.cardMeta}>
          {new Date(deadline.dueDate).toLocaleDateString(undefined, {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}
          {' · '}
          {caseLabel}
        </div>
        <div className={styles.ruleBadge}>{deadline.ruleCitation}</div>
        <div className={styles.cardActions}>
          <button type="button" className={styles.actionButton} onClick={onToggleStatus} data-testid="deadline-toggle-status">
            {completed ? 'Mark pending' : 'Mark complete'}
          </button>
          <button type="button" className={styles.actionButton} onClick={onExport} data-testid="deadline-export">
            Add to calendar
          </button>
        </div>
      </div>
    </div>
  )
}

export function DeadlinesScreen() {
  const [deadlines, setDeadlines] = useState<Deadline[] | null>(null)
  const [cases, setCases] = useState<Record<string, Case>>({})
  const [showCompleted, setShowCompleted] = useState(false)

  const refresh = () => {
    Promise.all([deadlineRepository.listAll(), caseRepository.list()]).then(([allDeadlines, allCases]) => {
      setDeadlines(allDeadlines)
      setCases(Object.fromEntries(allCases.map((c) => [c.id, c])))
    })
  }

  useEffect(refresh, [])

  const handleToggleStatus = async (deadline: Deadline) => {
    await deadlineRepository.setStatus(deadline.id, deadline.status === 'pending' ? 'completed' : 'pending')
    refresh()
  }

  const handleExportOne = (deadline: Deadline) => {
    triggerIcsDownload(icsFilename(deadline.title), buildIcsCalendar([deadline]))
  }

  if (deadlines === null) return null

  if (deadlines.length === 0) {
    return (
      <div data-testid="screen-deadlines">
        <div className={styles.header}>
          <div className={styles.headerKicker}>DEADLINES</div>
          <div className={styles.headerTitle}>Deadlines</div>
        </div>
        <PlaceholderScreen
          title="No deadlines yet"
          plannedIn="Open a case and log the date you were served to calculate one."
          testId="deadlines-empty"
        />
      </div>
    )
  }

  const pending = deadlines.filter((d) => d.status === 'pending')
  const completed = deadlines.filter((d) => d.status === 'completed')

  const handleExportAll = () => {
    triggerIcsDownload(icsFilename('deadlines'), buildIcsCalendar(pending))
  }

  return (
    <div data-testid="screen-deadlines">
      <div className={styles.header}>
        <div className={styles.headerKicker}>{pending.length === 1 ? '1 DEADLINE' : `${pending.length} DEADLINES`}</div>
        <div className={styles.headerTitle}>Deadlines</div>
      </div>

      {pending.length > 0 && (
        <div className={styles.toolbar}>
          <button type="button" className={styles.exportAllButton} onClick={handleExportAll} data-testid="export-all-deadlines">
            Export all to calendar
          </button>
        </div>
      )}

      {pending.length === 0 && (
        <div className={styles.allDone} data-testid="deadlines-all-done">
          Nothing pending — every logged deadline is marked complete.
        </div>
      )}

      {pending.length > 0 && (
        <div className={styles.timeline} data-testid="deadline-timeline">
          <div className={styles.rail} />
          <div className={styles.travelTrack}>
            <div className={styles.travelDot} />
          </div>
          {pending.map((d) => (
            <DeadlineCard
              key={d.id}
              deadline={d}
              caseLabel={labelForCase(cases[d.caseId])}
              onToggleStatus={() => void handleToggleStatus(d)}
              onExport={() => handleExportOne(d)}
            />
          ))}
        </div>
      )}

      {completed.length > 0 && (
        <>
          <button
            type="button"
            className={styles.showCompletedToggle}
            onClick={() => setShowCompleted((s) => !s)}
            data-testid="toggle-completed-deadlines"
          >
            {showCompleted ? 'Hide' : 'Show'} completed ({completed.length})
          </button>
          {showCompleted && (
            <div className={styles.completedList} data-testid="completed-deadlines">
              {completed.map((d) => (
                <DeadlineCard
                  key={d.id}
                  deadline={d}
                  caseLabel={labelForCase(cases[d.caseId])}
                  onToggleStatus={() => void handleToggleStatus(d)}
                  onExport={() => handleExportOne(d)}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
