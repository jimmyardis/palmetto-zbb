interface Props { onClose: () => void }

const SECTIONS = [
  {
    id: 'getting-started',
    heading: 'Getting Started',
    body: (
      <p>
        Open the <strong>Overview</strong> tab and click any agency in the treemap to explore it.
        When you're ready to run a ZBB exercise, use <strong>Agency Explorer</strong> to review
        line items and provisos, then open that agency in the <strong>ZBB Sandbox</strong> to
        start building from zero.
      </p>
    ),
  },
  {
    id: 'overview',
    heading: 'Overview',
    intro: 'The full $39.2B budget at a glance. An interactive treemap shows every agency by size — darker boxes are more General Fund dependent.',
    bullets: [
      'Click any agency box to jump to its detail',
      'Toggle between Total Funds and GF Only',
      'Track your ZBB review progress across all 115 agencies',
    ],
  },
  {
    id: 'explorer',
    heading: 'Agency Explorer',
    intro: 'Drill into any of the 115 agencies. Every line item shown with its exact source citation. Proviso text from Part IB appears alongside the numbers.',
    bullets: [
      'Sort and filter line items by fund type or amount',
      'Click any row to see the associated policy proviso',
      'Mark agencies as In Review, Justified, or Flagged',
      'Export any agency to CSV or Word',
    ],
  },
  {
    id: 'sandbox',
    heading: 'ZBB Sandbox',
    intro: 'The core zero-based budgeting tool. Load any agency, start from zero, and rebuild line by line with required justifications.',
    bullets: [
      '"Reset to Zero" zeroes all line items instantly',
      'Set priority tiers: Mandated / High / Medium / Low',
      'Bulk operations across selected rows',
      'Full undo/redo, named scenarios, save/load',
      'Export as formatted Word decision package',
    ],
  },
  {
    id: 'scenarios',
    heading: 'Scenarios',
    intro: 'Compare up to three saved budget scenarios side by side. See exactly what changes and where federal match funds are at risk.',
    bullets: [
      'Waterfall chart shows cumulative impact of cuts',
      'Federal match warnings flagged automatically',
      'Export committee packet — one page per agency',
      'Presentation mode for committee rooms',
    ],
  },
  {
    id: 'navigator',
    heading: 'Navigator',
    intro: 'Ask any question about the budget in plain English. Searches the full Part IB proviso text and returns precise, cited answers.',
    examples: [
      '"What provisos govern K-12 education?"',
      '"Which agencies have federal match requirements?"',
      '"What does the budget say about Medicaid?"',
      '"Show all provisos related to higher education tuition"',
    ],
  },
]

export default function HelpModal({ onClose }: Props) {
  function handleOverlayClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <div className="modal-overlay help-modal-overlay" onClick={handleOverlayClick}>
      <div className="modal-panel help-modal-panel">
        {/* Header */}
        <div className="modal-header">
          <h2>User Guide</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close help">✕</button>
        </div>

        <div className="modal-body help-modal-body">
          {SECTIONS.map(s => (
            <div key={s.id} className="help-section">
              <h3 className="help-section-heading">{s.heading}</h3>

              {s.body && s.body}

              {'intro' in s && s.intro && <p className="help-section-intro">{s.intro}</p>}

              {'bullets' in s && s.bullets && (
                <ul className="help-bullet-list">
                  {s.bullets.map((b, i) => <li key={i}>{b}</li>)}
                </ul>
              )}

              {'examples' in s && s.examples && (
                <>
                  <p className="help-section-label">Example questions:</p>
                  <ul className="help-bullet-list help-examples">
                    {s.examples.map((ex, i) => <li key={i}>{ex}</li>)}
                  </ul>
                </>
              )}
            </div>
          ))}

          {/* Data Integrity footer note */}
          <div className="help-integrity-note">
            <span className="help-integrity-label">Data Integrity</span>
            <p>
              All dollar figures are extracted verbatim from H.4025 (ratified May 28, 2025) —
              2,511 line items, $39,160,420,867 reconciled across all 115 agencies. The AI is
              prohibited from generating or approximating any figure. Every number carries a
              source citation. The green badge in the top right shows live reconciliation status
              at all times.
            </p>
          </div>

          <p className="help-kbd-hint">
            Tip: press <kbd>?</kbd> anywhere to open or close this guide.
          </p>
        </div>
      </div>
    </div>
  )
}
