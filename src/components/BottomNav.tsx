import { NavLink } from 'react-router-dom'
import { DESTINATIONS } from '../nav/destinations'
import styles from './BottomNav.module.css'

/**
 * Bottom navigation: floating neomorphic frosted-glass plates, with the active tab
 * glowing from behind in a slowly shifting blue-to-purple hue — per the design
 * chat's explicit direction (chats/chat1.md).
 */
export function BottomNav() {
  return (
    <nav className={styles.nav} aria-label="Primary">
      {DESTINATIONS.map((destination) => (
        <div key={destination.path} className={styles.slot}>
          <NavLink
            to={destination.path}
            className={({ isActive }) =>
              isActive ? `${styles.item} ${styles.itemActive}` : styles.item
            }
            data-testid={`nav-${destination.label.toLowerCase()}`}
          >
            {({ isActive }) => (
              <>
                {isActive && <span className={styles.glow} aria-hidden="true" />}
                <svg
                  className={styles.icon}
                  width="20"
                  height="20"
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  aria-hidden="true"
                >
                  {destination.icon}
                </svg>
                <span className={styles.label}>{destination.label}</span>
              </>
            )}
          </NavLink>
        </div>
      ))}
    </nav>
  )
}
