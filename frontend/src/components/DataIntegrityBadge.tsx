import { useState, useEffect } from 'react'
import { api } from '../api'
import ReconciliationModal from './ReconciliationModal'
import type { HealthResponse } from '../types'

export default function DataIntegrityBadge() {
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [showModal, setShowModal] = useState(false)

  useEffect(() => {
    api.health().then(setHealth).catch(() => {})
  }, [])

  if (!health || health.database.data_rows === 0) return null

  const { data_rows } = health.database
  const total = health.reconciliation.recap_total

  return (
    <>
      <button
        className="integrity-badge"
        onClick={() => setShowModal(true)}
        title="Click to view full reconciliation report"
      >
        <span className="check">✓</span>
        <span>
          <strong>{data_rows.toLocaleString()} line items</strong>
          <span className="items"> | </span>
          <strong>{total}</strong>
          <span className="items"> total | </span>
          <span className="source">Source: H.4025 ratified May 28 2025</span>
        </span>
      </button>

      {showModal && (
        <ReconciliationModal onClose={() => setShowModal(false)} />
      )}
    </>
  )
}
