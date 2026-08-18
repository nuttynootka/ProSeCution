import { db, vault } from '../vault'
import { FieldMappingRepository } from './FieldMappingRepository'
import { PdfTemplateRepository } from './PdfTemplateRepository'

export { loadPdf } from './PdfService'
export type { PageSize, PdfDocumentHandle } from './PdfService'
export {
  boundingBoxToFractional,
  defaultFieldRect,
  fractionalToBoundingBox,
  moveCorner,
  translateRect,
} from './fieldMath'
export type { Corner, FractionalRect } from './fieldMath'
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
export { KNOWN_GLOBAL_KEYS, resolveGlobalKey } from './caseDataResolver'
export type { CaseData } from './caseDataResolver'
export { fillTemplate, wrapText } from './PdfFillService'
export type { FillFieldValues } from './PdfFillService'
export { pdfFilename, triggerPdfDownload } from './download'

/** App-wide repository instances, wired to the app's real database and vault. */
export const pdfTemplateRepository = new PdfTemplateRepository(db, vault)
export const fieldMappingRepository = new FieldMappingRepository(db, vault)
