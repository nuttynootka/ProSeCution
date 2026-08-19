import { useEffect, useState } from 'react'
import { GlassSurface } from '../components/GlassSurface'
import { getNotificationPermission, requestNotificationPermission, showLocalNotification } from '../notifications'
import { SectionLabel } from '../wizard/Field'
import { PrimaryButton } from '../wizard/PrimaryButton'
import { summarizeDeadlineReminders } from './reminders'
import type { Deadline } from './types'
import styles from './DeadlineAlertsCard.module.css'

interface DeadlineAlertsCardProps {
  deadlines: Deadline[]
}

type Permission = 'default' | 'granted' | 'denied' | 'unsupported'

function readPermission(): Permission {
  if (typeof Notification === 'undefined') return 'unsupported'
  return getNotificationPermission()
}

/**
 * The consumer Chunk 15's two halves never had. `summarizeDeadlineReminders`
 * (in-app reminders) and `src/notifications` (real OS notifications) were both
 * built and tested but wired to nothing, so neither actually reached a user.
 *
 * Deliberately explicit about the platform limit rather than implying more than it
 * does: the web has no way for a closed PWA to wake itself at a future date (see
 * notifications.ts for why Web Push isn't built here), so this alerts while the app
 * is open and points at calendar export — which hands deadlines to the OS's own
 * alarms — as the real answer for when it isn't.
 */
export function DeadlineAlertsCard({ deadlines }: DeadlineAlertsCardProps) {
  const [permission, setPermission] = useState<Permission>('unsupported')
  const [sent, setSent] = useState(false)

  useEffect(() => {
    setPermission(readPermission())
  }, [])

  const { overdue, dueSoon } = summarizeDeadlineReminders(deadlines, Date.now())
  const needingAttention = [...overdue, ...dueSoon]
  if (needingAttention.length === 0) return null

  const notify = async () => {
    const soonest = needingAttention[0]
    const isOverdue = overdue.length > 0
    await showLocalNotification(
      isOverdue ? `${overdue.length} overdue deadline${overdue.length === 1 ? '' : 's'}` : 'Deadline due soon',
      {
        body: `${soonest.title} — due ${new Date(soonest.dueDate).toLocaleDateString()}`,
        tag: 'plcm-deadline-alert',
      },
    )
    setSent(true)
  }

  const handleEnable = async () => {
    const result = await requestNotificationPermission()
    setPermission(result)
    if (result === 'granted') await notify()
  }

  return (
    <GlassSurface style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }} data-testid="deadline-alerts-card">
      <SectionLabel>Deadline alerts</SectionLabel>

      <p className={styles.summary} data-testid="deadline-alerts-summary">
        {overdue.length > 0 && (
          <span className={styles.overdue}>
            {overdue.length} overdue
            {dueSoon.length > 0 ? ', ' : ''}
          </span>
        )}
        {dueSoon.length > 0 && <>{dueSoon.length} due in the next 14 days</>}.
      </p>

      {permission === 'unsupported' && (
        <p className={styles.note} data-testid="deadline-alerts-unsupported">
          This browser doesn't support notifications. Use "Export all to calendar" above — your phone's calendar will
          alarm even when this app is closed.
        </p>
      )}

      {permission === 'default' && (
        <>
          <p className={styles.note}>
            Get a notification for these while the app is open. For reminders when it's closed, export to your
            calendar — the web can't wake a closed app on a schedule.
          </p>
          <PrimaryButton variant="secondary" onClick={() => void handleEnable()} data-testid="deadline-alerts-enable">
            Enable notifications
          </PrimaryButton>
        </>
      )}

      {permission === 'granted' && (
        <>
          <p className={styles.note}>
            Notifications are on. They only fire while this app is open — calendar export is the reminder that works
            when it isn't.
          </p>
          <PrimaryButton variant="secondary" onClick={() => void notify()} data-testid="deadline-alerts-notify">
            {sent ? 'Show alert again' : 'Show alert now'}
          </PrimaryButton>
        </>
      )}

      {permission === 'denied' && (
        <p className={styles.note} data-testid="deadline-alerts-denied">
          Notifications are blocked for this site in your browser settings. Calendar export still works and is the
          more reliable reminder anyway.
        </p>
      )}
    </GlassSurface>
  )
}
