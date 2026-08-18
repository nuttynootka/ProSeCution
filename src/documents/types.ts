import type { DocumentType } from '../ocr/categorize'

/**
 * Deliberately not the blueprint's full `documents` column list —
 * pii_redaction_report_uri, extracted_fields, is_opposition, etc. still have no
 * producer (redaction is Chunk 21, opposing-filing analysis is Chunk 44) and aren't
 * added speculatively. `ocrText`/`ocrConfidence`/`documentType` are new as of Chunk
 * 9's OCR pipeline — optional, since nothing in this chunk wires an automatic
 * trigger yet (Chunk 10's job), so every document has them absent until then.
 */
export interface DocumentContent {
  originalFilename: string
  mimeType: string
  sizeBytes: number
  ocrText?: string
  ocrConfidence?: number
  documentType?: DocumentType
}

export interface Document extends DocumentContent {
  id: string
  caseId: string
  createdAt: number
  updatedAt: number
}
