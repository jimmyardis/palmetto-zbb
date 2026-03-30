const GF_BASELINE_CENTS = 1324616259300 // $13,246,162,593

function fmtCents(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(cents / 100)
}

interface Props {
  sandboxActive: boolean
  sandboxAgency: string
  justifiedCents: number
  hasUnsaved: boolean
}

export default function BottomStatusBar({ sandboxActive, sandboxAgency, justifiedCents, hasUnsaved }: Props) {
  const pct = sandboxActive && GF_BASELINE_CENTS > 0
    ? Math.min(100, Math.round(justifiedCents * 100 / GF_BASELINE_CENTS))
    : 0
  const over = justifiedCents > GF_BASELINE_CENTS

  return (
    <div className="bottom-bar">
      <span className="scenario-label">
        {sandboxActive
          ? <>
              <span style={{ color: 'rgba(255,255,255,.45)', marginRight: 6 }}>Sandbox:</span>
              <span style={{ color: '#fff', fontWeight: 600 }}>{sandboxAgency}</span>
              {hasUnsaved && <span className="unsaved-dot" title="Unsaved changes" />}
            </>
          : <span style={{ color: 'rgba(255,255,255,.4)' }}>No active sandbox</span>
        }
      </span>

      {sandboxActive && (
        <div className="gf-section">
          <span className="gf-label">
            GF Proposed: <strong style={{ color: '#fff' }}>{fmtCents(justifiedCents)}</strong>
            &nbsp;/&nbsp;{fmtCents(GF_BASELINE_CENTS)} baseline
            {over && <span style={{ color: '#ef9a9a', marginLeft: 6 }}>▲ OVER</span>}
          </span>
          <div className="gf-bar-wrap">
            <div
              className={`gf-bar-fill ${over ? 'over' : 'under'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,.5)' }}>{pct}%</span>
        </div>
      )}
    </div>
  )
}
