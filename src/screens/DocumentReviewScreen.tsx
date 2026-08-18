import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { caseRepository } from '../cases'
import { GlassSurface } from '../components/GlassSurface'
import { documentRepository } from '../documents'
import { categorizeDocument, DOCUMENT_TYPES, extractCaseNumber, recognizeText, type DocumentType } from '../ocr'
import { detectPii, redactText, type PiiMatch } from '../redaction'
import { ChipGroup } from '../wizard/ChipGroup'
import { SectionLabel, TextInput } from '../wizard/Field'
import { PrimaryButton } from '../wizard/PrimaryButton'
import styles from './DocumentReviewScreen.module.css'

const DOCUMENT_TYPE_OPTIONS = DOCUMENT_TYPES.map((t) => ({ value: t, label: t }))

const PII_TYPE_LABEL: Record<PiiMatch['type'], string> = {
  ssn: 'SSN',
  dob: 'Date of birth',
  'minor-dob': "Minor's date of birth",
  'financial-account': 'Financial account',
}

type Phase = 'loading' | 'ready' | 'saving' | 'load-error'

interface Fields {
  documentType: DocumentType
  /** Whether OCR actually ran on this file (image types only — PDFs skip it, see below). */
  hasOcr: boolean
  ocrText: string
  ocrConfidence: number | null
  caseNumber: string
}

function confidenceTone(confidence: number): 'high' | 'medium' | 'low' {
  if (confidence >= 80) return 'high'
  if (confidence >= 50) return 'medium'
  return 'low'
}

const TONE_CLASS = {
  high: styles.confidenceHigh,
  medium: styles.confidenceMedium,
  low: styles.confidenceLow,
}

/**
 * Runs after a document is captured and already saved (CaptureScreen creates it
 * first, then routes here) — this screen never holds the only copy of the file, it
 * only refines metadata on an already-persisted document. OCR runs here rather than
 * in CaptureScreen so the user sees a scanning state and a chance to correct
 * whatever it found, matching the mockup's confidence + correction UI.
 *
 * PDFs skip OCR entirely: Tesseract.js recognizes raster images, not PDF page
 * content, and pretending otherwise would mean silently returning garbage. Rather
 * than faking a result, `hasOcr` stays false and the screen says so.
 */
