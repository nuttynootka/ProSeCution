import type { ButtonHTMLAttributes } from 'react'
import styles from './PrimaryButton.module.css'

interface PrimaryButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary'
}

export function PrimaryButton({ variant = 'primary', className, ...rest }: PrimaryButtonProps) {
  const base = variant === 'primary' ? styles.button : styles.secondary
  return <button type="button" className={[base, className].filter(Boolean).join(' ')} {...rest} />
}
