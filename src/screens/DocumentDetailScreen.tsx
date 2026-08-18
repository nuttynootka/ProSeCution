import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { GlassSurface } from '../components/GlassSurface'
import { PlaceholderScreen } from '../components/PlaceholderScreen'
import { documentRepository, type Document } from '../documents'
import { DOCUMENT_TYPES, recognizeToSearchablePdf, type DocumentType } from '../ocr'
import { pdfFilename, triggerPdfDownload } from '../pdf'
import { ChipGroup } from '../wizard/ChipGroup'
import { SectionLabel } from '../wizard/Field'
import { PrimaryButton } from '../wizard/PrimaryButton'
import styles from './DocumentDetailScreen.module.css'

const DOCUMENT_TYPE_OPTIONS = DOCUMENT_TYPES.map((t) => ({ value: t, label: t }))

type Phase = 'loading' | 'ready' | 'saving' | 'load-error'

/**
 * Views and edits an *already-processed* document — unlike DocumentReviewScreen
 * (Chunk 10), which runs OCR fresh on a document that was just captured, this never
 * re-runs OCR. Doing so here would silently overwrite whatever correction the user
 * already made in review with a brand-new (and possibly worse) recognition pass.
 * Editing here just corrects the persisted fields directly.
 */
export function DocumentDetailScreen() {
  const { caseId, documentId } = useParams<{ caseId: string; documentId: string }>()
  const navigate = useNavigate()
  const [phase, setPhase] = useState<Phase>('loading')
  const [doc, setDoc] = useState<Document | null>(null)
  const [documentType, setDocumentType] = useState<DocumentType>('Other')
  const [text, setText] = useState('')
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  useEffect(() => {
    if (!documentId) return
    let cancelled = false
    let objectUrl: string | null = null

    async function run() {
      try {
        const found = await documentRepository.get(documentId!)
        if (!found) throw new Error('not found')
        if (cancelled) return
        setDoc(found)
        setDocumentType(found.documentType ?? 'Other')
        setText(found.ocrText ?? '')

        if (found.mimeType.startsWith('image/')) {
          const blob = await documentRepository.getFileBlob(documentId!)
          if (cancelled || !blob) return
          objectUrl = URL.createObjectURL(blob)
          setImageUrl(objectUrl)
        }
        if (!cancelled) setPhase('ready')
      } catch {
        if (!cancelled) setPhase('load-error')
      }
    }

    void run()
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [documentId])

  const goToDocuments = () => navigate(`/cases/${caseId}/documents`)

  const handleSave = async () => {
    if (!documentId) return
    setSaveError(null)
    setPhase('saving')
    try {
      await documentRepository.updateOcrResult(documentId, { documentType, ocrText: text })
      goToDocuments()
    } catch {
      setSaveError('Could not save. Please try again.')
      setPhase('ready')
    }
  }

  const handleExportSearchablePdf = async () => {
    if (!documentId || !doc) return
    setExportError(null)
    setExporting(true)
    try {
      const blob = await documentRepository.getFileBlob(documentId)
      if (!blob) throw new Error('missing file')
      const pdfBytes = await recognizeToSearchablePdf(blob, doc.originalFilename)
      triggerPdfDownload(pdfFilename(doc.originalFilename), pdfBytes)
    } catch {
      setExportError('Could not create a searchable PDF. Please try again.')
    } finally {
      setExporting(false)
    }
  }

  const handleDelete = async () => {
    if (!documentId) return
    if (!confirmingDelete) {
      setConfirmingDelete(true)
      return
    }
    await documentRepository.delete(documentId)
    goToDocuments()
  }

  if (phase === 'loading') return null

  if (phase === 'load-error' || !doc) {
    return (
      <PlaceholderScreen title="Document not found" plannedIn="It may have been deleted." testId="document-not-found" />
    )
  }

  return (
    <div className={styles.root} data-testid="document-detail-screen">
      <div className={styles.header}>
        <button type="button" className={styles.back} onClick={goToDocuments} aria-label="Back to documents" data-testid="document-detail-back">
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
            <path d="M9.5 2.5L4 7.5L9.5 12.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div className={styles.headerText}>
          <div className={styles.kicker}>{new Date(doc.createdAt).toLocaleDateString()}</div>
          <div className={styles.title}>{doc.originalFilename}</div>
        </div>
      </div>

      <div className={styles.body}>
        {imageUrl ? (
          <img src={imageUrl} alt="" className={styles.preview} data-testid="document-preview-image" />
        ) : (
          <div className={styles.previewFallback} data-testid="document-preview-fallback">
            {doc.mimeType === 'application/pdf' ? 'PDF document' : doc.mimeType}
          </div>
        )}

        <GlassSurface style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <SectionLabel>Document type</SectionLabel>
          <ChipGroup
            groupLabel="document-type"
            options={DOCUMENT_TYPE_OPTIONS}
            value={documentType}
            onChange={(value) => setDocumentType(value as DocumentType)}
          />
        </GlassSurface>

        <GlassSurface style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className={styles.textHeader}>
            <SectionLabel>Recognized text</SectionLabel>
            {doc.ocrConfidence !== undefined && (
              <span className={styles.confidenceBadge} data-testid="document-detail-confidence">
                {Math.round(doc.ocrConfidence)}% confidence
              </span>
            )}
          </div>
          <textarea
            className={styles.textarea}
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            data-testid="document-detail-text"
            placeholder="No text recorded — type it in by hand. This is also what search matches against."
          />
        </GlassSurface>

        {saveError && (
          <div className={styles.errorBanner} role="alert" data-testid="document-detail-save-error">
            {saveError}
          </div>
        )}

        <PrimaryButton disabled={phase === 'saving'} onClick={() => void handleSave()} data-testid="document-detail-save">
          {phase === 'saving' ? 'Saving…' : 'Save changes'}
        </PrimaryButton>

        {imageUrl && (
          <>
            {exportError && (
              <div className={styles.errorBanner} role="alert" data-testid="document-detail-export-error">
                {exportError}
              </div>
            )}
            <button
              type="button"
              className={styles.exportButton}
              onClick={() => void handleExportSearchablePdf()}
              disabled={exporting}
              data-testid="document-detail-export-pdf"
            >
              {exporting ? 'Creating searchable PDF…' : 'Export as searchable PDF'}
            </button>
          </>
        )}

        <button type="button" className={styles.deleteButton} onClick={() => void handleDelete()} data-testid="document-detail-delete">
          {confirmingDelete ? 'Tap again to permanently delete' : 'Delete document'}
        </button>
      </div>
    </div>
  )
}
