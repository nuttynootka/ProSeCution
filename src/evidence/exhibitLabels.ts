/**
 * Auto-labels exhibits A, B, C, ... Z, AA, BB, CC, ... — the doubled-letter scheme
 * commonly used for exhibit lettering once a list runs past 26 (distinct from
 * spreadsheet-style AA, AB, AC..., a different convention used for column
 * addressing, not exhibit numbering). This is a common convention, not a
 * jurisdiction-verified requirement — the same honesty this app already applies to
 * certificateOfService.ts's format: a real local rule could specify something else,
 * and nothing here claims to be an official numbered form.
 */
export function exhibitLabel(index: number): string {
  if (index < 0) throw new RangeError('exhibitLabel index must be >= 0')
  const letter = String.fromCharCode(65 + (index % 26))
  const repeat = Math.floor(index / 26) + 1
  return letter.repeat(repeat)
}
