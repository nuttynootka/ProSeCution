import type { ReactNode } from 'react'

/**
 * The five top-level destinations, in bottom-bar order.
 *
 * Icon geometry is lifted from the mockup's own nav bar so the shapes are already
 * correct; Chunk 2 adds the frosted plates and active-tab glow around them.
 */
export interface Destination {
  readonly path: string
  readonly label: string
  readonly testId: string
  /** Rendered inside a 20x20 viewBox, stroked with currentColor. */
  readonly icon: ReactNode
}

export const DESTINATIONS: readonly Destination[] = [
  {
    path: '/cases',
    label: 'Cases',
    testId: 'screen-cases',
    icon: (
      <>
        <rect x="2.5" y="4.5" width="15" height="12" rx="2.5" />
        <line x1="2.5" y1="8.5" x2="17.5" y2="8.5" />
      </>
    ),
  },
  {
    path: '/deadlines',
    label: 'Deadlines',
    testId: 'screen-deadlines',
    icon: (
      <>
        <circle cx="10" cy="10" r="7.2" />
        <line x1="10" y1="6" x2="10" y2="10.4" strokeLinecap="round" />
        <line x1="10" y1="10.4" x2="13" y2="12" strokeLinecap="round" />
      </>
    ),
  },
  {
    path: '/intake',
    label: 'Intake',
    testId: 'screen-intake',
    icon: (
      <>
        <path
          d="M3 7V4.5A1.5 1.5 0 0 1 4.5 3H7M13 3h2.5A1.5 1.5 0 0 1 17 4.5V7M17 13v2.5a1.5 1.5 0 0 1-1.5 1.5H13M7 17H4.5A1.5 1.5 0 0 1 3 15.5V13"
          strokeLinecap="round"
        />
        <line x1="3" y1="10" x2="17" y2="10" strokeLinecap="round" />
      </>
    ),
  },
  {
    path: '/counsel',
    label: 'Counsel',
    testId: 'screen-counsel',
    icon: (
      <>
        <circle cx="7.6" cy="10" r="4.6" />
        <circle cx="12.4" cy="10" r="4.6" />
      </>
    ),
  },
  {
    path: '/vault',
    label: 'Vault',
    testId: 'screen-vault',
    icon: (
      <>
        <rect x="3" y="3" width="14" height="14" rx="3.5" />
        <circle cx="10" cy="10" r="3" />
      </>
    ),
  },
]

export const START_PATH = DESTINATIONS[0].path
