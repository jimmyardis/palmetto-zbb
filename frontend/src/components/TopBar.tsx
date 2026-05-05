interface Props {
  activeTab: string
  setActiveTab: (tab: string) => void
  onOpenHelp: () => void
  presentMode: boolean
}

const TABS = [
  { id: 'overview',   label: 'Overview' },
  { id: 'explorer',   label: 'Agency Explorer' },
  { id: 'sandbox',    label: 'ZBB Sandbox' },
  { id: 'scenarios',  label: 'Scenarios' },
  { id: 'navigator',  label: 'Navigator' },
]

export default function TopBar({ activeTab, setActiveTab, onOpenHelp, presentMode }: Props) {
  if (presentMode) return null

  return (
    <div className="topbar">
      {/* Brand */}
      <div className="topbar-brand">
        <svg width="28" height="28" viewBox="0 0 28 28" style={{ marginRight: 4, flexShrink: 0 }}>
          <rect width="28" height="28" rx="4" fill="#C9963A"/>
          <text x="14" y="20" textAnchor="middle" fontSize="16" fill="#1B2F5E">🌴</text>
        </svg>
        <div>
          <div className="wordmark">PALMETTO ZBB SUITE</div>
          <div className="subtext">SC General Assembly · FY2025-2026 · H.4025 + H.4026 · v2.0</div>
        </div>
      </div>

      {/* Navigation */}
      <div className="topbar-nav">
        {TABS.map(t => (
          <button
            key={t.id}
            className={`nav-tab${activeTab === t.id ? ' active' : ''}`}
            onClick={() => setActiveTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Right: help */}
      <div className="topbar-right">
        <button className="help-btn" onClick={onOpenHelp} title="User guide (?)">?</button>
      </div>
    </div>
  )
}
