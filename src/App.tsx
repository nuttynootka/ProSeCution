import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuroraBackground } from './components/AuroraBackground'
import { TabShellLayout } from './components/TabShellLayout'
import { START_PATH } from './nav/destinations'
import { PassphraseGate } from './vault/PassphraseGate'
import { CaseDashboardScreen } from './screens/CaseDashboardScreen'
import { CasesScreen } from './screens/CasesScreen'
import { CounselScreen } from './screens/CounselScreen'
import { DeadlinesScreen } from './screens/DeadlinesScreen'
import { IntakeScreen } from './screens/IntakeScreen'
import { VaultScreen } from './screens/VaultScreen'
import { NewCaseWizard } from './wizard/NewCaseWizard'

/**
 * HashRouter rather than BrowserRouter: GitHub Pages has no server-side rewrite, so
 * deep links under a real path 404 on refresh. Hashes sidestep that entirely, and the
 * URL is not visible once installed to the home screen.
 *
 * Two route families: the five tabs render inside TabShellLayout (persistent bottom
 * nav), while full-screen flows like the wizard render standalone — matching the
 * mockup, where starting a wizard replaces the entire screen, nav bar included.
 */
export function App() {
  return (
    <HashRouter>
      <PassphraseGate>
        <div className="app-shell">
          <AuroraBackground />
          <Routes>
            <Route element={<TabShellLayout />}>
              <Route path="/cases" element={<CasesScreen />} />
              <Route path="/cases/:caseId" element={<CaseDashboardScreen />} />
              <Route path="/deadlines" element={<DeadlinesScreen />} />
              <Route path="/intake" element={<IntakeScreen />} />
              <Route path="/counsel" element={<CounselScreen />} />
              <Route path="/vault" element={<VaultScreen />} />
            </Route>
            <Route path="/cases/new" element={<NewCaseWizard />} />
            <Route path="*" element={<Navigate to={START_PATH} replace />} />
          </Routes>
        </div>
      </PassphraseGate>
    </HashRouter>
  )
}
