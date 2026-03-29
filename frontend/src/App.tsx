import { useState } from 'react'
import AgencyExplorer from './components/AgencyExplorer'
import ZBBSandbox from './components/ZBBSandbox'
import ScenarioTab from './components/ScenarioTab'
import NavigatorTab from './components/NavigatorTab'
import DataIntegrityBadge from './components/DataIntegrityBadge'

type Tab = 'explorer' | 'sandbox' | 'scenario' | 'navigator'

const TABS: { id: Tab; label: string }[] = [
  { id: 'explorer',  label: 'Agency Explorer' },
  { id: 'sandbox',   label: 'ZBB Sandbox' },
  { id: 'scenario',  label: 'Scenario Modeler' },
  { id: 'navigator', label: 'Budget Navigator' },
]

export default function App() {
  const [tab, setTab] = useState<Tab>('explorer')

  return (
    <>
      {/* Header */}
      <header style={{
        background: 'var(--navy)',
        borderBottom: '3px solid var(--gold)',
        padding: '0 24px',
        display: 'flex',
        alignItems: 'center',
        gap: 20,
        height: 56,
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
          <span style={{ color: 'var(--gold)', fontWeight: 700, fontSize: 15, letterSpacing: '.04em' }}>
            PALMETTO ZBB SUITE
          </span>
          <span style={{ color: 'rgba(255,255,255,.55)', fontSize: 10, letterSpacing: '.06em' }}>
            SC GENERAL ASSEMBLY · FY2025-2026 · H.4025
          </span>
        </div>

        <nav style={{ display: 'flex', gap: 2, marginLeft: 24 }}>
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                background: tab === t.id ? 'var(--gold)' : 'transparent',
                color: tab === t.id ? 'var(--navy)' : 'rgba(255,255,255,.75)',
                border: 'none',
                padding: '6px 14px',
                borderRadius: 4,
                fontWeight: tab === t.id ? 700 : 400,
                fontSize: 13,
                cursor: 'pointer',
                transition: 'background .15s, color .15s',
              }}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      {/* Main content */}
      <main style={{ padding: '24px 24px 80px' }}>
        {tab === 'explorer'  && <AgencyExplorer />}
        {tab === 'sandbox'   && <ZBBSandbox />}
        {tab === 'scenario'  && <ScenarioTab />}
        {tab === 'navigator' && <NavigatorTab />}
      </main>

      {/* Always-visible data integrity badge */}
      <DataIntegrityBadge />
    </>
  )
}
