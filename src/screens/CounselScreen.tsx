import { useEffect, useState } from 'react'
import { caseRepository, formatJurisdiction, type Case } from '../cases'
import { GlassSurface } from '../components/GlassSurface'
import { PlaceholderScreen } from '../components/PlaceholderScreen'
import { ChipGroup } from '../wizard/ChipGroup'
import styles from './CounselScreen.module.css'

type CounselTab = 'drafting' | 'audit'

/**
 * The Co-Counsel shell (Chunk 42): a case picker plus the Drafting/Opposing-audit
 * tab strip from the mockup. Real navigation and case-scoping, but each tab's actual
 * content is still an honest placeholder — Agent D's three-stage drafting pipeline
 * (Chunk 43) and Agent B's opposing-filing audit (Chunk 44) both plug into this shell
 * rather than being built here.
 */
export function CounselScreen() {
  const [cases, setCases] = useState<Case[] | null>(null)
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null)
  const [tab, setTab] = useState<CounselTab>('drafting')

  useEffect(() => {
    caseRepository.list().then((list) => {
      setCases(list)
      setSelectedCaseId((prev) => prev ?? list[0]?.id ?? null)
    })
  }, [])

  if (cases === null) return null

  if (cases.length === 0) {
    return (
      <PlaceholderScreen
        title="Co-Counsel"
        plannedIn="Create a case first — motion drafting and filing audit both work from a specific case's own facts and documents."
        testId="screen-counsel-empty"
      />
    )
  }

  const selectedCase = cases.find((c) => c.id === selectedCaseId) ?? cases[0]
  const caseOptions = cases.map((c) => ({ value: c.id, label: `${c.county}, ${formatJurisdiction(c.state)}` }))

  return (
    <div className={styles.root} data-testid="screen-counsel">
      <div className={styles.header}>
        <div className={styles.kicker}>GROUNDED · NO OUTSIDE LAW</div>
        <div className={styles.title}>AI Co-Counsel</div>
      </div>

      <div className={styles.body}>
        <ChipGroup groupLabel="counsel-case" options={caseOptions} value={selectedCase.id} onChange={setSelectedCaseId} />

        <div className={styles.tabStrip} data-testid="counsel-tab-strip">
          <button
            type="button"
            className={tab === 'drafting' ? `${styles.tab} ${styles.tabActive}` : styles.tab}
            onClick={() => setTab('drafting')}
            data-testid="counsel-tab-drafting"
          >
            Drafting
          </button>
          <button
            type="button"
            className={tab === 'audit' ? `${styles.tab} ${styles.tabActive}` : styles.tab}
            onClick={() => setTab('audit')}
            data-testid="counsel-tab-audit"
          >
            Opposing audit
          </button>
        </div>

        {tab === 'drafting' ? (
          <GlassSurface style={{ padding: 16 }} data-testid="counsel-drafting-panel">
            <div className={styles.panelKicker}>MOTION DRAFTING</div>
            <div className={styles.panelNote}>
              The three-stage drafting pipeline (outline → verified-citation draft → critique) for{' '}
              {selectedCase.county}, {formatJurisdiction(selectedCase.state)} arrives in Chunk 43.
            </div>
          </GlassSurface>
        ) : (
          <GlassSurface style={{ padding: 16 }} data-testid="counsel-audit-panel">
            <div className={styles.panelKicker}>OPPOSING FILING AUDIT</div>
            <div className={styles.panelNote}>
              A strength-meter analysis of an opposing filing for {selectedCase.county}, {formatJurisdiction(selectedCase.state)}{' '}
              arrives in Chunk 44.
            </div>
          </GlassSurface>
        )}
      </div>
    </div>
  )
}
