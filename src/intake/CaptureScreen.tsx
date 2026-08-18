import { useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { documentRepository } from '../documents'
import { CameraCapture } from './CameraCapture'
import { CropEditor } from './CropEditor'
import styles from './CaptureScreen.module.css'

type CaptureMode =
  | { step: 'choose' }
  | { step: 'camera' }
  | { step: 'crop'; blob: Blob; filename: string }
  | { step: 'saving' }
  | { step: 'error'; message: string }

export function CaptureScreen() {
  const { caseId } = useParams<{ caseId: string }>()
  const navigate = useNavigate()
  const [mode, setMode] = useState<CaptureMode>({ step: 'choose' })
  const fileInputRef = useRef<HTMLInputElement>(null)

  const goBackToCase = () => navigate(`/cases/${caseId}`)

  const save = async (blob: Blob, filename: string) => {
    if (!caseId) return
    setMode({ step: 'saving' })
    try {
      await documentRepository.create(caseId, blob, filename)
      goBackToCase()
    } catch {
      setMode({ step: 'error', message: 'Could not save the document. Please try again.' })
    }
  }

  const handleFileChosen = (file: File) => {
    if (file.type.startsWith('image/')) {
      setMode({ step: 'crop', blob: file, filename: file.name })
    } else {
      void save(file, file.name)
    }
  }

  const handleCameraCapture = (blob: Blob) => {
    setMode({ step: 'crop', blob, filename: `scan-${Date.now()}.jpg` })
  }

  if (mode.step === 'camera') {
    return <CameraCapture onCapture={handleCameraCapture} onCancel={() => setMode({ step: 'choose' })} />
  }

  if (mode.step === 'crop') {
    return (
      <CropEditor
        imageBlob={mode.blob}
        onConfirm={(croppedBlob) => void save(croppedBlob, mode.filename)}
        onCancel={() => setMode({ step: 'choose' })}
      />
    )
  }

  return (
    <div className={styles.root} data-testid="capture-screen">
      <div className={styles.header}>
        <button type="button" className={styles.back} onClick={goBackToCase} aria-label="Back to case" data-testid="capture-back">
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
          <div className={styles.kicker}>ADD DOCUMENT</div>
          <div className={styles.title}>Scan or import</div>
        </div>
      </div>

      <div className={styles.body}>
        {mode.step === 'error' && (
          <div className={styles.errorBanner} role="alert" data-testid="capture-error">
            {mode.message}
          </div>
        )}
        {mode.step === 'saving' && (
          <div className={styles.saving} data-testid="capture-saving">
            Saving…
          </div>
        )}

        <button
          type="button"
          className={styles.option}
          onClick={() => setMode({ step: 'camera' })}
          disabled={mode.step === 'saving'}
          data-testid="option-camera"
        >
          <div className={styles.optionIcon}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path
                d="M3 7V4.5A1.5 1.5 0 0 1 4.5 3H7M13 3h2.5A1.5 1.5 0 0 1 17 4.5V7M17 13v2.5a1.5 1.5 0 0 1-1.5 1.5H13M7 17H4.5A1.5 1.5 0 0 1 3 15.5V13"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
              <circle cx="10" cy="10" r="3" stroke="currentColor" strokeWidth="1.6" />
            </svg>
          </div>
          <div>
            <div className={styles.optionTitle}>Take a photo</div>
            <div className={styles.optionNote}>Scan a physical document with your camera</div>
          </div>
        </button>

        <button
          type="button"
          className={styles.option}
          onClick={() => fileInputRef.current?.click()}
          disabled={mode.step === 'saving'}
          data-testid="option-file"
        >
          <div className={styles.optionIcon}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M4 2.5h8l4 4v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-14a1 1 0 0 1 1-1Z" stroke="currentColor" strokeWidth="1.6" />
              <path d="M12 2.5V7h4" stroke="currentColor" strokeWidth="1.6" />
            </svg>
          </div>
          <div>
            <div className={styles.optionTitle}>Choose a file</div>
            <div className={styles.optionNote}>Import a photo or PDF already on your device</div>
          </div>
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,application/pdf"
          className={styles.hiddenInput}
          data-testid="file-input"
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) handleFileChosen(file)
          }}
        />
      </div>
    </div>
  )
}
