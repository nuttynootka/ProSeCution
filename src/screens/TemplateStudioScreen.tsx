import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { suggestFieldsFromPage } from '../agents'
import { getProviderDef, llmSettingsRepository } from '../llm'
import {
  boundingBoxToFractional,
  defaultFieldRect,
  fieldMappingRepository,
  fractionalToBoundingBox,
  loadPdf,
  moveCorner,
  pdfTemplateRepository,
  STAMP_ZONE_HEIGHT_PT,
  translateRect,
  type Corner,
  type FractionalRect,
  type MultiLineRuledField,
  type PdfDocumentHandle,
  type PdfTemplate,
  type TemplateField,
} from '../pdf'
import { PlaceholderScreen } from '../components/PlaceholderScreen'
import { ChipGroup } from '../wizard/ChipGroup'
import { SectionLabel, TextInput } from '../wizard/Field'
import { PrimaryButton } from '../wizard/PrimaryButton'
import styles from './TemplateStudioScreen.module.css'

type SuggestState = 'idle' | 'working' | 'no-provider' | 'no-text' | 'llm-error' | 'done'

const SUGGEST_NOTE: Record<Exclude<SuggestState, 'idle' | 'working'>, string> = {
  'no-provider': 'Set up an AI provider in Vault settings first to use auto-suggest.',
  'no-text': "No extractable text on this page — it's likely a scanned image. Auto-suggest only works on a PDF's real text layer.",
  'llm-error': "Couldn't get suggestions right now. Check your AI provider settings and try again.",
  done: 'Suggested fields added — review, adjust, or delete them like any other field.',
}

const CORNERS: Corner[] = ['topLeft', 'topRight', 'bottomLeft', 'bottomRight']
const TYPE_OPTIONS = [
  { value: 'SINGLE_LINE', label: 'Single line' },
  { value: 'MULTI_LINE_RULED', label: 'Multi-line' },
]
const RENDER_SCALE = 1.5

type Phase = 'loading' | 'ready' | 'load-error'
type Drag = { fieldId: string; mode: 'move' } | { fieldId: string; mode: 'resize'; corner: Corner }

function newFieldId(): string {
  return crypto.randomUUID()
}

