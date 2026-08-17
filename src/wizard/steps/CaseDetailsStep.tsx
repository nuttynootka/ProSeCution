import { GlassSurface } from '../../components/GlassSurface'
import { CASE_TYPES } from '../constants'
import { ChipGroup } from '../ChipGroup'
import { SectionLabel, TextInput } from '../Field'

const CASE_TYPE_OPTIONS = CASE_TYPES.map((t) => ({ value: t, label: t }))

interface CaseDetailsStepProps {
  caseType: string | null
  plaintiffName: string
  defendantName: string
  onCaseTypeChange: (caseType: string) => void
  onPlaintiffNameChange: (name: string) => void
  onDefendantNameChange: (name: string) => void
}

export function CaseDetailsStep({
  caseType,
  plaintiffName,
  defendantName,
  onCaseTypeChange,
  onPlaintiffNameChange,
  onDefendantNameChange,
}: CaseDetailsStepProps) {
  return (
    <>
      <GlassSurface style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <SectionLabel>Case type</SectionLabel>
        <ChipGroup
          groupLabel="case-type"
          options={CASE_TYPE_OPTIONS}
          value={caseType}
          onChange={onCaseTypeChange}
        />
      </GlassSurface>

      <GlassSurface style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <SectionLabel>Parties</SectionLabel>
        <TextInput
          value={plaintiffName}
          onChange={(e) => onPlaintiffNameChange(e.target.value)}
          placeholder="Plaintiff — full name"
          data-testid="plaintiff-name-input"
        />
        <TextInput
          value={defendantName}
          onChange={(e) => onDefendantNameChange(e.target.value)}
          placeholder="Defendant — full name"
          data-testid="defendant-name-input"
        />
      </GlassSurface>
    </>
  )
}
