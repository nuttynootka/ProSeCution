import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { BottomNav } from './components/BottomNav'
import { START_PATH } from './nav/destinations'
import { CasesScreen } from './screens/CasesScreen'
import { CounselScreen } from './screens/CounselScreen'
import { DeadlinesScreen } from './screens/DeadlinesScreen'
import { IntakeScreen } from './screens/IntakeScreen'
import { VaultScreen } from './screens/VaultScreen'

/**
 * HashRouter rather than BrowserRouter: GitHub Pages has no server-side rewrite, so
 * deep links under a real path 404 on refresh. Hashes sidestep that entirely, and the
 * URL is not visible once the app is installed to the home screen.
 */
export function App() {
  return (
    <HashRouter>
      <div className="app-shell">
        <main className="app-shell__content">
          <Routes>
            <Route path="/cases" element={<CasesScreen />} />
            <Route path="/deadlines" element={<DeadlinesScreen />} />
            <Route path="/intake" element={<IntakeScreen />} />
            <Route path="/counsel" element={<CounselScreen />} />
            <Route path="/vault" element={<VaultScreen />} />
            <Route path="*" element={<Navigate to={START_PATH} replace />} />
          </Routes>
        </main>
        <BottomNav />
      </div>
    </HashRouter>
  )
}
