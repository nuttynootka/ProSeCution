import { db, vault } from '../vault'
import { FieldMappingRepository } from './FieldMappingRepository'
import { PdfTemplateRepository } from './PdfTemplateRepository'

export { loadPdf } from './PdfService'
export type { PdfDocumentHandle } from './PdfService'
export { PdfTemplateRepository } from './PdfTemplateRepository'
export { FieldMappingRepository } from './FieldMappingRepository'
export type {
  BoundingBox,
  FieldMapping,
  FieldMappingContent,
  FieldType,
  MultiLineRuledField,
  PdfTemplate,
  PdfTemplateContent,
  SingleLineField,
  TemplateField,
} from './types'

/** App-wide repository instances, wired to the app's real database and vault. */
export const pdfTemplateRepository = new PdfTemplateRepository(db, vault)
export const fieldMappingRepository = new FieldMappingRepository(db, vault)
