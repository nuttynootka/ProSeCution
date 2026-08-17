import { GlassSurface } from '../../components/GlassSurface'
import { US_STATES } from '../constants'
import { ChipGroup } from '../ChipGroup'
import { SectionLabel, TextInput } from '../Field'

const STATE_OPTIONS = US_STATES.map((s) => ({ value: s.code, label: s.code }))

interface JurisdictionStepProps {
  state: string | null
  county: string
  onStateChange: (state: string) => void
  onCountyChange: (county: string) => void
}

export function JurisdictionStep({ state, county, onStateChange, onCountyChange }: JurisdictionStepProps) {
  return (
    <GlassSurface style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <SectionLabel>State</SectionLabel>
      <ChipGroup groupLabel="state" options={STATE_OPTIONS} value={state} onChange={onStateChange} />

      <SectionLabel>County</SectionLabel>
      <TextInput
        value={county}
        onChange={(e) => onCountyChange(e.target.value)}
        placeholder="e.g. Los Angeles"
        data-testid="county-input"
      />
    </GlassSurface>
  )
}
