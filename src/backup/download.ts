/** e.g. "plcm-backup-2026-08-19.plcmbackup" — dated so a user who exports more than once can tell them apart at a glance. */
export function backupFilename(): string {
  const date = new Date().toISOString().slice(0, 10)
  return `plcm-backup-${date}.plcmbackup`
}

/** Same download-trigger pattern as pdfFilename/triggerPdfDownload (Chunk 19) and icsFilename/triggerIcsDownload (Chunk 14) — not unit-testable in jsdom-less Vitest, verified against a real browser instead. */
export function triggerBackupDownload(filename: string, bytes: Uint8Array): void {
  const blob = new Blob([bytes.slice()], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}
