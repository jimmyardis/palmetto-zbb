import { useState, useEffect } from 'react'

export type AgencyStatus = 'not-started' | 'in-review' | 'justified' | 'flagged'

const LS_KEY = 'palmetto_zbb_session_status'

function load(): Record<string, AgencyStatus> {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) return JSON.parse(raw) as Record<string, AgencyStatus>
  } catch { /* ignore */ }
  return {}
}

export function useAgencyStatus() {
  const [status, setStatusState] = useState<Record<string, AgencyStatus>>(load)

  useEffect(() => {
    try { localStorage.setItem(LS_KEY, JSON.stringify(status)) } catch { /* ignore */ }
  }, [status])

  function setStatus(section: string, s: AgencyStatus) {
    setStatusState(prev => ({ ...prev, [section]: s }))
  }

  function getEmoji(s: AgencyStatus): string {
    switch (s) {
      case 'not-started': return '⬜'
      case 'in-review':   return '🔄'
      case 'justified':   return '✅'
      case 'flagged':     return '🔴'
    }
  }

  const total = Object.keys(status).length
  const notStarted = Object.values(status).filter(v => v === 'not-started').length
  const inReview   = Object.values(status).filter(v => v === 'in-review').length
  const justified  = Object.values(status).filter(v => v === 'justified').length
  const flagged    = Object.values(status).filter(v => v === 'flagged').length

  return { status, setStatus, getEmoji, summary: { total, notStarted, inReview, justified, flagged } }
}
