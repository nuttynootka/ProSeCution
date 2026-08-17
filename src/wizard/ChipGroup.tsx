import styles from './ChipGroup.module.css'

interface ChipGroupProps {
  options: readonly { value: string; label: string }[]
  value: string | null
  onChange: (value: string) => void
  groupLabel: string
}

/** Single-select pill chips — state, case type, and anything else drawn from a bounded list use this. */
export function ChipGroup({ options, value, onChange, groupLabel }: ChipGroupProps) {
  return (
    <div className={styles.group} role="radiogroup" aria-label={groupLabel}>
      {options.map((option) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            className={selected ? `${styles.chip} ${styles.chipSelected}` : styles.chip}
            onClick={() => onChange(option.value)}
            data-testid={`chip-${groupLabel}-${option.value}`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
