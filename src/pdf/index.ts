import { db, vault } from '../vault'
import { FieldMappingRepository } from './FieldMappingRepository'
import { PdfTemplateRepository } from './PdfTemplateRepository'

export { loadPdf } from './PdfService'
export type { PageSize, PdfDocumentHandle, PdfTextItem } from './PdfService'
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
export { fillTemplate, loadFillFont, primeFontShaping, wrapText } from './PdfFillService'
export type { FillFieldValues, FillTemplateResult } from './PdfFillService'
export { layoutRuledLines } from './ruledLineEngine'
export type { RuledLineLayout, RuledLineLayoutOptions } from './ruledLineEngine'
export { pdfFilename, triggerPdfDownload } from './download'
export { checkCompliance, STAMP_ZONE_HEIGHT_PT } from './compliance'
export type { ComplianceCheck, ComplianceReport } from './compliance'

/** App-wide repository instances, wired to the app's real database and vault. */
export const pdfTemplateRepository = new PdfTemplateRepository(db, vault)
export const fieldMappingRepository = new FieldMappingRepository(db, vault)
