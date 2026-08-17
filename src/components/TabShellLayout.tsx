import { Outlet } from 'react-router-dom'
import { BottomNav } from './BottomNav'

/** Layout for the five tab destinations. Full-screen routes (the wizard) render outside this, with no bottom nav. */
export function TabShellLayout() {
  return (
    <>
      <main className="app-shell__content">
        <Outlet />
      </main>
      <BottomNav />
    </>
  )
}
