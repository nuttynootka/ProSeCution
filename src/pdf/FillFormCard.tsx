import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { pdfTemplateRepository } from './index'
import type { PdfTemplate } from './types'
import styles from './FillFormCard.module.css'

interface FillFormCardProps {
  caseId: string
}

/** The dashboard entry point into Chunk 19's fill-and-download flow — picks which imported template (Chunk 18's Intake tab library) to fill for this case, then hands off to FillFormScreen. */
export function FillFormCard({ caseId }: FillFormCardProps) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [templates, setTemplates] = useState<PdfTemplate[] | null>(null)

  if (!open) {
    return (
      <button
        type="button"
        className={styles.prompt}
        onClick={() => {
          setOpen(true)
          pdfTemplateRepository.list().then(setTemplates)
        }}
        data-testid="fill-form-prompt"
      >
        <div className={styles.promptTitle}>Fill a court form</div>
        <div className={styles.promptNote}>Auto-populate a form template with this case's data</div>
      </button>
    )
  }

  return (
    <div className={styles.card} data-testid="fill-form-template-picker">
      <div className={styles.label}>CHOOSE A TEMPLATE</div>
      {templates === null && <p className={styles.empty}>Loading…</p>}
      {templates?.length === 0 && (
        <p className={styles.empty} data-testid="fill-form-no-templates">
          No templates imported yet. Import one from the Intake tab first.
        </p>
      )}
      {templates?.map((t) => (
        <button
          key={t.id}
          type="button"
          className={styles.templateRow}
          data-testid="fill-form-template-option"
          onClick={() => navigate(`/cases/${caseId}/templates/${t.id}/fill`)}
        >
          {t.name}
        </button>
      ))}
      <button type="button" className={styles.cancel} onClick={() => setOpen(false)} data-testid="fill-form-cancel">
        Cancel
      </button>
    </div>
  )
}
