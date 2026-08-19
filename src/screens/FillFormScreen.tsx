import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { caseRepository, partyRepository } from '../cases'
import { GlassSurface } from '../components/GlassSurface'
import { PlaceholderScreen } from '../components/PlaceholderScreen'
import {
  checkCompliance,
  fieldMappingRepository,
  fillTemplate,
  loadFillFont,
  pdfFilename,
  pdfTemplateRepository,
  resolveGlobalKey,
  triggerPdfDownload,
  type ComplianceReport,
  type FieldMapping,
  type FillFieldValues,
  type PdfTemplate,
  type TemplateField,
} from '../pdf'
import { TextInput } from '../wizard/Field'
import { PrimaryButton } from '../wizard/PrimaryButton'
import styles from './FillFormScreen.module.css'

type Phase = 'loading' | 'ready' | 'generating' | 'load-error' | 'generate-error'

function fieldsForPage(mappings: FieldMapping[], pageNum: number): TemplateField[] {
  return mappings.find((m) => m.pageNum === pageNum)?.fields ?? []
}

/**
 * The blueprint's "auto-populate from case data, export flattened PDFs" — every
 * field pre-fills from the case's own data when its `suggestedGlobalKey` (Chunk 18)
 * resolves to something (`resolveGlobalKey`, this chunk), and stays a plain editable
 * text field regardless, so a key that doesn't resolve — or a field with no key at
 * all — is just an empty box to fill in by hand, never a blocked or broken field.
 */
