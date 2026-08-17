import type { InputHTMLAttributes } from 'react'
import styles from './Field.module.css'

export function SectionLabel({ children }: { children: string }) {
  return <div className={styles.sectionLabel}>{children}</div>
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={[styles.textInput, props.className].filter(Boolean).join(' ')} />
}
