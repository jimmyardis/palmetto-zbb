import { useState, useEffect } from 'react'
import { api } from '../api'
import type { ReconciliationResponse } from '../types'

interface Props { onClose: () => void }

export default function ReconciliationModal({ onClose }: Props) {
  const [data, setData] = useState<ReconciliationResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api.reconciliation()
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-panel">
        <div className="modal-header">
          <div>
            <h2>Data Reconciliation Report</h2>
            {data && (
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,.65)', marginTop: 3 }}>
                {data.act} · Source: {data.source_doc} · Run: {data.run_at?.slice(0,19).replace('T',' ')} UTC
              </p>
            )}
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          {loading && <div className="loading">Loading reconciliation data…</div>}
          {error && <div className="alert alert-danger">{error}</div>}

          {data && (
            <>
              {/* Summary */}
              <div className="stat-grid" style={{ marginBottom: 12 }}>
                <div className="stat-card">
                  <div className="label">Overall Status</div>
                  <div className="value" style={{ fontSize: 20 }}>
                    <span className={data.status === 'pass' ? 'recon-pass' : 'recon-warn'}>
                      {data.status === 'pass' ? '✓ PASS' : '⚠ WARN'}
                    </span>
                  </div>
                </div>
                <div className="stat-card">
                  <div className="label">H.4025 Recurring</div>
                  <div className="value" style={{ fontSize: 16 }}>{data.summary.recap_total_display}</div>
                  <div className="sub">Agency appropriations · H.4025 Part IA</div>
                </div>
                <div className="stat-card">
                  <div className="label">General Fund Total</div>
                  <div className="value" style={{ fontSize: 16 }}>{data.summary.recap_gf_display}</div>
                  <div className="sub">Of recurring total</div>
                </div>
                <div className="stat-card">
                  <div className="label">Agencies</div>
                  <div className="value">
                    <span className="recon-pass">{data.summary.pass_count} PASS</span>
                    {data.summary.warn_count > 0 && (
                      <span className="recon-warn"> / {data.summary.warn_count} WARN</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Nonrecurring funds breakdown */}
              <div style={{
                background: '#f8f9ff',
                border: '1px solid #c5d0e8',
                borderRadius: 6,
                padding: '12px 16px',
                marginBottom: 12,
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 12,
              }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>Surplus (Nonrecurring · Line 79)</div>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>$1,486,799,741</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>FY 2024-25 Projected Surplus</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>Capital Reserve Fund (H.4026 · Line 80)</div>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>$369,783,882</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>FY 2024-25 CRF</div>
                </div>
                <div style={{ borderLeft: '2px solid var(--navy)', paddingLeft: 12 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>Grand Total (H.4025 + H.4026)</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--navy)' }}>$41,017,004,490</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>All FY2025-26 appropriations</div>
                </div>
              </div>

              <div className="alert alert-info" style={{ marginBottom: 16 }}>
                H.4025 recurring figures sourced verbatim from Part IA ({data.source_doc}).
                Nonrecurring funds (Surplus + CRF) sourced from the Conference Committee Summary Control Document, May 21 2025.
                DB Sum is the independent sum of extracted line items — used to verify extraction accuracy.
              </div>

              {/* Per-agency table */}
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Sec.</th>
                      <th>Agency</th>
                      <th className="num">Recap Total</th>
                      <th className="num">DB Sum</th>
                      <th className="num">Delta</th>
                      <th>Items</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.agencies.map(a => (
                      <tr key={a.section_number}>
                        <td><span className="section-tag">{a.section_number}</span></td>
                        <td>{a.agency_name}</td>
                        <td className="num">{a.recap_total_display}</td>
                        <td className="num">{a.db_total_display}</td>
                        <td className="num" style={{ color: a.delta_display === '$0' ? 'var(--success)' : 'var(--warn)' }}>
                          {a.delta_display}
                        </td>
                        <td>{a.line_item_count}</td>
                        <td>
                          <span className={a.status === 'PASS' ? 'status-pass' : 'status-warn'}>
                            {a.status === 'PASS' ? '✓ PASS' : '⚠ WARN'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
