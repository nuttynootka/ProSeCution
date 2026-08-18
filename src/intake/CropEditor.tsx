import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { cropRectToPixels, FULL_IMAGE_CROP, isFullImage, moveCorner, type Corner, type CropRect } from './cropMath'
import styles from './CropEditor.module.css'

interface CropEditorProps {
  imageBlob: Blob
  onConfirm: (croppedBlob: Blob) => void
  onCancel: () => void
}

const CORNERS: Corner[] = ['topLeft', 'topRight', 'bottomLeft', 'bottomRight']

export function CropEditor({ imageBlob, onConfirm, onCancel }: CropEditorProps) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  const [rect, setRect] = useState<CropRect>(FULL_IMAGE_CROP)
  const imgRef = useRef<HTMLImageElement>(null)
  const draggingCorner = useRef<Corner | null>(null)

  useEffect(() => {
    const url = URL.createObjectURL(imageBlob)
    setObjectUrl(url)
    setRect(FULL_IMAGE_CROP)
    return () => URL.revokeObjectURL(url)
  }, [imageBlob])

  const fractionFromPointer = (e: { clientX: number; clientY: number }) => {
    const bounds = imgRef.current?.getBoundingClientRect()
    if (!bounds) return { x: 0, y: 0 }
    return {
      x: (e.clientX - bounds.left) / bounds.width,
      y: (e.clientY - bounds.top) / bounds.height,
    }
  }

  const handlePointerDown = (corner: Corner) => (e: ReactPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    draggingCorner.current = corner
  }

  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const corner = draggingCorner.current
    if (!corner) return
    const { x, y } = fractionFromPointer(e)
    setRect((prev) => moveCorner(prev, corner, x, y))
  }

  const handlePointerUp = () => {
    draggingCorner.current = null
  }

  const handleConfirm = async () => {
    const img = imgRef.current
    if (!img) return

    if (isFullImage(rect)) {
      onConfirm(imageBlob)
      return
    }

    const { sx, sy, sw, sh } = cropRectToPixels(rect, img.naturalWidth, img.naturalHeight)
    const canvas = document.createElement('canvas')
    canvas.width = sw
    canvas.height = sh
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh)
    canvas.toBlob((blob) => {
      if (blob) onConfirm(blob)
    }, 'image/jpeg', 0.92)
  }

  if (!objectUrl) return null

  return (
    <div className={styles.root} data-testid="crop-editor">
      <div className={styles.stage}>
        <div className={styles.imageWrap}>
          <img
            ref={imgRef}
            src={objectUrl}
            alt=""
            className={styles.image}
            draggable={false}
            data-testid="crop-image"
          />
          <div
            className={styles.overlay}
            style={{
              left: `${rect.left * 100}%`,
              top: `${rect.top * 100}%`,
              right: `${(1 - rect.right) * 100}%`,
              bottom: `${(1 - rect.bottom) * 100}%`,
            }}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          >
            {CORNERS.map((corner) => (
              <div
                key={corner}
                className={`${styles.handle} ${styles[`handle_${corner}`]}`}
                onPointerDown={handlePointerDown(corner)}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                data-testid={`crop-handle-${corner}`}
              />
            ))}
          </div>
        </div>
      </div>

      <div className={styles.footer}>
        <button type="button" className={styles.secondaryButton} onClick={onCancel} data-testid="crop-cancel">
          Cancel
        </button>
        <button type="button" className={styles.primaryButton} onClick={handleConfirm} data-testid="crop-confirm">
          {isFullImage(rect) ? 'Use full image' : 'Crop & continue'}
        </button>
      </div>
    </div>
  )
}
