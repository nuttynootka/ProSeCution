/**
 * Just enough to store and retrieve a file. Deliberately not the blueprint's full
 * `documents` column list (document_type, ocr_text, ocr_confidence,
 * pii_redaction_report_uri, extracted_fields, is_opposition, ...) — those belong to
 * the chunks that actually produce them: OCR (Chunk 9), redaction (Chunk 21),
 * opposing-filing analysis (Chunk 44). Adding an encrypted-blob field with no
 * producer or consumer yet would be exactly the speculative scope this project has
 * been avoiding since Chunk 4.
 */
export interface DocumentContent {
  originalFilename: string
  mimeType: string
  sizeBytes: number
}

export interface Document extends DocumentContent {
  id: string
  caseId: string
  createdAt: number
  updatedAt: number
}
