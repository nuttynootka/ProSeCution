import { NavLink } from 'react-router-dom'
import { DESTINATIONS } from '../nav/destinations'

/**
 * Bottom navigation.
 *
 * Structural only for now — Chunk 2 turns each item into a floating frosted-glass
 * plate and adds the shifting violet-blue glow behind the active one.
 */
export function BottomNav() {
  return (
    <nav className="bottom-nav" aria-label="Primary">
      {DESTINATIONS.map((destination) => (
        <NavLink
          key={destination.path}
          to={destination.path}
          className={({ isActive }) =>
            isActive ? 'bottom-nav__item bottom-nav__item--active' : 'bottom-nav__item'
          }
          data-testid={`nav-${destination.label.toLowerCase()}`}
        >
          <svg
            className="bottom-nav__icon"
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
          <span className="bottom-nav__label">{destination.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
