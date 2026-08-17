import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { caseRepository, type Case } from '../cases'
import { PlaceholderScreen } from '../components/PlaceholderScreen'
import styles from './CasesScreen.module.css'

export function CasesScreen() {
  const [cases, setCases] = useState<Case[] | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    caseRepository.list().then(setCases)
  }, [])

  return (
    <div data-testid="screen-cases">
      {cases === null ? null : cases.length === 0 ? (
        <PlaceholderScreen
          title="Cases"
          plannedIn="Tap + to create your first case."
          testId="screen-cases-empty"
        />
      ) : (
        <>
          <div className={styles.header}>
            <div className={styles.headerKicker}>{cases.length === 1 ? '1 CASE' : `${cases.length} CASES`}</div>
            <div className={styles.headerTitle}>Cases</div>
          </div>
          <div className={styles.list} data-testid="case-list">
            {cases.map((c) => (
              <button
                key={c.id}
                type="button"
                className={styles.caseRow}
                data-testid="case-row"
                onClick={() => navigate(`/cases/${c.id}`)}
              >
                <div className={styles.caseType}>{c.caseType}</div>
                <div className={styles.caseLocation}>
                  {c.county}, {c.state}
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      <Link to="/cases/new" className={styles.fab} aria-label="New case" data-testid="new-case-fab">
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
          <path d="M11 4V18M4 11H18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </Link>
    </div>
  )
}
