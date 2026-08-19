import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { caseRepository, formatJurisdiction, type Case } from '../cases'
import { PlaceholderScreen } from '../components/PlaceholderScreen'
import { documentRepository, type Document } from '../documents'
import { exhibitLabel, exhibitListRepository, generateExhibitCoverSheets, generateExhibitList, type ExhibitItem } from '../evidence'
import { loadFillFont, pdfFilename, triggerPdfDownload } from '../pdf'
import { TextInput } from '../wizard/Field'
import { PrimaryButton } from '../wizard/PrimaryButton'
import styles from './ExhibitListScreen.module.css'

type Phase = 'loading' | 'ready' | 'load-error'

/**
 * The blueprint's Evidence Management & Exhibit List Generator (Chunk 46):
 * documents already in this case can be checked in/out as exhibits, reordered
 * (order drives the auto-assigned A/B/C label — see exhibitLabels.ts), described,
 * and exported as a real exhibit list and a set of per-exhibit cover sheets.
 * Selection persists via ExhibitListRepository so returning to this screen later
 * doesn't lose the work.
 */
export function ExhibitListScreen() {
  const { caseId } = useParams<{ caseId: string }>()
  const navigate = useNavigate()
  const [phase, setPhase] = useState<Phase>('loading')
  const [caseRecord, setCaseRecord] = useState<Case | null>(null)
  const [documents, setDocuments] = useState<Document[]>([])
  const [items, setItems] = useState<ExhibitItem[]>([])
  const [saveNote, setSaveNote] = useState<string | null>(null)

  useEffect(() => {
    if (!caseId) return
    let cancelled = false

    Promise.all([caseRepository.get(caseId), documentRepository.listForCase(caseId), exhibitListRepository.getForCase(caseId)]).then(
      ([found, docs, exhibitList]) => {
        if (cancelled) return
        if (!found) {
          setPhase('load-error')
          return
        }
        setCaseRecord(found)
        setDocuments(docs)
        // Drop any saved item whose document no longer exists, rather than showing
        // a phantom exhibit with nothing behind it.
        const validDocIds = new Set(docs.map((d) => d.id))
        setItems(exhibitList.items.filter((i) => validDocIds.has(i.documentId)))
        setPhase('ready')
      },
    )
    return () => {
      cancelled = true
    }
  }, [caseId])

  const isIncluded = (documentId: string) => items.some((i) => i.documentId === documentId)

  const toggleDocument = (doc: Document) => {
    setItems((prev) =>
      prev.some((i) => i.documentId === doc.id)
        ? prev.filter((i) => i.documentId !== doc.id)
        : [...prev, { documentId: doc.id, description: doc.originalFilename }],
    )
  }

  const updateDescription = (documentId: string, description: string) => {
    setItems((prev) => prev.map((i) => (i.documentId === documentId ? { ...i, description } : i)))
  }

  const moveItem = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= items.length) return
    setItems((prev) => {
      const next = [...prev]
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  const handleSave = async () => {
    if (!caseId) return
    await exhibitListRepository.saveForCase(caseId, { items })
    setSaveNote('Saved')
    setTimeout(() => setSaveNote(null), 1500)
  }

  const entriesForDownload = () =>
    items.map((item) => {
      const doc = documents.find((d) => d.id === item.documentId)
      return { description: item.description, originalFilename: doc?.originalFilename ?? '' }
    })

  const caseLabel = caseRecord ? `${caseRecord.county}, ${formatJurisdiction(caseRecord.state)}` : ''

  const handleDownloadList = async () => {
    const fontBytes = await loadFillFont()
    const bytes = await generateExhibitList(caseLabel, entriesForDownload(), fontBytes)
    triggerPdfDownload(pdfFilename('Exhibit List'), bytes)
  }

  const handleDownloadCoverSheets = async () => {
    const fontBytes = await loadFillFont()
    const bytes = await generateExhibitCoverSheets(caseLabel, entriesForDownload(), fontBytes)
    triggerPdfDownload(pdfFilename('Exhibit Cover Sheets'), bytes)
  }

  const goBack = () => navigate(`/cases/${caseId}`)

  if (phase === 'loading') return null

  if (phase === 'load-error' || !caseRecord) {
    return <PlaceholderScreen title="Case not found" plannedIn="It may have been deleted." testId="exhibit-list-not-found" />
  }

  return (
    <div className={styles.root} data-testid="exhibit-list-screen">
      <div className={styles.header}>
        <button type="button" className={styles.back} onClick={goBack} aria-label="Back to case" data-testid="exhibit-list-back">
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
            <path d="M9.5 2.5L4 7.5L9.5 12.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div className={styles.headerText}>
          <div className={styles.kicker}>EXHIBIT LIST</div>
          <div className={styles.title}>{caseLabel}</div>
        </div>
      </div>

      <div className={styles.body}>
        {documents.length === 0 ? (
          <div className={styles.note} data-testid="exhibit-list-no-documents">
            This case has no documents yet — scan or import one first, then come back here to mark it as an exhibit.
          </div>
        ) : (
          <>
            <div className={styles.list}>
              {items.map((item, index) => {
                const doc = documents.find((d) => d.id === item.documentId)
                return (
                  <div key={item.documentId} className={styles.exhibitRow} data-testid="exhibit-row">
                    <div className={styles.exhibitRowHead}>
                      <span className={styles.exhibitLetter} data-testid="exhibit-letter">
                        {exhibitLabel(index)}
                      </span>
                      <span className={styles.exhibitFilename}>{doc?.originalFilename ?? item.documentId}</span>
                      <label className={styles.checkboxLabel}>
                        <input
                          type="checkbox"
                          checked
                          onChange={() => doc && toggleDocument(doc)}
                          data-testid="exhibit-include-checkbox"
                        />
                      </label>
                    </div>
                    <TextInput
                      value={item.description}
                      onChange={(e) => updateDescription(item.documentId, e.target.value)}
                      placeholder="Description of this exhibit"
                      data-testid="exhibit-description-input"
                    />
                    <div className={styles.moveRow}>
                      <button
                        type="button"
                        className={styles.moveButton}
                        onClick={() => moveItem(index, -1)}
                        disabled={index === 0}
                        data-testid="exhibit-move-up"
                      >
                        Move up
                      </button>
                      <button
                        type="button"
                        className={styles.moveButton}
                        onClick={() => moveItem(index, 1)}
                        disabled={index === items.length - 1}
                        data-testid="exhibit-move-down"
                      >
                        Move down
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className={styles.sectionLabel}>ALL DOCUMENTS</div>
            <div className={styles.list}>
              {documents
                .filter((doc) => !isIncluded(doc.id))
                .map((doc) => (
                  <label key={doc.id} className={styles.docRow} data-testid="exhibit-document-option">
                    <input type="checkbox" checked={false} onChange={() => toggleDocument(doc)} data-testid="exhibit-add-checkbox" />
                    <span>{doc.originalFilename}</span>
                  </label>
                ))}
            </div>
          </>
        )}

        <div className={styles.footer}>
          {saveNote && (
            <span className={styles.saveNote} data-testid="exhibit-list-save-note">
              {saveNote}
            </span>
          )}
          <PrimaryButton variant="secondary" onClick={() => void handleSave()} data-testid="exhibit-list-save">
            Save
          </PrimaryButton>
          <PrimaryButton
            variant="secondary"
            onClick={() => void handleDownloadList()}
            disabled={items.length === 0}
            data-testid="exhibit-list-download"
          >
            Download exhibit list
          </PrimaryButton>
          <PrimaryButton onClick={() => void handleDownloadCoverSheets()} disabled={items.length === 0} data-testid="exhibit-list-download-covers">
            Download cover sheets
          </PrimaryButton>
        </div>
      </div>
    </div>
  )
}
