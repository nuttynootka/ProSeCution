import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PlaceholderScreen } from '../components/PlaceholderScreen'
import { pdfTemplateRepository, type PdfTemplate } from '../pdf'
import { PrimaryButton } from '../wizard/PrimaryButton'
import { TextInput } from '../wizard/Field'
import styles from './IntakeScreen.module.css'

type Mode =
  | { step: 'list' }
  | { step: 'naming'; file: File; name: string; formType: string }
  | { step: 'saving' }
  | { step: 'error'; message: string }

function stripExtension(filename: string): string {
  return filename.replace(/\.pdf$/i, '')
}

/**
 * The root Intake tab — repurposed from its original Chunk 1 placeholder (which
 * pointed at document capture, but capture lives per-case via the FAB on a case
 * dashboard, built in Chunks 8-11; this root tab never actually got real content).
 * Form templates are the one genuinely tab-level, not case-scoped, "bring something
 * into the app" concept left unhoused, so this is where they live: import a blank
 * court form here, then map its fields in Template Studio.
 */
export function IntakeScreen() {
  const navigate = useNavigate()
  const [templates, setTemplates] = useState<PdfTemplate[] | null>(null)
  const [mode, setMode] = useState<Mode>({ step: 'list' })
  const fileInputRef = useRef<HTMLInputElement>(null)

  const refresh = () => {
    pdfTemplateRepository.list().then(setTemplates)
  }

  useEffect(refresh, [])

  const handleFileChosen = (file: File) => {
    setMode({ step: 'naming', file, name: stripExtension(file.name), formType: '' })
  }

  const handleSave = async () => {
    if (mode.step !== 'naming' || !mode.name.trim()) return
    setMode({ step: 'saving' })
    try {
      await pdfTemplateRepository.create(
        mode.file,
        mode.name.trim(),
        mode.formType.trim() || undefined,
      )
      refresh()
      setMode({ step: 'list' })
    } catch {
      setMode({ step: 'error', message: 'Could not import this PDF. Please try again.' })
    }
  }

  if (templates === null) return null

  return (
    <div data-testid="screen-intake">
      <div className={styles.header}>
        <div className={styles.kicker}>{templates.length === 1 ? '1 TEMPLATE' : `${templates.length} TEMPLATES`}</div>
        <div className={styles.title}>Form templates</div>
      </div>

      <div className={styles.body}>
        {mode.step === 'error' && (
          <div className={styles.errorBanner} role="alert" data-testid="intake-error">
            {mode.message}
          </div>
        )}

        {mode.step === 'naming' && (
          <div className={styles.namingCard} data-testid="intake-naming">
            <div className={styles.namingLabel}>NAME THIS TEMPLATE</div>
            <TextInput
              value={mode.name}
              onChange={(e) => setMode({ ...mode, name: e.target.value })}
              placeholder="e.g. Answer to Complaint"
              data-testid="intake-template-name"
            />
            <TextInput
              value={mode.formType}
              onChange={(e) => setMode({ ...mode, formType: e.target.value })}
              placeholder="Form type (optional) — e.g. SUM-100"
              data-testid="intake-template-form-type"
            />
            <div className={styles.namingActions}>
              <PrimaryButton variant="secondary" onClick={() => setMode({ step: 'list' })} data-testid="intake-naming-cancel">
                Cancel
              </PrimaryButton>
              <PrimaryButton onClick={() => void handleSave()} disabled={!mode.name.trim()} data-testid="intake-naming-save">
                Import
              </PrimaryButton>
            </div>
          </div>
        )}

        {mode.step === 'saving' && (
          <div className={styles.saving} data-testid="intake-saving">
            Reading PDF…
          </div>
        )}

        {mode.step === 'list' && templates.length === 0 && (
          <PlaceholderScreen
            title="No templates yet"
            plannedIn="Tap + to import a blank court form and map its fields."
            testId="intake-empty"
          />
        )}

        {templates.length > 0 && (
          <div className={styles.list} data-testid="template-list">
            {templates.map((t) => (
              <button
                key={t.id}
                type="button"
                className={styles.templateRow}
                data-testid="template-row"
                onClick={() => navigate(`/templates/${t.id}`)}
              >
                <div className={styles.templateName}>{t.name}</div>
                <div className={styles.templateMeta}>
                  {t.formType ? `${t.formType} · ` : ''}
                  {t.pageCount === 1 ? '1 page' : `${t.pageCount} pages`}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <button
        type="button"
        className={styles.fab}
        aria-label="Import a PDF template"
        data-testid="import-template-fab"
        onClick={() => fileInputRef.current?.click()}
      >
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
          <path d="M11 4V18M4 11H18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>

      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        className={styles.hiddenInput}
        data-testid="template-file-input"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) handleFileChosen(file)
        }}
      />
    </div>
  )
}
