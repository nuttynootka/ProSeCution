import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { DOCUMENT_TYPES, type DocumentType } from '../ocr'
import { documentRepository, type Document } from '../documents'
import { PlaceholderScreen } from '../components/PlaceholderScreen'
import { ChipGroup } from '../wizard/ChipGroup'
import { TextInput } from '../wizard/Field'
import styles from './DocumentsScreen.module.css'

type ViewMode = 'timeline' | 'folders'

const VIEW_OPTIONS = [
  { value: 'timeline', label: 'Timeline' },
  { value: 'folders', label: 'Folders' },
]

/** Matches the blueprint's document-detail folder labels; 'Other' bucket last, everything else in the same order the chips use elsewhere. */
const FOLDER_ORDER: DocumentType[] = [...DOCUMENT_TYPES]

function matchesQuery(doc: Document, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return doc.originalFilename.toLowerCase().includes(q) || (doc.ocrText?.toLowerCase().includes(q) ?? false)
}

function DocumentRow({ doc, onClick }: { doc: Document; onClick: () => void }) {
  return (
    <button type="button" className={styles.docRow} data-testid="document-row" onClick={onClick}>
      <div className={styles.docMain}>
        <div className={styles.docName}>{doc.originalFilename}</div>
        <div className={styles.docMeta}>
          {new Date(doc.createdAt).toLocaleDateString()}
          {doc.ocrConfidence !== undefined && ` · ${Math.round(doc.ocrConfidence)}% confidence`}
        </div>
      </div>
      <div className={styles.docType}>{doc.documentType ?? 'Other'}</div>
    </button>
  )
}

export function DocumentsScreen() {
  const { caseId } = useParams<{ caseId: string }>()
  const navigate = useNavigate()
  const [documents, setDocuments] = useState<Document[] | null>(null)
  const [view, setView] = useState<ViewMode>('timeline')
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!caseId) return
    let cancelled = false
    documentRepository.listForCase(caseId).then((docs) => {
      if (!cancelled) setDocuments(docs)
    })
    return () => {
      cancelled = true
    }
  }, [caseId])

  const filtered = useMemo(() => (documents ?? []).filter((d) => matchesQuery(d, query)), [documents, query])

  const goToDocument = (documentId: string) => navigate(`/cases/${caseId}/documents/${documentId}`)
  const goBackToCase = () => navigate(`/cases/${caseId}`)

  if (documents === null) return null

  if (documents.length === 0) {
    return (
      <div data-testid="screen-documents">
        <div className={styles.header}>
          <button type="button" className={styles.back} onClick={goBackToCase} aria-label="Back to case" data-testid="documents-back">
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
              <path d="M9.5 2.5L4 7.5L9.5 12.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <div>
            <div className={styles.kicker}>DOCUMENTS</div>
            <div className={styles.title}>Documents</div>
          </div>
        </div>
        <PlaceholderScreen
          title="No documents yet"
          plannedIn="Scan or import a document from the case dashboard."
          testId="documents-empty"
        />
      </div>
    )
  }

  return (
    <div data-testid="screen-documents">
      <div className={styles.header}>
        <button type="button" className={styles.back} onClick={goBackToCase} aria-label="Back to case" data-testid="documents-back">
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
            <path d="M9.5 2.5L4 7.5L9.5 12.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div>
          <div className={styles.kicker}>{documents.length === 1 ? '1 DOCUMENT' : `${documents.length} DOCUMENTS`}</div>
          <div className={styles.title}>Documents</div>
        </div>
      </div>

      <div className={styles.controls}>
        <TextInput
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search filenames and scanned text"
          data-testid="document-search"
        />
        <ChipGroup groupLabel="document-view" options={VIEW_OPTIONS} value={view} onChange={(v) => setView(v as ViewMode)} />
      </div>

      <div className={styles.body}>
        {filtered.length === 0 && (
          <div className={styles.noResults} data-testid="documents-no-results">
            No documents match &ldquo;{query}&rdquo;.
          </div>
        )}

        {filtered.length > 0 && view === 'timeline' && (
          <div className={styles.list} data-testid="document-timeline">
            {filtered.map((doc) => (
              <DocumentRow key={doc.id} doc={doc} onClick={() => goToDocument(doc.id)} />
            ))}
          </div>
        )}

        {filtered.length > 0 && view === 'folders' && (
          <div className={styles.folders} data-testid="document-folders">
            {FOLDER_ORDER.map((type) => {
              const docsInFolder = filtered.filter((d) => (d.documentType ?? 'Other') === type)
              if (docsInFolder.length === 0) return null
              return (
                <div key={type} data-testid={`folder-${type}`}>
                  <div className={styles.folderLabel}>
                    {type.toUpperCase()} · {docsInFolder.length}
                  </div>
                  <div className={styles.list}>
                    {docsInFolder.map((doc) => (
                      <DocumentRow key={doc.id} doc={doc} onClick={() => goToDocument(doc.id)} />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
