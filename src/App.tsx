import { lazy, Suspense } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuroraBackground } from './components/AuroraBackground'
import { TabShellLayout } from './components/TabShellLayout'
import { START_PATH } from './nav/destinations'
import { PassphraseGate } from './vault/PassphraseGate'

// Every screen below is route-only (never imported by the shell itself), so
// lazy-loading them here is what actually lets Rollup split this app's heaviest
// dependencies — pdf.js, pdf-lib/fontkit, Tesseract.js — out of the initial bundle:
// each only loads once a route that actually needs it is visited, rather than every
// visitor downloading, say, the OCR engine just to open the Cases list. Chunk 48's
// performance pass; PassphraseGate above stays eager since literally everything
// waits behind it regardless of route.
const CasesScreen = lazy(() => import('./screens/CasesScreen').then((m) => ({ default: m.CasesScreen })))
const CaseDashboardScreen = lazy(() => import('./screens/CaseDashboardScreen').then((m) => ({ default: m.CaseDashboardScreen })))
const DeadlinesScreen = lazy(() => import('./screens/DeadlinesScreen').then((m) => ({ default: m.DeadlinesScreen })))
const IntakeScreen = lazy(() => import('./screens/IntakeScreen').then((m) => ({ default: m.IntakeScreen })))
const CounselScreen = lazy(() => import('./screens/CounselScreen').then((m) => ({ default: m.CounselScreen })))
const VaultScreen = lazy(() => import('./screens/VaultScreen').then((m) => ({ default: m.VaultScreen })))
const NewCaseWizard = lazy(() => import('./wizard/NewCaseWizard').then((m) => ({ default: m.NewCaseWizard })))
const CaptureScreen = lazy(() => import('./intake/CaptureScreen').then((m) => ({ default: m.CaptureScreen })))
const DocumentsScreen = lazy(() => import('./screens/DocumentsScreen').then((m) => ({ default: m.DocumentsScreen })))
const ExhibitListScreen = lazy(() => import('./screens/ExhibitListScreen').then((m) => ({ default: m.ExhibitListScreen })))
const DocumentReviewScreen = lazy(() => import('./screens/DocumentReviewScreen').then((m) => ({ default: m.DocumentReviewScreen })))
const DocumentDetailScreen = lazy(() => import('./screens/DocumentDetailScreen').then((m) => ({ default: m.DocumentDetailScreen })))
const TemplateStudioScreen = lazy(() => import('./screens/TemplateStudioScreen').then((m) => ({ default: m.TemplateStudioScreen })))
const FillFormScreen = lazy(() => import('./screens/FillFormScreen').then((m) => ({ default: m.FillFormScreen })))

/**
 * HashRouter rather than BrowserRouter: GitHub Pages has no server-side rewrite, so
 * deep links under a real path 404 on refresh. Hashes sidestep that entirely, and the
 * URL is not visible once installed to the home screen.
 *
 * Two route families: the five tabs render inside TabShellLayout (persistent bottom
 * nav), while full-screen flows like the wizard render standalone — matching the
 * mockup, where starting a wizard replaces the entire screen, nav bar included.
 *
 * `fallback={null}` rather than a spinner: every screen in this app already renders
 * nothing during its own async load (`if (phase === 'loading') return null`, the
 * established pattern since Chunk 6) — a lazy-chunk fetch is just one more reason a
 * screen briefly renders nothing, not a new loading state design needs to account for.
 */
export function App() {
  return (
    <HashRouter>
      <PassphraseGate>
        <div className="app-shell">
          <AuroraBackground />
          <Suspense fallback={null}>
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
              <Route path="/cases/:caseId/intake" element={<CaptureScreen />} />
              <Route path="/cases/:caseId/documents" element={<DocumentsScreen />} />
              <Route path="/cases/:caseId/exhibits" element={<ExhibitListScreen />} />
              <Route path="/cases/:caseId/documents/:documentId/review" element={<DocumentReviewScreen />} />
              <Route path="/cases/:caseId/documents/:documentId" element={<DocumentDetailScreen />} />
              <Route path="/templates/:templateId" element={<TemplateStudioScreen />} />
              <Route path="/cases/:caseId/templates/:templateId/fill" element={<FillFormScreen />} />
              <Route path="*" element={<Navigate to={START_PATH} replace />} />
            </Routes>
          </Suspense>
        </div>
      </PassphraseGate>
    </HashRouter>
  )
}
