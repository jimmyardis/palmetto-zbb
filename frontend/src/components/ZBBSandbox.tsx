import { useState, useEffect, useCallback } from 'react'
import { api } from '../api'
import type { AgencySummary, LineItem, DecisionUnit, PriorityTier } from '../types'

const TIERS: PriorityTier[] = ['Mandated', 'High', 'Medium', 'Low']

interface SandboxRow {
  lineItem: LineItem
  included: boolean
  justifiedCents: number       // integer cents, editable
  justificationText: string
  priorityTier: PriorityTier
  suggestLoading: boolean
}

function dollarsFromCents(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

// Parse user-entered dollar string back to integer cents
function parseDollarInput(val: string): number | null {
  const stripped = val.replace(/[$,\s]/g, '')
  if (!stripped) return null
  const n = parseInt(stripped, 10)
  if (isNaN(n)) return null
  return n * 100
}

export default function ZBBSandbox() {
  const [agencies, setAgencies] = useState<AgencySummary[]>([])
  const [selected, setSelected] = useState('')
  const [rows, setRows] = useState<SandboxRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [preparerName, setPreparerName] = useState('')
  const [exporting, setExporting] = useState(false)
  const [agencyName, setAgencyName] = useState('')

  useEffect(() => {
    api.agencies()
      .then(r => setAgencies([...r.agencies].sort((a, b) =>
        a.agency_name.localeCompare(b.agency_name)
      )))
      .catch(() => {})
  }, [])

  function loadAgency(section: string) {
    if (!section) { setRows([]); setSelected(''); return }
    setSelected(section)
    setLoading(true)
    setError('')
    api.agency(section).then(detail => {
      setAgencyName(detail.agency_name)
      setRows(detail.line_items.map(li => ({
        lineItem: li,
        included: true,
        justifiedCents: li.total_funds_cents,   // pre-populated from SQLite
        justificationText: '',
        priorityTier: 'Medium' as PriorityTier,
        suggestLoading: false,
      })))
    }).catch(e => setError(e.message)).finally(() => setLoading(false))
  }

  function updateRow(id: number, patch: Partial<SandboxRow>) {
    setRows(prev => prev.map(r => r.lineItem.id === id ? { ...r, ...patch } : r))
  }

  function resetToZero() {
    setRows(prev => prev.map(r => ({ ...r, justifiedCents: 0 })))
  }

  function resetToCurrent() {
    setRows(prev => prev.map(r => ({
      ...r, justifiedCents: r.lineItem.total_funds_cents
    })))
  }

  async function suggestJustification(row: SandboxRow) {
    updateRow(row.lineItem.id, { suggestLoading: true })
    try {
      const q = `What Part IB proviso requirements, spending conditions, or restrictions apply to "${row.lineItem.description}" in the ${agencyName} appropriation?`
      const resp = await api.ask(q, selected)
      updateRow(row.lineItem.id, {
        justificationText: resp.answer,
        suggestLoading: false,
      })
    } catch {
      updateRow(row.lineItem.id, { suggestLoading: false })
    }
  }

  async function handleExport() {
    const included = rows.filter(r => r.included)
    if (!included.length) { setError('No items selected for export.'); return }
    setExporting(true)
    try {
      const units: DecisionUnit[] = included.map(r => ({
        line_item_id: r.lineItem.id,
        justified_amount_cents: r.justifiedCents,
        justification_text: r.justificationText || '(No justification provided)',
        priority_tier: r.priorityTier,
      }))
      const { blob, name } = await api.exportDocx(agencyName, selected, units, preparerName || undefined)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = name; a.click()
      URL.revokeObjectURL(url)
    } catch (e: unknown) {
      setError((e as Error).message)
    } finally {
      setExporting(false)
    }
  }

  // Running totals (integer cents only)
  const includedRows = rows.filter(r => r.included)
  const currentTotalCents  = includedRows.reduce((s, r) => s + r.lineItem.total_funds_cents, 0)
  const justifiedTotalCents = includedRows.reduce((s, r) => s + r.justifiedCents, 0)
  const deltaCents = currentTotalCents - justifiedTotalCents
  const deltaPercent = currentTotalCents > 0
    ? Math.round((deltaCents * 100) / currentTotalCents)
    : 0

  return (
    <div className="stack">
      {/* Controls */}
      <div className="card">
        <div className="card-header">
          <h2>ZBB Sandbox</h2>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Zero-base each line item from current FY2025-2026 appropriations
          </span>
        </div>
        <div className="card-body">
          <div className="row" style={{ flexWrap: 'wrap', gap: 12 }}>
            <div style={{ flex: '1 1 280px' }}>
              <label>Agency</label>
              <select value={selected} onChange={e => loadAgency(e.target.value)}>
                <option value="">— Select agency —</option>
                {agencies.map(a => (
                  <option key={a.section_number} value={a.section_number}>
                    §{a.section_number} · {a.agency_name}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ flex: '1 1 200px' }}>
              <label>Preparer name (for export)</label>
              <input
                type="text"
                placeholder="Optional"
                value={preparerName}
                onChange={e => setPreparerName(e.target.value)}
              />
            </div>
            {rows.length > 0 && (
              <div className="row" style={{ flex: '0 0 auto', marginTop: 20, gap: 8 }}>
                <button className="btn btn-danger btn-sm" onClick={resetToZero}>↓ Reset to Zero</button>
                <button className="btn btn-outline btn-sm" onClick={resetToCurrent}>↑ Restore Current</button>
                <button
                  className="btn btn-gold"
                  disabled={exporting || includedRows.length === 0}
                  onClick={handleExport}
                >
                  {exporting ? 'Exporting…' : '⬇ Export to Word'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}
      {loading && <div className="loading">Loading line items…</div>}

      {rows.length > 0 && !loading && (
        <div className="sandbox-layout">
          {/* Main table */}
          <div className="card">
            <div className="card-header">
              <h2>{agencyName} — Line Items</h2>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto' }}>
                Amounts pre-populated from SQLite (tap1a.htm) · editable
              </span>
            </div>
            <div className="sandbox-table">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 36 }}>✓</th>
                    <th>Line Item</th>
                    <th className="num">Current<br/><small>FY25-26</small></th>
                    <th className="num">Justified<br/><small>Proposed</small></th>
                    <th>Justification</th>
                    <th>Tier</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(row => {
                    const li = row.lineItem
                    return (
                      <tr key={li.id} style={{ opacity: row.included ? 1 : 0.4 }}>
                        <td>
                          <input
                            type="checkbox"
                            checked={row.included}
                            onChange={e => updateRow(li.id, { included: e.target.checked })}
                            style={{ width: 'auto' }}
                          />
                        </td>
                        <td>
                          <div style={{ fontSize: 13 }}>
                            {li.description}
                            {li.has_federal_match && <span className="fed-badge">FED</span>}
                          </div>
                          {li.subsection && (
                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{li.subsection}</div>
                          )}
                          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                            p.{li.citation.page_number} · {li.citation.source_doc}
                            <span className="cite-badge verified" style={{ marginLeft: 4 }}
                              title={`Source: ${li.citation.source_doc} · Page ${li.citation.page_number} · ${li.citation.act}`}>
                              ✓
                            </span>
                          </div>
                        </td>
                        <td className="num" style={{ whiteSpace: 'nowrap' }}>
                          {li.total_funds_display}
                        </td>
                        <td className="num">
                          <input
                            type="number"
                            min={0}
                            step={100}
                            value={Math.round(row.justifiedCents / 100)}
                            onChange={e => {
                              const d = parseInt(e.target.value, 10)
                              updateRow(li.id, { justifiedCents: isNaN(d) ? 0 : d * 100 })
                            }}
                            style={{ width: 120, textAlign: 'right' }}
                          />
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                            <textarea
                              placeholder="Justification…"
                              value={row.justificationText}
                              onChange={e => updateRow(li.id, { justificationText: e.target.value })}
                              rows={2}
                            />
                            {li.description.includes('ALLOC') ? (
                              <span
                                title="Allocation rows route funds to other entities. Part IB proviso conditions apply to the receiving program's section, not this entry — no proviso text to retrieve here."
                                style={{ flexShrink: 0, marginTop: 2, fontSize: 11, color: 'var(--text-muted)', cursor: 'help', padding: '4px 6px' }}
                              >
                                ✦ N/A
                              </span>
                            ) : (
                              <button
                                className="btn btn-ghost btn-sm"
                                title="Suggest justification from Part IB proviso text"
                                disabled={row.suggestLoading}
                                onClick={() => suggestJustification(row)}
                                style={{ flexShrink: 0, marginTop: 2 }}
                              >
                                {row.suggestLoading ? '…' : '✦ AI'}
                              </button>
                            )}
                          </div>
                        </td>
                        <td>
                          <select
                            value={row.priorityTier}
                            onChange={e => updateRow(li.id, { priorityTier: e.target.value as PriorityTier })}
                          >
                            {TIERS.map(t => <option key={t}>{t}</option>)}
                          </select>
                          <span className={`tier-badge tier-${row.priorityTier}`} style={{ marginTop: 4, display: 'block' }}>
                            {row.priorityTier}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Running total sidebar */}
          <div className="running-total-card card" style={{ position: 'sticky', top: 24 }}>
            <div className="card-header"><h2>Running Total</h2></div>
            <div className="card-body stack" style={{ gap: 16 }}>
              <div>
                <div className="label">Current Appropriation</div>
                <div className="big-number">{dollarsFromCents(currentTotalCents)}</div>
                <div className="sub">FY2025-2026 enacted (SQLite)</div>
              </div>
              <div>
                <div className="label">Justified Amount</div>
                <div className="big-number" style={{ color: 'var(--gold)' }}>
                  {dollarsFromCents(justifiedTotalCents)}
                </div>
              </div>
              <div>
                <div className="label">Variance</div>
                <div className="cut-amount">{deltaCents >= 0 ? '−' : '+'}{dollarsFromCents(Math.abs(deltaCents))}</div>
                {currentTotalCents > 0 && (
                  <div className="sub">{deltaPercent}% {deltaCents >= 0 ? 'reduction' : 'increase'}</div>
                )}
              </div>
              <hr style={{ borderColor: 'var(--border)' }} />
              <div>
                <div className="label">Items</div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>
                  {includedRows.length} of {rows.length} included
                </div>
              </div>

              {/* Priority breakdown */}
              <div>
                <div className="label" style={{ marginBottom: 8 }}>By Priority Tier</div>
                {TIERS.map(tier => {
                  const tierRows = includedRows.filter(r => r.priorityTier === tier)
                  const tierTotal = tierRows.reduce((s, r) => s + r.justifiedCents, 0)
                  if (!tierRows.length) return null
                  return (
                    <div key={tier} className="row" style={{ marginBottom: 4, justifyContent: 'space-between' }}>
                      <span className={`tier-badge tier-${tier}`}>{tier}</span>
                      <span style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
                        {dollarsFromCents(tierTotal)}
                      </span>
                    </div>
                  )
                })}
              </div>

              <button
                className="btn btn-gold"
                disabled={exporting || includedRows.length === 0}
                onClick={handleExport}
                style={{ width: '100%' }}
              >
                {exporting ? 'Exporting…' : '⬇ Export to Word'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