export function DocumentReviewScreen() {
  const { caseId, documentId } = useParams<{ caseId: string; documentId: string }>()
  const navigate = useNavigate()
  const [phase, setPhase] = useState<Phase>('loading')
  const [fields, setFields] = useState<Fields | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [stubNote, setStubNote] = useState<'template' | null>(null)
  const [piiMatches, setPiiMatches] = useState<PiiMatch[]>([])
  const [excludedMatches, setExcludedMatches] = useState<Set<number>>(new Set())
  const [redactionApplied, setRedactionApplied] = useState(false)

  useEffect(() => {
    if (!documentId) return
    let cancelled = false

    async function run() {
      try {
        const blob = await documentRepository.getFileBlob(documentId!)
        if (!blob) throw new Error('document not found')

        if (blob.type.startsWith('image/')) {
          const result = await recognizeText(blob)
          if (cancelled) return
          setFields({
            documentType: categorizeDocument(result.text),
            hasOcr: true,
            ocrText: result.text,
            ocrConfidence: result.confidence,
            caseNumber: extractCaseNumber(result.text) ?? '',
          })
          setPiiMatches(detectPii(result.text))
        } else {
          if (cancelled) return
          setFields({ documentType: 'Other', hasOcr: false, ocrText: '', ocrConfidence: null, caseNumber: '' })
        }
        if (!cancelled) setPhase('ready')
      } catch {
        if (!cancelled) setPhase('load-error')
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [documentId])

  const patch = (partial: Partial<Fields>) => setFields((prev) => (prev ? { ...prev, ...partial } : prev))

  // Re-scanning on every hand-edit, rather than reusing the matches found right after
  // OCR, keeps match offsets valid — a manual correction upstream in the text would
  // otherwise silently shift every match after it out from under its own span.
  const handleOcrTextChange = (text: string) => {
    patch({ ocrText: text })
    setPiiMatches(detectPii(text))
    setExcludedMatches(new Set())
    setRedactionApplied(false)
  }

  const toggleMatch = (index: number) => {
    setExcludedMatches((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  const activeMatches = piiMatches.filter((_, i) => !excludedMatches.has(i))

  const handleApplyRedaction = () => {
    if (!fields) return
    patch({ ocrText: redactText(fields.ocrText, activeMatches) })
    setPiiMatches([])
    setExcludedMatches(new Set())
    setRedactionApplied(true)
  }

  const goBackToCase = () => navigate(`/cases/${caseId}`)

  const handleSave = async () => {
    if (!documentId || !caseId || !fields) return
    setSaveError(null)
    setPhase('saving')
    try {
      await documentRepository.updateOcrResult(
        documentId,
        fields.hasOcr
          ? { ocrText: fields.ocrText, ocrConfidence: fields.ocrConfidence ?? undefined, documentType: fields.documentType }
          : { documentType: fields.documentType },
      )
      if (fields.caseNumber.trim()) {
        await caseRepository.update(caseId, { caseNumber: fields.caseNumber.trim() })
      }
      goBackToCase()
    } catch {
      setSaveError('Could not save. Please try again.')
      setPhase('ready')
    }
  }

  return (
    <div className={styles.root} data-testid="review-screen">
      <div className={styles.header}>
        <button type="button" className={styles.back} onClick={goBackToCase} aria-label="Back to case" data-testid="review-back">
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
          <div className={styles.kicker}>REVIEW DOCUMENT</div>
          <div className={styles.title}>Confirm details</div>
        </div>
      </div>

      <div className={styles.body}>
        {phase === 'loading' && (
          <div className={styles.loading} data-testid="review-loading">
            Reading document…
          </div>
        )}

        {phase === 'load-error' && (
          <div className={styles.errorBanner} role="alert" data-testid="review-load-error">
            Could not read this document.
          </div>
        )}

        {fields && phase !== 'load-error' && phase !== 'loading' && (
          <>
            <GlassSurface style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <SectionLabel>Document type</SectionLabel>
              <ChipGroup
                groupLabel="document-type"
                options={DOCUMENT_TYPE_OPTIONS}
                value={fields.documentType}
                onChange={(value) => patch({ documentType: value as DocumentType })}
              />
            </GlassSurface>

            {fields.hasOcr ? (
              <GlassSurface style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div className={styles.ocrHeader}>
                  <SectionLabel>Scanned text</SectionLabel>
                  {fields.ocrConfidence !== null && (
                    <span
                      className={`${styles.confidenceBadge} ${TONE_CLASS[confidenceTone(fields.ocrConfidence)]}`}
                      data-testid="ocr-confidence"
                    >
                      {Math.round(fields.ocrConfidence)}% confidence
                    </span>
                  )}
                </div>
                <textarea
                  className={styles.ocrTextarea}
                  value={fields.ocrText}
                  onChange={(e) => handleOcrTextChange(e.target.value)}
                  rows={6}
                  data-testid="ocr-text-input"
                  placeholder="No text was found — you can type it in by hand."
                />
              </GlassSurface>
            ) : (
              <GlassSurface style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <SectionLabel>Scanned text</SectionLabel>
                <p className={styles.note}>
                  Automatic text extraction isn't available for PDFs yet. You can still tag this document and add
                  its case number by hand.
                </p>
              </GlassSurface>
            )}

            <GlassSurface style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <SectionLabel>Case number</SectionLabel>
              <TextInput
                value={fields.caseNumber}
                onChange={(e) => patch({ caseNumber: e.target.value })}
                placeholder="e.g. 24CV1234"
                data-testid="case-number-input"
              />
            </GlassSurface>

            {piiMatches.length > 0 && (
              <GlassSurface
                style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}
                data-testid="redaction-panel"
              >
                <SectionLabel>Sensitive information detected</SectionLabel>
                <p className={styles.note}>
                  Review each item below — uncheck anything that shouldn't be redacted — then redact before saving.
                </p>
                <div className={styles.redactionList}>
                  {piiMatches.map((match, i) => (
                    <label key={`${match.start}-${match.end}`} className={styles.redactionRow} data-testid="redaction-match">
                      <input
                        type="checkbox"
                        checked={!excludedMatches.has(i)}
                        onChange={() => toggleMatch(i)}
                        data-testid="redaction-match-checkbox"
                      />
                      <span className={styles.redactionType}>{PII_TYPE_LABEL[match.type]}</span>
                      <span className={styles.redactionText}>{match.text}</span>
                    </label>
                  ))}
                </div>
                <button
                  type="button"
                  className={styles.redactButton}
                  onClick={handleApplyRedaction}
                  disabled={activeMatches.length === 0}
                  data-testid="redaction-apply"
                >
                  Redact {activeMatches.length} item{activeMatches.length === 1 ? '' : 's'}
                </button>
              </GlassSurface>
            )}

            {redactionApplied && (
              <div className={styles.redactedNote} data-testid="redaction-applied-note">
                Sensitive information has been redacted from the scanned text above.
              </div>
            )}

            <button
              type="button"
              className={styles.stubCard}
              onClick={() => setStubNote('template')}
              data-testid="stub-template"
            >
              <div className={styles.stubTitle}>Map to a form template</div>
              <div className={styles.stubNote}>
                {stubNote === 'template' ? 'Template mapping arrives in a later update.' : 'Use this document to fill a court form'}
              </div>
            </button>

            {saveError && (
              <div className={styles.errorBanner} role="alert" data-testid="review-save-error">
                {saveError}
              </div>
            )}

            <PrimaryButton disabled={phase === 'saving'} onClick={() => void handleSave()} data-testid="review-save">
              {phase === 'saving' ? 'Saving…' : 'Save document'}
            </PrimaryButton>
          </>
        )}
      </div>
    </div>
  )
}
