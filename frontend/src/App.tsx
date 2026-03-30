import { useState, useEffect } from 'react'
import { api } from './api'
import type { AgencySummary } from './types'
import TopBar from './components/TopBar'
import BottomStatusBar from './components/BottomStatusBar'
import OverviewTab from './components/OverviewTab'
import AgencyExplorerTab from './components/AgencyExplorerTab'
import ZBBSandboxTab from './components/ZBBSandboxTab'
import ScenariosTab from './components/ScenariosTab'
import NavigatorTab from './components/NavigatorTab'
import ReconciliationModal from './components/ReconciliationModal'
import HelpModal from './components/HelpModal'

type Tab = 'overview' | 'explorer' | 'sandbox' | 'scenarios' | 'navigator'

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [showReconModal, setShowReconModal] = useState(false)
  const [showHelpModal, setShowHelpModal] = useState(false)
  const [agencies, setAgencies] = useState<AgencySummary[]>([])
  const [loadingAgencies, setLoadingAgencies] = useState(true)

  // Cross-tab navigation state
  const [explorerSection, setExplorerSection] = useState<string | undefined>()
  const [sandboxSection, setSandboxSection] = useState<string | undefined>()

  // Sandbox bottom bar state
  const [sandboxActive, setSandboxActive] = useState(false)
  const [sandboxAgency, setSandboxAgency] = useState('')
  const [sandboxJustifiedCents, setSandboxJustifiedCents] = useState(0)
  const [sandboxHasUnsaved, setSandboxHasUnsaved] = useState(false)

  const presentMode = new URLSearchParams(window.location.search).get('present') === 'true'

  useEffect(() => {
    api.agencies()
      .then(r => setAgencies(r.agencies))
      .catch(console.error)
      .finally(() => setLoadingAgencies(false))
  }, [])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.key === '?') setShowHelpModal(v => !v)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  function navigateToExplorer(section: string) {
    setExplorerSection(section)
    setActiveTab('explorer')
  }

  function navigateToSandbox(section: string) {
    setSandboxSection(section)
    setActiveTab('sandbox')
  }

  function handleSandboxChange(active: boolean, agency: string, justifiedCents: number, hasUnsaved: boolean) {
    setSandboxActive(active)
    setSandboxAgency(agency)
    setSandboxJustifiedCents(justifiedCents)
    setSandboxHasUnsaved(hasUnsaved)
  }

  if (loadingAgencies) {
    return (
      <div className="app-shell">
        <div className="loading" style={{ paddingTop: 80 }}>Loading Palmetto ZBB Suite…</div>
      </div>
    )
  }

  return (
    <div className={`app-shell${presentMode ? ' present-mode' : ''}`}>
      {!presentMode && (
        <TopBar
          activeTab={activeTab}
          setActiveTab={(t) => setActiveTab(t as Tab)}
          onOpenRecon={() => setShowReconModal(true)}
          onOpenHelp={() => setShowHelpModal(true)}
          presentMode={presentMode}
        />
      )}

      <div className="tab-content">
        {activeTab === 'overview' && (
          <OverviewTab agencies={agencies} onNavigateToAgency={navigateToExplorer} />
        )}
        {activeTab === 'explorer' && (
          <AgencyExplorerTab
            agencies={agencies}
            initialSection={explorerSection}
            onOpenInSandbox={navigateToSandbox}
          />
        )}
        {activeTab === 'sandbox' && (
          <ZBBSandboxTab
            agencies={agencies}
            initialSection={sandboxSection}
            onSandboxChange={handleSandboxChange}
          />
        )}
        {activeTab === 'scenarios' && (
          <ScenariosTab agencies={agencies} />
        )}
        {activeTab === 'navigator' && (
          <NavigatorTab />
        )}
      </div>

      <BottomStatusBar
        sandboxActive={sandboxActive}
        sandboxAgency={sandboxAgency}
        justifiedCents={sandboxJustifiedCents}
        hasUnsaved={sandboxHasUnsaved}
      />

      {showReconModal && <ReconciliationModal onClose={() => setShowReconModal(false)} />}
      {showHelpModal && <HelpModal onClose={() => setShowHelpModal(false)} />}
    </div>
  )
}
