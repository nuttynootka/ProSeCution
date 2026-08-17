import { useState } from 'react'
import { GlassSurface } from '../../components/GlassSurface'

/**
 * A genuine stub, not a fake-functional one: the mockup's "topics" chips and
 * "import or scan documents" card have no consumer yet (document intake is Chunks
 * 7–11, topic-tagged retrieval is much later), so this doesn't pretend to save a
 * selection it would silently discard. Tapping the card says so, rather than doing
 * nothing or doing something invisible.
 */
export function TopicsStep() {
  const [tapped, setTapped] = useState(false)

  return (
    <GlassSurface style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ font: '600 13.5px/1.4 var(--plcm-font-sans)', color: 'var(--plcm-heading)' }}>
        Topics &amp; documents
      </div>
      <p style={{ margin: 0, font: '400 12.5px/1.55 var(--plcm-font-sans)', color: 'var(--plcm-text-dim)' }}>
        Optional — you'll be able to tag topics and scan or import documents once
        intake is built. For now, continue and add them later from the Intake tab.
      </p>
      <button
        type="button"
        onClick={() => setTapped(true)}
        data-testid="topics-scan-cta"
        style={{
          padding: 14,
          borderRadius: 'var(--plcm-radius-lg)',
          background: 'linear-gradient(160deg, rgba(124,58,237,.16), rgba(37,99,235,.08))',
          border: '1px dashed rgba(196,181,253,.35)',
          textAlign: 'left',
          color: 'var(--plcm-text-dim)',
          font: '500 12.5px/1.4 var(--plcm-font-sans)',
          cursor: 'pointer',
        }}
      >
        {tapped ? 'Document intake arrives in a later update.' : 'Import or scan documents'}
      </button>
    </GlassSurface>
  )
}