export function TemplateStudioScreen() {
  const { templateId } = useParams<{ templateId: string }>()
  const navigate = useNavigate()
  const [phase, setPhase] = useState<Phase>('loading')
  const [template, setTemplate] = useState<PdfTemplate | null>(null)
  const [pageNum, setPageNum] = useState(1)
  const [pageSize, setPageSize] = useState<{ width: number; height: number } | null>(null)
  const [fields, setFields] = useState<TemplateField[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [saveNote, setSaveNote] = useState<string | null>(null)
  const [suggestState, setSuggestState] = useState<SuggestState>('idle')

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const docRef = useRef<PdfDocumentHandle | null>(null)
  const dragRef = useRef<Drag | null>(null)

  // Load the template + PDF document once.
  useEffect(() => {
    if (!templateId) return
    let cancelled = false

    async function run() {
      try {
        const found = await pdfTemplateRepository.get(templateId!)
        const blob = found && (await pdfTemplateRepository.getFileBlob(templateId!))
        if (!found || !blob) throw new Error('not found')
        if (cancelled) return

        const bytes = new Uint8Array(await blob.arrayBuffer())
        const doc = await loadPdf(bytes)
        if (cancelled) {
          doc.destroy()
          return
        }
        docRef.current = doc
        setTemplate(found)
        setPhase('ready')
      } catch {
        if (!cancelled) setPhase('load-error')
      }
    }

    void run()
    return () => {
      cancelled = true
      docRef.current?.destroy()
      docRef.current = null
    }
  }, [templateId])

  // Render the current page and load its existing field mapping whenever the page changes.
  useEffect(() => {
    if (phase !== 'ready' || !templateId) return
    let cancelled = false

    async function run() {
      const doc = docRef.current
      const canvas = canvasRef.current
      if (!doc || !canvas) return

      const size = await doc.getPageSize(pageNum)
      await doc.renderPage(pageNum, RENDER_SCALE, canvas)
      const mapping = await fieldMappingRepository.getForPage(templateId!, pageNum)
      if (cancelled) return

      setPageSize(size)
      setFields(mapping?.fields ?? [])
      setSelectedId(null)
      setSuggestState('idle')
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [phase, templateId, pageNum])

  const selected = fields.find((f) => f.fieldId === selectedId) ?? null

  const fractionalOf = (field: TemplateField): FractionalRect => {
    if (!pageSize) return { left: 0, top: 0, right: 0, bottom: 0 }
    return boundingBoxToFractional(field.boundingBox, pageSize.width, pageSize.height)
  }

  const updateField = (fieldId: string, rect: FractionalRect) => {
    if (!pageSize) return
    setFields((prev) =>
      prev.map((f) => (f.fieldId === fieldId ? { ...f, boundingBox: fractionalToBoundingBox(rect, pageSize.width, pageSize.height) } : f)),
    )
  }

  const pointerFraction = (e: { clientX: number; clientY: number }): { x: number; y: number } => {
    const bounds = stageRef.current?.getBoundingClientRect()
    if (!bounds) return { x: 0, y: 0 }
    return { x: (e.clientX - bounds.left) / bounds.width, y: (e.clientY - bounds.top) / bounds.height }
  }

  const handleStagePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.target !== stageRef.current && e.target !== canvasRef.current) return // a field/handle handles its own pointerdown
    if (!pageSize) return
    const { x, y } = pointerFraction(e)
    const rect = defaultFieldRect(x, y)
    const field: TemplateField = {
      fieldId: newFieldId(),
      type: 'SINGLE_LINE',
      boundingBox: fractionalToBoundingBox(rect, pageSize.width, pageSize.height),
    }
    setFields((prev) => [...prev, field])
    setSelectedId(field.fieldId)
  }

  const handleFieldPointerDown = (fieldId: string) => (e: ReactPointerEvent<HTMLDivElement>) => {
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    setSelectedId(fieldId)
    dragRef.current = { fieldId, mode: 'move' }
  }

  const handleHandlePointerDown = (fieldId: string, corner: Corner) => (e: ReactPointerEvent<HTMLDivElement>) => {
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { fieldId, mode: 'resize', corner }
  }

  const lastPointer = useRef<{ x: number; y: number } | null>(null)

  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag) return
    const field = fields.find((f) => f.fieldId === drag.fieldId)
    if (!field) return
    const { x, y } = pointerFraction(e)
    const current = fractionalOf(field)

    if (drag.mode === 'resize') {
      updateField(drag.fieldId, moveCorner(current, drag.corner, x, y))
    } else {
      const last = lastPointer.current ?? { x, y }
      updateField(drag.fieldId, translateRect(current, x - last.x, y - last.y))
    }
    lastPointer.current = { x, y }
  }

  const handlePointerUp = () => {
    dragRef.current = null
    lastPointer.current = null
  }

  const handleDeleteSelected = () => {
    if (!selectedId) return
    setFields((prev) => prev.filter((f) => f.fieldId !== selectedId))
    setSelectedId(null)
  }

  const patchSelected = (patch: { label?: string; suggestedGlobalKey?: string }) => {
    if (!selectedId) return
    setFields((prev) => prev.map((f) => (f.fieldId === selectedId ? { ...f, ...patch } : f)))
  }

  const patchMultiLine = (patch: Partial<Pick<MultiLineRuledField, 'baselineYOffset' | 'lineHeight' | 'maxLines'>>) => {
    if (!selectedId) return
    setFields((prev) =>
      prev.map((f) => (f.fieldId === selectedId && f.type === 'MULTI_LINE_RULED' ? { ...f, ...patch } : f)),
    )
  }

  const handleTypeChange = (type: string) => {
    if (!selectedId || !pageSize) return
    const DEFAULT_LINE_HEIGHT = 16
    const DEFAULT_MAX_LINES = 3

    setFields((prev) =>
      prev.map((f): TemplateField => {
        if (f.fieldId !== selectedId) return f
        const shared = { fieldId: f.fieldId, label: f.label, suggestedGlobalKey: f.suggestedGlobalKey }

        if (type === 'MULTI_LINE_RULED') {
          // A ruled multi-line box should actually look like it holds several
          // lines, not stay pinned at a single-line field's tiny default height —
          // grow it to fit maxLines at the default line height, same width/top.
          const height = Math.min(DEFAULT_LINE_HEIGHT * DEFAULT_MAX_LINES, pageSize.height - f.boundingBox.top)
          return {
            ...shared,
            type: 'MULTI_LINE_RULED',
            boundingBox: { ...f.boundingBox, height },
            baselineYOffset: 0,
            lineHeight: DEFAULT_LINE_HEIGHT,
            maxLines: DEFAULT_MAX_LINES,
          }
        }

        return { ...shared, type: 'SINGLE_LINE', boundingBox: f.boundingBox }
      }),
    )
  }

  const persistCurrentPage = async (nextFields: TemplateField[] = fields) => {
    if (!templateId) return
    await fieldMappingRepository.upsertForPage(templateId, pageNum, nextFields)
  }

  const handleSave = async () => {
    await persistCurrentPage()
    setSaveNote('Saved')
    setTimeout(() => setSaveNote(null), 1500)
  }

  const handleAutoSuggest = async () => {
    const doc = docRef.current
    if (!doc) return
    setSuggestState('working')

    const settings = await llmSettingsRepository.get()
    const providerId = settings.activeProviderId
    const provider = providerId ? getProviderDef(providerId) : undefined
    const config = providerId ? settings.providerConfigs[providerId] : undefined
    if (!provider || (provider.requiresApiKey && !config?.apiKey)) {
      setSuggestState('no-provider')
      return
    }

    const textItems = await doc.getPageTextItems(pageNum)
    const result = await suggestFieldsFromPage({
      textItems,
      provider,
      apiKey: config?.apiKey ?? '',
      model: config?.selectedModel ?? provider.defaultModel,
    })

    if (result.status === 'no-text' || result.status === 'llm-error') {
      setSuggestState(result.status)
      return
    }

    const existingIds = new Set(fields.map((f) => f.fieldId))
    const newFields = result.fields.map((f) => (existingIds.has(f.fieldId) ? { ...f, fieldId: newFieldId() } : f))
    setFields((prev) => [...prev, ...newFields])
    setSuggestState('done')
  }

  const goToPage = async (next: number) => {
    if (!template || next < 1 || next > template.pageCount) return
    await persistCurrentPage()
    setPageNum(next)
  }

  const goBack = () => navigate('/intake')

  if (phase === 'loading') return null

  if (phase === 'load-error' || !template) {
    return <PlaceholderScreen title="Template not found" plannedIn="It may have been deleted." testId="template-not-found" />
  }

  return (
    <div className={styles.root} data-testid="template-studio-screen">
      <div className={styles.header}>
        <button type="button" className={styles.back} onClick={goBack} aria-label="Back to templates" data-testid="studio-back">
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
            <path d="M9.5 2.5L4 7.5L9.5 12.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div className={styles.headerText}>
          <div className={styles.kicker}>
            PAGE {pageNum} OF {template.pageCount}
          </div>
          <div className={styles.title}>{template.name}</div>
        </div>
      </div>

      <div className={styles.stageWrap}>
        <div
          ref={stageRef}
          className={styles.stage}
          onPointerDown={handleStagePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          data-testid="template-stage"
        >
          <canvas ref={canvasRef} className={styles.canvas} data-testid="template-canvas" />
          {pageNum === 1 && pageSize && (
            <div
              className={styles.stampZone}
              style={{ height: `${Math.min(1, STAMP_ZONE_HEIGHT_PT / pageSize.height) * 100}%` }}
              data-testid="stamp-zone-guide"
            >
              <span className={styles.stampZoneLabel}>RESERVED FOR COURT STAMP</span>
            </div>
          )}
          {fields.map((field) => {
            const rect = fractionalOf(field)
            const isSelected = field.fieldId === selectedId
            return (
              <div
                key={field.fieldId}
                className={`${styles.field} ${isSelected ? styles.fieldSelected : ''}`}
                style={{
                  left: `${rect.left * 100}%`,
                  top: `${rect.top * 100}%`,
                  width: `${(rect.right - rect.left) * 100}%`,
                  height: `${(rect.bottom - rect.top) * 100}%`,
                }}
                onPointerDown={handleFieldPointerDown(field.fieldId)}
                data-testid="template-field"
                data-selected={isSelected}
              >
                {isSelected &&
                  CORNERS.map((corner) => (
                    <div
                      key={corner}
                      className={`${styles.handle} ${styles[`handle_${corner}`]}`}
                      onPointerDown={handleHandlePointerDown(field.fieldId, corner)}
                      data-testid={`field-handle-${corner}`}
                    />
                  ))}
              </div>
            )
          })}
        </div>
      </div>

      <div className={styles.pageNav}>
        <button
          type="button"
          className={styles.pageNavButton}
          onClick={() => void goToPage(pageNum - 1)}
          disabled={pageNum <= 1}
          data-testid="studio-prev-page"
        >
          Previous page
        </button>
        <button
          type="button"
          className={styles.pageNavButton}
          onClick={() => void goToPage(pageNum + 1)}
          disabled={pageNum >= template.pageCount}
          data-testid="studio-next-page"
        >
          Next page
        </button>
      </div>

      <div className={styles.suggestRow}>
        <button
          type="button"
          className={styles.suggestButton}
          onClick={() => void handleAutoSuggest()}
          disabled={suggestState === 'working'}
          data-testid="studio-auto-suggest"
        >
          {suggestState === 'working' ? 'Suggesting…' : 'Auto-suggest fields'}
        </button>
        {suggestState !== 'idle' && suggestState !== 'working' && (
          <span className={styles.suggestNote} data-testid="studio-suggest-note">
            {SUGGEST_NOTE[suggestState]}
          </span>
        )}
      </div>

      {selected && (
        <div className={styles.editor} data-testid="field-editor">
          <SectionLabel>Field type</SectionLabel>
          <ChipGroup groupLabel="field-type" options={TYPE_OPTIONS} value={selected.type} onChange={handleTypeChange} />

          <SectionLabel>Label</SectionLabel>
          <TextInput
            value={selected.label ?? ''}
            onChange={(e) => patchSelected({ label: e.target.value })}
            placeholder="e.g. Plaintiff name"
            data-testid="field-label-input"
          />

          <SectionLabel>Suggested case-data key (optional)</SectionLabel>
          <TextInput
            value={selected.suggestedGlobalKey ?? ''}
            onChange={(e) => patchSelected({ suggestedGlobalKey: e.target.value })}
            placeholder="e.g. plaintiff.name"
            data-testid="field-key-input"
          />

          {selected.type === 'MULTI_LINE_RULED' && (
            <>
              <SectionLabel>Max lines</SectionLabel>
              <TextInput
                type="number"
                min={1}
                value={selected.maxLines}
                onChange={(e) => patchMultiLine({ maxLines: Math.max(1, Number(e.target.value) || 1) })}
                data-testid="field-max-lines-input"
              />
            </>
          )}

          <button type="button" className={styles.deleteButton} onClick={handleDeleteSelected} data-testid="field-delete">
            Delete field
          </button>
        </div>
      )}

      <div className={styles.footer}>
        {saveNote && (
          <span className={styles.saveNote} data-testid="studio-save-note">
            {saveNote}
          </span>
        )}
        <PrimaryButton onClick={() => void handleSave()} data-testid="studio-save">
          Save page
        </PrimaryButton>
      </div>
    </div>
  )
}
