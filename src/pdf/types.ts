export interface PdfTemplateContent {
  name: string
  formType?: string
  category?: string
  /** Set from the real page count pdf.js reports when the template is imported — not user-entered. */
  pageCount: number
}

export interface PdfTemplate extends PdfTemplateContent {
  id: string
  createdAt: number
  updatedAt: number
}

export type FieldType = 'SINGLE_LINE' | 'MULTI_LINE_RULED'

/**
 * Coordinates are in unscaled PDF page points (pdf.js's own viewport units at
 * scale 1), not rendered pixels — Template Studio (Chunk 18) converts to/from
 * screen pixels using whatever scale it's rendering at.
 *
 * `top` is distance from the *top* of the page, same as pdf.js's own rendered
 * viewport and every other screen coordinate in this app — NOT PDF's native
 * coordinate system, which measures from the bottom-left with Y increasing
 * upward. Chunk 19's AcroForm autofill (via pdf-lib, which does use PDF-native
 * coordinates) is responsible for that one flip: `pdfY = pageHeight - top - height`.
 * Doing the flip there, once, at the one place it's actually needed, is simpler than
 * carrying an unusual bottom-up convention through every tap coordinate here.
 */
export interface BoundingBox {
  left: number
  top: number
  width: number
  height: number
}

interface FieldBase {
  fieldId: string
  boundingBox: BoundingBox
  label?: string
  /** A suggested key into the case-data field vocabulary (e.g. "plaintiff.name") — a suggestion for the mapping UI to pre-fill, not a binding contract; Chunk 19's autofill still needs an explicit mapping to actually use a field. */
  suggestedGlobalKey?: string
}

export interface SingleLineField extends FieldBase {
  type: 'SINGLE_LINE'
}

/** Matches the blueprint's ruled-line paragraph engine (Chunk 45) input shape — a multi-line field on a physical form has ruled baselines, not a free rectangle, and needs this extra geometry to wrap text onto them correctly. */
export interface MultiLineRuledField extends FieldBase {
  type: 'MULTI_LINE_RULED'
  baselineYOffset: number
  lineHeight: number
  maxLines: number
}

export type TemplateField = SingleLineField | MultiLineRuledField

export interface FieldMappingContent {
  pageNum: number
  fields: TemplateField[]
}

export interface FieldMapping extends FieldMappingContent {
  id: string
  templateId: string
  createdAt: number
  updatedAt: number
}