export function FillFormScreen() {
  const { caseId, templateId } = useParams<{ caseId: string; templateId: string }>()
  const navigate = useNavigate()
  const [phase, setPhase] = useState<Phase>('loading')
  const [template, setTemplate] = useState<PdfTemplate | null>(null)
  const [mappings, setMappings] = useState<FieldMapping[]>([])
  const [values, setValues] = useState<FillFieldValues>({})
  const [pageNum, setPageNum] = useState(1)
  const [compliance, setCompliance] = useState<ComplianceReport | null>(null)
  const [truncatedFieldIds, setTruncatedFieldIds] = useState<string[]>([])

  useEffect(() => {
    if (!caseId || !templateId) return
    let cancelled = false

    async function run() {
      try {
        const [caseRecord, parties, found, allMappings] = await Promise.all([
          caseRepository.get(caseId!),
          partyRepository.listForCase(caseId!),
          pdfTemplateRepository.get(templateId!),
          fieldMappingRepository.listForTemplate(templateId!),
        ])
        if (!caseRecord || !found) throw new Error('not found')
        if (cancelled) return

        const initialValues: FillFieldValues = {}
        for (const mapping of allMappings) {
          for (const field of mapping.fields) {
            const resolved = field.suggestedGlobalKey
              ? resolveGlobalKey(field.suggestedGlobalKey, { case: caseRecord, parties })
              : undefined
            if (resolved) initialValues[field.fieldId] = resolved
          }
        }

        setTemplate(found)
        setMappings(allMappings)
        setValues(initialValues)
        setPhase('ready')
      } catch {
        if (!cancelled) setPhase('load-error')
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [caseId, templateId])

  const goBack = () => navigate(`/cases/${caseId}`)

  const handleGenerate = async () => {
    if (!templateId) return
    setPhase('generating')
    setCompliance(null)
    setTruncatedFieldIds([])
    try {
      const blob = await pdfTemplateRepository.getFileBlob(templateId)
      if (!blob) throw new Error('template file missing')
      const bytes = new Uint8Array(await blob.arrayBuffer())
      const fontBytes = await loadFillFont()
      const filled = await fillTemplate(bytes, mappings, values, fontBytes)
      triggerPdfDownload(pdfFilename(template?.name ?? 'form'), filled.bytes)
      setCompliance(await checkCompliance(filled.bytes, mappings))
      setTruncatedFieldIds(filled.truncatedFieldIds)
      setPhase('ready')
    } catch {
      setPhase('generate-error')
    }
  }

  if (phase === 'loading') return null

  if (phase === 'load-error' || !template) {
    return <PlaceholderScreen title="Could not open this form" plannedIn="The template or case may have been deleted." testId="fill-form-error" />
  }

  const currentFields = fieldsForPage(mappings, pageNum)
  const totalFields = mappings.reduce((sum, m) => sum + m.fields.length, 0)
  const allFields = mappings.flatMap((m) => m.fields)
  const truncatedFieldLabels = truncatedFieldIds.map((id) => allFields.find((f) => f.fieldId === id)?.label || id)

  return (
    <div className={styles.root} data-testid="fill-form-screen">
      <div className={styles.header}>
        <button type="button" className={styles.back} onClick={goBack} aria-label="Back to case" data-testid="fill-form-back">
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
            <path d="M9.5 2.5L4 7.5L9.5 12.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div className={styles.headerText}>
          <div className={styles.kicker}>FILL FORM</div>
          <div className={styles.title}>{template.name}</div>
        </div>
      </div>

      <div className={styles.body}>
        {totalFields === 0 && (
          <div className={styles.note} data-testid="fill-form-no-fields">
            This template has no mapped fields yet. You can still download it as-is, or map fields first in Template
            Studio.
          </div>
        )}

        {template.pageCount > 1 && (
          <div className={styles.pageNav}>
            <button type="button" onClick={() => setPageNum((p) => Math.max(1, p - 1))} disabled={pageNum <= 1} data-testid="fill-form-prev-page">
              Previous page
            </button>
            <span className={styles.pageIndicator}>
              Page {pageNum} of {template.pageCount}
            </span>
            <button
              type="button"
              onClick={() => setPageNum((p) => Math.min(template.pageCount, p + 1))}
              disabled={pageNum >= template.pageCount}
              data-testid="fill-form-next-page"
            >
              Next page
            </button>
          </div>
        )}

        {currentFields.map((field) => (
          <GlassSurface key={field.fieldId} style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className={styles.fieldLabel}>{field.label || field.fieldId}</div>
            <TextInput
              value={values[field.fieldId] ?? ''}
              onChange={(e) => setValues((prev) => ({ ...prev, [field.fieldId]: e.target.value }))}
              data-testid="fill-form-field-input"
              data-field-id={field.fieldId}
            />
          </GlassSurface>
        ))}

        {phase === 'generate-error' && (
          <div className={styles.errorBanner} role="alert" data-testid="fill-form-generate-error">
            Could not generate the PDF. Please try again.
          </div>
        )}

        {truncatedFieldLabels.length > 0 && (
          <div className={styles.errorBanner} role="alert" data-testid="fill-form-truncated-warning">
            Some text didn't fully fit even at the smallest readable size and was cut off: {truncatedFieldLabels.join(', ')}.
            Shorten it or split it across fields, then generate again.
          </div>
        )}

        {compliance && (
          <GlassSurface style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }} data-testid="fill-form-compliance">
            <div className={styles.fieldLabel}>E-FILING CHECKS (NOT FULL PDF/A VALIDATION)</div>
            {compliance.checks.map((check) => (
              <div key={check.id} className={styles.complianceRow} data-testid="compliance-check" data-passed={check.passed}>
                <span className={check.passed ? styles.complianceOk : styles.complianceFail}>{check.passed ? '✓' : '✗'}</span>
                <div>
                  <div className={styles.complianceLabel}>{check.label}</div>
                  <div className={styles.complianceDetail}>{check.detail}</div>
                </div>
              </div>
            ))}
          </GlassSurface>
        )}
      </div>

      <div className={styles.footer}>
        <PrimaryButton disabled={phase === 'generating'} onClick={() => void handleGenerate()} data-testid="fill-form-generate">
          {phase === 'generating' ? 'Generating…' : 'Generate & download'}
        </PrimaryButton>
      </div>
    </div>
  )
}
