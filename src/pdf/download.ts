/** Sanitized to the conservative subset every filesystem accepts — same convention as `deadlines/ics.ts`'s icsFilename, kept separate here rather than shared so the pdf module doesn't depend on the deadlines module for an unrelated string-formatting detail. */
export function pdfFilename(label: string): string {
  const safe = label.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'document'
  return `${safe}.pdf`
}

/** Triggers a real browser download of the given PDF bytes. Not unit-testable in jsdom-less Vitest — verified against a real browser instead, the same as `triggerIcsDownload` (Chunk 14). */
export function triggerPdfDownload(filename: string, bytes: Uint8Array): void {
  const blob = new Blob([bytes.slice()], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}
