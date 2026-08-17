import type { HTMLAttributes, ReactNode } from 'react'
import styles from './GlassSurface.module.css'

interface GlassSurfaceProps extends HTMLAttributes<HTMLDivElement> {
  /** `accent` is the brighter purple/blue-tinted fill used for emphasized cards. */
  variant?: 'default' | 'accent'
  children: ReactNode
}

/**
 * The frosted-glass plate every card in the mockup is built from: a soft gradient
 * fill, hairline border, inset top highlight, and backdrop blur.
 *
 * `backdrop-filter` isn't supported pre-Chrome 76 / pre-iOS 15 — both long past
 * relevant for an Android-only app, but the fallback rule still costs nothing, so
 * it's left in rather than assumed away.
 */
export function GlassSurface({
  variant = 'default',
  className,
  children,
  ...rest
}: GlassSurfaceProps) {
  const variantClass = variant === 'accent' ? styles.accent : styles.default
  const classes = [styles.surface, variantClass, className].filter(Boolean).join(' ')

  return (
    <div className={classes} {...rest}>
      {children}
    </div>
  )
}
