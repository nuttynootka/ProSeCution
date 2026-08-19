import { GlassSurface } from '../../components/GlassSurface'

/**
 * Document intake is fully built (Chunks 7–11), but it is case-scoped and this step
 * runs *before* the case exists — there is no case id to attach a scan to yet. So
 * this stays informational rather than offering an import button that couldn't
 * actually file anything anywhere. The copy points at the real path instead: create
 * the case, then scan or import from its own dashboard.
 *
 * (Until this chunk it still said intake "arrives in a later update", left over from
 * Chunk 5 when that was true — a stale claim the app kept making about a feature it
 * had since shipped.)
 */
export function TopicsStep() {
  return (
    <GlassSurface style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }} data-testid="topics-step">
      <div style={{ font: '600 13.5px/1.4 var(--plcm-font-sans)', color: 'var(--plcm-heading)' }}>
        Topics &amp; documents
      </div>
      <p
        style={{ margin: 0, font: '400 12.5px/1.55 var(--plcm-font-sans)', color: 'var(--plcm-text-dim)' }}
        data-testid="topics-intake-note"
      >
        Nothing to fill in here. Once you finish creating this case, you can scan or import documents from the case's
        own screen — they'll be OCR'd, checked for sensitive information, and added to its timeline automatically.
      </p>
    </GlassSurface>
  )
}
