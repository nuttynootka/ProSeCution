import { useEffect, useRef, useState } from 'react'
import styles from './CameraCapture.module.css'

interface CameraCaptureProps {
  onCapture: (blob: Blob) => void
  onCancel: () => void
}

type Status = 'starting' | 'ready' | 'denied' | 'unsupported'

/**
 * A live rear-camera feed with a shutter button. Kept deliberately simple — no
 * flash control, no zoom, no auto-capture-on-edge-detection (that belongs to the
 * automatic edge/perspective detection this chunk explicitly doesn't build).
 */
export function CameraCapture({ onCapture, onCancel }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [status, setStatus] = useState<Status>('starting')

  useEffect(() => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('unsupported')
      return
    }

    let cancelled = false
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' } })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        streamRef.current = stream
        const video = videoRef.current
        if (!video) return
        video.srcObject = stream

        // 'ready' only once the video element has actually decoded a frame — the
        // getUserMedia promise resolving doesn't guarantee that yet. Capturing
        // before it happens reads videoWidth/videoHeight as 0, producing a 0×0
        // canvas whose toBlob() silently returns null and drops the capture.
        const markReady = () => {
          if (!cancelled) setStatus('ready')
        }
        if (video.readyState >= HTMLMediaElement.HAVE_METADATA && video.videoWidth > 0) {
          markReady()
        } else {
          video.addEventListener('loadedmetadata', markReady, { once: true })
        }
      })
      .catch(() => setStatus('denied'))

    return () => {
      cancelled = true
      // Releasing every track here is the whole point of this cleanup — an
      // abandoned stream keeps the camera indicator on and the camera unusable
      // elsewhere until the tab is closed.
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
  }, [])

  const handleCapture = () => {
    const video = videoRef.current
    if (!video) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0)
    canvas.toBlob((blob) => {
      if (blob) onCapture(blob)
    }, 'image/jpeg', 0.92)
  }

  if (status === 'unsupported' || status === 'denied') {
    return (
      <div className={styles.fallback} data-testid="camera-fallback">
        <p className={styles.fallbackText}>
          {status === 'unsupported'
            ? "This browser doesn't support camera capture."
            : 'Camera access was denied. You can still import a file instead.'}
        </p>
        <button type="button" className={styles.fallbackButton} onClick={onCancel}>
          Back
        </button>
      </div>
    )
  }

  return (
    <div className={styles.root} data-testid="camera-capture">
      <video ref={videoRef} autoPlay playsInline muted className={styles.video} />
      <div className={styles.controls}>
        <button type="button" className={styles.cancel} onClick={onCancel} aria-label="Cancel">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
        <button
          type="button"
          className={styles.shutter}
          onClick={handleCapture}
          disabled={status !== 'ready'}
          aria-label="Capture photo"
          data-testid="camera-shutter"
        />
        <div className={styles.controlsSpacer} />
      </div>
    </div>
  )
}
