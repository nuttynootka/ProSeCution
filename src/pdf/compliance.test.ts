import { readFileSync } from 'node:fs'
import fontkit from '@pdf-lib/fontkit'
import { PDFDocument, PDFName, StandardFonts } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import { checkCompliance, STAMP_ZONE_HEIGHT_PT } from './compliance'
import type { FieldMapping } from './types'

const FONT_BYTES = new Uint8Array(readFileSync('public/fonts/ibm-plex-mono-400.woff2'))

function findCheck(report: Awaited<ReturnType<typeof checkCompliance>>, id: string) {
  const check = report.checks.find((c) => c.id === id)
  if (!check) throw new Error(`no check with id ${id}`)
  return check
}

describe('checkCompliance', () => {
  it('passes not-encrypted and no-javascript for a plain generated PDF', async () => {
    const doc = await PDFDocument.create()
    doc.addPage([612, 792])
    const bytes = await doc.save()

    const report = await checkCompliance(bytes)

    expect(findCheck(report, 'not-encrypted').passed).toBe(true)
    expect(findCheck(report, 'no-javascript').passed).toBe(true)
  })

  it('flags a font embedded only by reference (StandardFonts) as not embedded', async () => {
    const doc = await PDFDocument.create()
    const font = await doc.embedFont(StandardFonts.Helvetica)
    const page = doc.addPage([612, 792])
    page.drawText('hello', { x: 50, y: 700, size: 12, font })
    const bytes = await doc.save()

    const report = await checkCompliance(bytes)

    const check = findCheck(report, 'fonts-embedded')
    expect(check.passed).toBe(false)
    expect(check.detail).toContain('Helvetica')
  })

  it('passes fonts-embedded for a real fontkit-embedded font — the one fillTemplate actually uses', async () => {
    const doc = await PDFDocument.create()
    doc.registerFontkit(fontkit)
    const font = await doc.embedFont(FONT_BYTES)
    const page = doc.addPage([612, 792])
    page.drawText('hello', { x: 50, y: 700, size: 12, font })
    const bytes = await doc.save()

    const report = await checkCompliance(bytes)

    expect(findCheck(report, 'fonts-embedded').passed).toBe(true)
  })

  it('detects an OpenAction as a form of embedded automation to flag', async () => {
    const doc = await PDFDocument.create()
    doc.addPage([612, 792])
    // Simulate a document with an /OpenAction — pdf-lib has no high-level API for
    // this, so it's set directly on the catalog, the same low-level mechanism a
    // real PDF authoring tool would use to add one.
    doc.catalog.set(PDFName.of('OpenAction'), doc.context.obj({ Type: PDFName.of('Action'), S: PDFName.of('JavaScript') }))
    const bytes = await doc.save()

    const report = await checkCompliance(bytes)

    expect(findCheck(report, 'no-javascript').passed).toBe(false)
  })

  it('fails the whole report when the input is not a valid PDF at all', async () => {
    const report = await checkCompliance(new Uint8Array([1, 2, 3, 4]))
    expect(report.allPassed).toBe(false)
  })

  it('passes the stamp-zone check when no page-1 field overlaps the reserved area', async () => {
    const doc = await PDFDocument.create()
    doc.addPage([612, 792])
    const bytes = await doc.save()
    const mappings: FieldMapping[] = [
      {
        id: 'm1',
        templateId: 't1',
        pageNum: 1,
        fields: [{ fieldId: 'f1', type: 'SINGLE_LINE', boundingBox: { left: 72, top: STAMP_ZONE_HEIGHT_PT + 10, width: 100, height: 14 } }],
        createdAt: 0,
        updatedAt: 0,
      },
    ]

    const report = await checkCompliance(bytes, mappings)

    expect(findCheck(report, 'stamp-zone-clear').passed).toBe(true)
  })

  it('fails the stamp-zone check when a page-1 field overlaps the reserved area', async () => {
    const doc = await PDFDocument.create()
    doc.addPage([612, 792])
    const bytes = await doc.save()
    const mappings: FieldMapping[] = [
      {
        id: 'm1',
        templateId: 't1',
        pageNum: 1,
        fields: [{ fieldId: 'f1', type: 'SINGLE_LINE', label: 'Header field', boundingBox: { left: 72, top: 20, width: 100, height: 14 } }],
        createdAt: 0,
        updatedAt: 0,
      },
    ]

    const report = await checkCompliance(bytes, mappings)

    const check = findCheck(report, 'stamp-zone-clear')
    expect(check.passed).toBe(false)
    expect(check.detail).toContain('Header field')
  })

  it('does not flag a field on page 2 for overlapping the page-1 stamp zone', async () => {
    const doc = await PDFDocument.create()
    doc.addPage([612, 792])
    doc.addPage([612, 792])
    const bytes = await doc.save()
    const mappings: FieldMapping[] = [
      {
        id: 'm1',
        templateId: 't1',
        pageNum: 2,
        fields: [{ fieldId: 'f1', type: 'SINGLE_LINE', boundingBox: { left: 72, top: 20, width: 100, height: 14 } }],
        createdAt: 0,
        updatedAt: 0,
      },
    ]

    const report = await checkCompliance(bytes, mappings)

    expect(findCheck(report, 'stamp-zone-clear').passed).toBe(true)
  })

  it('allPassed is true only when every check passes', async () => {
    const doc = await PDFDocument.create()
    doc.registerFontkit(fontkit)
    const font = await doc.embedFont(FONT_BYTES)
    const page = doc.addPage([612, 792])
    page.drawText('hello', { x: 50, y: 700, size: 12, font })
    const bytes = await doc.save()

    const report = await checkCompliance(bytes, [])

    expect(report.allPassed).toBe(true)
    expect(report.checks.every((c) => c.passed)).toBe(true)
  })
})
