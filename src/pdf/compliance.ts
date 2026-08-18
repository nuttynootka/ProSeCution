import { PDFArray, PDFDict, PDFDocument, PDFName } from 'pdf-lib'
import type { FieldMapping } from './types'

export interface ComplianceCheck {
  id: string
  label: string
  passed: boolean
  detail: string
}

export interface ComplianceReport {
  checks: ComplianceCheck[]
  allPassed: boolean
}

/**
 * 2 inches (144pt) at the top of page 1 — the space many e-filing systems reserve
 * for the court clerk's electronic filing stamp. Not a standard every court
 * publishes the same way; this is a common, conservative convention, not a value
 * pulled from any specific court's actual e-filing rules (this app has no per-court
 * rule data — see the deadline engine's Chunk 12 seeded-jurisdictions comment for
 * the same honesty pattern about narrow, real coverage over a plausible guess).
 */
export const STAMP_ZONE_HEIGHT_PT = 144

/**
 * A real but deliberately partial compliance check — not ISO 19005 (PDF/A)
 * conformance validation, which requires XMP metadata conformance levels, embedded
 * ICC color profiles, and dozens of structural rules no single small function can
 * responsibly claim to verify. This checks the handful of things most likely to get
 * an e-filed document bounced that pdf-lib can actually inspect with confidence:
 * encryption, embedded JavaScript, whether every font used is embedded (not just
 * referenced by name), and whether page 1's stamp area is clear. Presenting this as
 * "PDF/A compliant: yes/no" would be a claim this code can't back up; presenting it
 * as this specific checklist is what it can.
 */
export async function checkCompliance(pdfBytes: Uint8Array, mappings: FieldMapping[] = []): Promise<ComplianceReport> {
  let pdfDoc: PDFDocument
  try {
    pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true })
  } catch {
    return {
      checks: [{ id: 'loadable', label: 'File is a valid PDF', passed: false, detail: 'Could not parse this file as a PDF.' }],
      allPassed: false,
    }
  }

  const checks: ComplianceCheck[] = [
    {
      id: 'not-encrypted',
      label: 'Not encrypted',
      passed: !pdfDoc.isEncrypted,
      detail: pdfDoc.isEncrypted
        ? 'This PDF is password-protected or encrypted — most e-filing systems reject encrypted files.'
        : 'No encryption detected.',
    },
    fontsEmbeddedCheck(pdfDoc),
    javaScriptCheck(pdfDoc),
    stampZoneCheck(mappings),
  ]

  return { checks, allPassed: checks.every((c) => c.passed) }
}

function fontsEmbeddedCheck(pdfDoc: PDFDocument): ComplianceCheck {
  const nonEmbedded = new Set<string>()

  for (const page of pdfDoc.getPages()) {
    const fontDict = page.node.Resources()?.lookupMaybe(PDFName.of('Font'), PDFDict)
    if (!fontDict) continue

    for (const key of fontDict.keys()) {
      const fontRef = fontDict.get(key)
      if (!fontRef) continue
      const fontObj = pdfDoc.context.lookup(fontRef, PDFDict)
      if (isFontEmbedded(pdfDoc, fontObj)) continue
      const baseFont = fontObj.get(PDFName.of('BaseFont'))
      nonEmbedded.add(baseFont ? baseFont.toString() : key.toString())
    }
  }

  const allEmbedded = nonEmbedded.size === 0
  return {
    id: 'fonts-embedded',
    label: 'All fonts embedded',
    passed: allEmbedded,
    detail: allEmbedded
      ? 'Every font used in the document is embedded.'
      : `Not embedded: ${[...nonEmbedded].join(', ')} — text may not display correctly on a device that lacks these fonts.`,
  }
}

/** A font is embedded if its own FontDescriptor has a FontFile/FontFile2/FontFile3 — for a simple font that's the top-level dict; for a Type0 composite font (what fontkit-embedded TrueType/OpenType fonts become, see PdfFillService), it's nested one level down in DescendantFonts[0]. */
function isFontEmbedded(pdfDoc: PDFDocument, fontObj: PDFDict): boolean {
  const descendantsRef = fontObj.get(PDFName.of('DescendantFonts'))
  const target = descendantsRef
    ? pdfDoc.context.lookup(pdfDoc.context.lookup(descendantsRef, PDFArray).get(0), PDFDict)
    : fontObj

  const descriptorRef = target.get(PDFName.of('FontDescriptor'))
  if (!descriptorRef) return false
  const descriptor = pdfDoc.context.lookup(descriptorRef, PDFDict)

  return (
    descriptor.get(PDFName.of('FontFile')) !== undefined ||
    descriptor.get(PDFName.of('FontFile2')) !== undefined ||
    descriptor.get(PDFName.of('FontFile3')) !== undefined
  )
}

function javaScriptCheck(pdfDoc: PDFDocument): ComplianceCheck {
  const names = pdfDoc.catalog.get(PDFName.of('Names'))
  const hasJavaScript = names !== undefined && pdfDoc.context.lookup(names, PDFDict).get(PDFName.of('JavaScript')) !== undefined
  const hasOpenAction = pdfDoc.catalog.get(PDFName.of('OpenAction')) !== undefined

  const found = hasJavaScript || hasOpenAction
  return {
    id: 'no-javascript',
    label: 'No embedded JavaScript or open actions',
    passed: !found,
    detail: found
      ? 'This PDF contains embedded JavaScript or an automatic open action — e-filing systems commonly reject these.'
      : 'No embedded JavaScript or open actions found.',
  }
}

function stampZoneCheck(mappings: FieldMapping[]): ComplianceCheck {
  const page1 = mappings.find((m) => m.pageNum === 1)
  const overlapping = (page1?.fields ?? []).filter((f) => f.boundingBox.top < STAMP_ZONE_HEIGHT_PT).map((f) => f.label || f.fieldId)

  const clear = overlapping.length === 0
  return {
    id: 'stamp-zone-clear',
    label: `Top ${STAMP_ZONE_HEIGHT_PT / 72}" of page 1 kept clear for the court's filing stamp`,
    passed: clear,
    detail: clear
      ? 'No mapped field overlaps the reserved stamp area.'
      : `Overlaps the stamp area: ${overlapping.join(', ')}.`,
  }
}
