import { useState, useEffect, useRef, useCallback } from 'react'
import { api } from '../api'
import type { AgencySummary, Citation, StructuredUnit } from '../types'
import { useScenarios } from '../hooks/useScenarios'
import type { ScenarioSandboxRow } from '../hooks/useScenarios'

type PriorityTier = 'Mandated' | 'High' | 'Medium' | 'Low' | 'Zero'

interface SandboxRow {
  lineItemId: number
  description: string
  subsection: string | null
  originalCents: number
  originalDisplay: string
  justifiedCents: number
  priorityTier: PriorityTier
  justificationText: string
  included: boolean
  locked: boolean
  hasFederalMatch: boolean
  citation: Citation
}

interface Props {
  agencies: AgencySummary[]
  initialSection?: string
  onSandboxChange: (active: boolean, agency: string, justifiedCents: number, hasUnsaved: boolean) => void
}

const TIERS: PriorityTier[] = ['Mandated', 'High', 'Medium', 'Low', 'Zero']

function fmtCents(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(cents / 100)
}

function deltaPct(orig: number, proposed: number): string {
  if (orig === 0) return '—'
  const pct = Math.round((orig - proposed) * 100 / orig)
  return pct === 0 ? '0%' : `−${pct}%`
}

export default function ZBBSandboxTab({ agencies, initialSection, onSandboxChange }: Props) {
  const [selectedSection, setSelectedSection] = useState(initialSection ?? '')
  const [agencyName, setAgencyName] = useState('')
  const [rows, setRows] = useState<SandboxRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')

  // Undo/Redo
  const historyRef = useRef<SandboxRow[][]>([])
  const historyIdxRef = useRef(-1)
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const [changeCount, setChangeCount] = useState(0)

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [bulkPct, setBulkPct] = useState(10)
  const [bulkTier, setBulkTier] = useState<PriorityTier>('Medium')

  // Scenario management
  const [scenarioName, setScenarioName] = useState('New Scenario')
  const [exporting, setExporting] = useState(false)
  const [preparerName, setPreparerName] = useState('')
  const [hasUnsaved, setHasUnsaved] = useState(false)
  const { scenarios, saveScenario, loadScenario } = useScenarios()

  // Suggest justification state
  const [suggestingId, setSuggestingId] = useState<number | null>(null)

  // Pre-fill from Claude state
  const [prefillLoading, setPrefillLoading] = useState(false)
  const [prefillError, setPrefillError] = useState('')

  // Export options
  const [includeInsights, setIncludeInsights] = useState(true)

  const prevSection = useRef('')

  // Load initial section from prop
  useEffect(() => {
    if (initialSection && initialSection !== prevSection.current) {
      prevSection.current = initialSection
      setSelectedSection(initialSection)
    }
  }, [initialSection])

  // Load agency
  useEffect(() => {
    if (!selectedSection) return
    setLoading(true)
    setError('')
    api.agency(selectedSection).then(detail => {
      const r: SandboxRow[] = detail.line_items.map(li => ({
        lineItemId: li.id,
        description: li.description,
        subsection: li.subsection,
        originalCents: li.total_funds_cents,
        originalDisplay: li.total_funds_display,
        justifiedCents: li.total_funds_cents,
        priorityTier: 'Medium' as PriorityTier,
        justificationText: '',
        included: true,
        locked: false,
        hasFederalMatch: li.has_federal_match,
        citation: li.citation,
      }))
      setAgencyName(detail.agency_name)
      setRows(r)
      setHasUnsaved(false)
      historyRef.current = [r]
      historyIdxRef.current = 0
      setCanUndo(false); setCanRedo(false); setChangeCount(0)
      setSelectedIds(new Set())
    }).catch(e => setError(e.message)).finally(() => setLoading(false))
  }, [selectedSection])

  // Notify parent of sandbox state changes
  useEffect(() => {
    if (!selectedSection || rows.length === 0) {
      onSandboxChange(false, '', 0, false)
      return
    }
    const justifiedTotal = rows.filter(r => r.included).reduce((s, r) => s + r.justifiedCents, 0)
    onSandboxChange(true, agencyName, justifiedTotal, hasUnsaved)
  }, [rows, selectedSection, agencyName, hasUnsaved, onSandboxChange])

  function pushHistory(newRows: SandboxRow[]) {
    const history = historyRef.current
    const idx = historyIdxRef.current
    const trimmed = history.slice(0, idx + 1)
    const next = [...trimmed, newRows].slice(-50)
    historyRef.current = next
    historyIdxRef.current = next.length - 1
    setCanUndo(next.length > 1)
    setCanRedo(false)
    setChangeCount(c => c + 1)
    setHasUnsaved(true)
  }

  function updateRows(newRows: SandboxRow[]) {
    setRows(newRows)
    pushHistory(newRows)
  }

  function undo() {
    const idx = historyIdxRef.current
    if (idx <= 0) return
    historyIdxRef.current = idx - 1
    setRows(historyRef.current[idx - 1])
    setCanUndo(idx - 1 > 0)
    setCanRedo(true)
  }

  function redo() {
    const idx = historyIdxRef.current
    if (idx >= historyRef.current.length - 1) return
    historyIdxRef.current = idx + 1
    setRows(historyRef.current[idx + 1])
    setCanUndo(true)
    setCanRedo(idx + 1 < historyRef.current.length - 1)
  }

  function updateRow(id: number, patch: Partial<SandboxRow>) {
    updateRows(rows.map(r => r.lineItemId === id ? { ...r, ...patch } : r))
  }

  // Bulk operations
  function bulkApplyPct() {
    const targets = rows.filter(r => !r.locked && (selectedIds.size === 0 || selectedIds.has(r.lineItemId)))
    updateRows(rows.map(r => {
      if (targets.find(t => t.lineItemId === r.lineItemId)) {
        return { ...r, justifiedCents: Math.floor(r.originalCents * (100 - bulkPct) / 100) }
      }
      return r
    }))
  }

  function bulkSetTier() {
    const targets = rows.filter(r => selectedIds.size === 0 || selectedIds.has(r.lineItemId))
    updateRows(rows.map(r => targets.find(t => t.lineItemId === r.lineItemId) ? { ...r, priorityTier: bulkTier } : r))
  }

  function bulkZero() {
    const targets = rows.filter(r => !r.locked && (selectedIds.size === 0 || selectedIds.has(r.lineItemId)))
    updateRows(rows.map(r => targets.find(t => t.lineItemId === r.lineItemId) ? { ...r, justifiedCents: 0, priorityTier: 'Zero' } : r))
  }

  function resetToZero() {
    updateRows(rows.map(r => r.locked ? r : { ...r, justifiedCents: 0 }))
  }

  function resetToBaseline() {
    updateRows(rows.map(r => ({ ...r, justifiedCents: r.originalCents })))
    setChangeCount(0); setHasUnsaved(false)
  }

  async function suggestJustification(row: SandboxRow) {
    setSuggestingId(row.lineItemId)
    try {
      // Semantic content query (no task-instruction framing) + section filter.
      // Prior attempt used instruction framing ("quote the proviso that governs…") which
      // polluted the embedding with task meta-language. Prior attempt also dropped
      // section_filter because linked_section type mismatch in backend caused silent
      // chunk loss — that backend bug is now fixed.
      const q = `Proviso spending conditions and restrictions for "${row.description}" in ${agencyName}`
      const resp = await api.ask(q, selectedSection, 'suggest')
      updateRows(rows.map(r => r.lineItemId === row.lineItemId ? { ...r, justificationText: resp.answer } : r))
    } catch { /* silent */ } finally {
      setSuggestingId(null)
    }
  }

  function handleSave() {
    const scenRows: ScenarioSandboxRow[] = rows.map(r => ({
      lineItemId: r.lineItemId,
      description: r.description,
      subsection: r.subsection,
      originalCents: r.originalCents,
      originalDisplay: r.originalDisplay,
      justifiedCents: r.justifiedCents,
      priorityTier: r.priorityTier,
      justificationText: r.justificationText,
      included: r.included,
      locked: r.locked,
      hasFederalMatch: r.hasFederalMatch,
      citation: r.citation,
    }))
    saveScenario(scenarioName, selectedSection, agencyName, scenRows)
    setHasUnsaved(false)
  }

  function handleLoad(id: string) {
    const s = loadScenario(id)
    if (!s) return
    const loaded: SandboxRow[] = s.rows.map(r => ({
      lineItemId: r.lineItemId,
      description: r.description,
      subsection: r.subsection,
      originalCents: r.originalCents,
      originalDisplay: r.originalDisplay,
      justifiedCents: r.justifiedCents,
      priorityTier: r.priorityTier,
      justificationText: r.justificationText,
      included: r.included,
      locked: r.locked,
      hasFederalMatch: r.hasFederalMatch,
      citation: r.citation,
    }))
    setRows(loaded)
    setScenarioName(s.name)
    setHasUnsaved(false)
  }

  function matchUnit(subsection: string | null, units: StructuredUnit[]): StructuredUnit | null {
    if (!subsection) return null
    const sub = subsection.toUpperCase()
    return units.find(u => {
      const key = u.subsection.split('.').slice(1).join('.').trim().toUpperCase().slice(0, 14)
      return key && sub.includes(key)
    }) ?? null
  }

  async function handlePrefill() {
    if (!selectedSection) return
    setPrefillLoading(true)
    setPrefillError('')
    try {
      const result = await api.insightsStructured(selectedSection)
      const units = result.units ?? []
      setRows(prev => prev.map(row => {
        const unit = matchUnit(row.subsection, units)
        if (!unit) return row
        return {
          ...row,
          priorityTier: unit.recommended_tier as PriorityTier,
          justificationText: row.justificationText
            ? row.justificationText
            : unit.pre_fill_text + ' (Pre-filled by Claude — edit before saving)',
        }
      }))
    } catch (e: unknown) {
      setPrefillError((e as Error).message)
    } finally {
      setPrefillLoading(false)
    }
  }

  async function handleExport() {
    const included = rows.filter(r => r.included)
    if (!included.length) return
    setExporting(true)
    try {
      const { blob, name } = await api.exportDocx(
        agencyName, selectedSection,
        included.map(r => ({
          line_item_id: r.lineItemId,
          justified_amount_cents: r.justifiedCents,
          justification_text: r.justificationText || '(No justification provided)',
          priority_tier: r.priorityTier === 'Zero' ? 'Low' : r.priorityTier,
        })),
        preparerName || undefined,
        includeInsights,
      )
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

  const toggleSelect = useCallback((id: number) => {
    setSelectedIds(prev => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }, [])

  const toggleAll = useCallback(() => {
    setSelectedIds(prev => prev.size === rows.length ? new Set() : new Set(rows.map(r => r.lineItemId)))
  }, [rows])

  const includedRows = rows.filter(r => r.included)
  const originalTotal = includedRows.reduce((s, r) => s + r.originalCents, 0)
  const justifiedTotal = includedRows.reduce((s, r) => s + r.justifiedCents, 0)
  const deltaTotal = originalTotal - justifiedTotal
  const deltaTotalPct = originalTotal > 0 ? Math.round(deltaTotal * 100 / originalTotal) : 0
  const fedWarnings = rows.filter(r => r.hasFederalMatch && r.justifiedCents < r.originalCents * 0.9)

  const filteredAgencies = agencies.filter(a =>
    !search || a.agency_name.toLowerCase().includes(search.toLowerCase()) || a.section_number.includes(search)
  )

  return (
    <div>
      {/* Scenario management bar */}
      <div className="card mb-16">
        <div className="card-body" style={{ padding: '12px 20px' }}>
          <div className="form-row" style={{ flexWrap: 'wrap', gap: 10 }}>
            <input
              type="text"
              value={scenarioName}
              onChange={e => setScenarioName(e.target.value)}
              placeholder="Scenario name…"
              style={{ width: 200 }}
            />
            <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={!rows.length}>
              💾 Save Scenario
            </button>
            {scenarios.length > 0 && (
              <select style={{ width: 'auto' }} onChange={e => e.target.value && handleLoad(e.target.value)} defaultValue="">
                <option value="">Load saved…</option>
                {scenarios.map(s => (
                  <option key={s.id} value={s.id}>{s.name} ({s.agencyName})</option>
                ))}
              </select>
            )}
            <button className="btn btn-ghost btn-sm" onClick={undo} disabled={!canUndo} title="Undo">↩ Undo</button>
            <button className="btn btn-ghost btn-sm" onClick={redo} disabled={!canRedo} title="Redo">↪ Redo</button>
            {changeCount > 0 && (
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{changeCount} modification{changeCount !== 1 ? 's' : ''}</span>
            )}
            {hasUnsaved && <span style={{ fontSize: 11, color: 'var(--warn)', fontWeight: 600 }}>● Unsaved changes</span>}
          </div>
        </div>
      </div>

      {/* Agency selector */}
      <div className="card mb-16">
        <div className="card-body" style={{ padding: '12px 20px' }}>
          <div className="form-row">
            <div style={{ flex: '1 1 200px' }}>
              <label>Agency</label>
              <input type="text" placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} style={{ marginBottom: 4 }} />
              <select value={selectedSection} onChange={e => setSelectedSection(e.target.value)} style={{ width: '100%' }}>
                <option value="">— Select agency —</option>
                {filteredAgencies.map(a => (
                  <option key={a.section_number} value={a.section_number}>
                    §{a.section_number} · {a.agency_name} · {a.total_funds_display}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ flex: '0 0 200px' }}>
              <label>Preparer (for export)</label>
              <input type="text" placeholder="Optional" value={preparerName} onChange={e => setPreparerName(e.target.value)} />
            </div>
          </div>
        </div>
      </div>

      {error && <div className="alert alert-danger mb-16">{error}</div>}
      {prefillError && <div className="alert alert-danger mb-16">Pre-fill error: {prefillError}</div>}
      {loading && <div className="loading">Loading line items…</div>}

      {rows.length > 0 && !loading && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 16, alignItems: 'start' }}>
          {/* Main table column */}
          <div>
            {/* Bulk operations */}
            <div className="card mb-16">
              <div className="card-body" style={{ padding: '10px 16px' }}>
                <div className="form-row" style={{ gap: 8 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 }}>
                    Bulk {selectedIds.size > 0 ? `(${selectedIds.size} selected)` : '(all unlocked)'}:
                  </span>
                  <input
                    type="number" min={0} max={100} step={1}
                    value={bulkPct}
                    onChange={e => setBulkPct(Number(e.target.value))}
                    style={{ width: 60 }}
                  />
                  <span style={{ fontSize: 12 }}>% cut</span>
                  <button className="btn btn-outline btn-sm" onClick={bulkApplyPct}>Apply Cut</button>
                  <select value={bulkTier} onChange={e => setBulkTier(e.target.value as PriorityTier)} style={{ width: 'auto' }}>
                    {TIERS.map(t => <option key={t}>{t}</option>)}
                  </select>
                  <button className="btn btn-ghost btn-sm" onClick={bulkSetTier}>Set Tier</button>
                  <button className="btn btn-ghost btn-sm" onClick={bulkZero}>Zero Out</button>
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
                    <button className="btn btn-danger btn-sm" onClick={resetToZero}>↓ Zero All</button>
                    <button className="btn btn-outline btn-sm" onClick={resetToBaseline}>↑ Restore</button>
                    <button
                      className="btn btn-outline btn-sm"
                      onClick={handlePrefill}
                      disabled={prefillLoading}
                      title="Pre-fill blank justification fields with Claude's recommended tier and analyst questions (30–60 seconds)"
                    >
                      {prefillLoading ? '⏳ Pre-filling…' : '✦ Pre-fill from Claude'}
                    </button>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-muted)', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={includeInsights}
                        onChange={e => setIncludeInsights(e.target.checked)}
                        style={{ cursor: 'pointer' }}
                      />
                      Append analysis
                    </label>
                    <button className="btn btn-gold btn-sm" onClick={handleExport} disabled={exporting}>
                      {exporting ? 'Exporting…' : '⬇ Export Word'}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Federal match warning */}
            {fedWarnings.length > 0 && (
              <div className="alert alert-danger mb-16">
                <strong>⚠ {fedWarnings.length} federal match item{fedWarnings.length !== 1 ? 's' : ''} have been cut &gt;10%.</strong>
                {' '}Federal matching funds may be affected. Verify before finalizing.
              </div>
            )}

            {/* Sandbox table */}
            <div className="card">
              <div className="card-header">
                <h3>{agencyName} — Line Items</h3>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{rows.length} items</span>
              </div>
              <div className="table-wrap">
                <table className="sandbox-table">
                  <thead>
                    <tr>
                      <th style={{ width: 30 }}>
                        <input type="checkbox" checked={selectedIds.size === rows.length && rows.length > 0}
                          onChange={toggleAll} style={{ width: 'auto' }} />
                      </th>
                      <th>☐</th>
                      <th>Line Item</th>
                      <th className="num">Current $</th>
                      <th className="num">Proposed $</th>
                      <th className="num">Delta</th>
                      <th className="num">Δ%</th>
                      <th>Priority</th>
                      <th>Justification</th>
                      <th>🔒</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(row => {
                      const delta = row.originalCents - row.justifiedCents
                      const pct = row.originalCents > 0 ? Math.round(delta * 100 / row.originalCents) : 0
                      return (
                        <tr key={row.lineItemId} className={`${row.locked ? 'locked' : ''}${row.justifiedCents === 0 ? ' row-flagged' : ''}`}
                          style={{ opacity: row.included ? 1 : 0.4 }}>
                          <td>
                            <input type="checkbox" checked={selectedIds.has(row.lineItemId)}
                              onChange={() => toggleSelect(row.lineItemId)} style={{ width: 'auto' }} />
                          </td>
                          <td>
                            <input type="checkbox" checked={row.included}
                              onChange={e => updateRow(row.lineItemId, { included: e.target.checked })}
                              style={{ width: 'auto' }} />
                          </td>
                          <td>
                            <div style={{ fontSize: 13, fontWeight: 500 }}>{row.description}</div>
                            {row.subsection && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{row.subsection}</div>}
                            {row.hasFederalMatch && <span className="fed-badge">FED</span>}
                            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                              p.{row.citation?.page_number}
                              <span className="cite-badge verified" style={{ marginLeft: 3 }}
                                title={`Source: ${row.citation?.source_doc} p.${row.citation?.page_number} · H.4025`}>✓</span>
                            </div>
                          </td>
                          <td className="num" style={{ whiteSpace: 'nowrap', fontSize: 13 }}>
                            {row.originalDisplay}
                            <span className="cite-badge verified" title="From SQLite — H.4025">✓</span>
                          </td>
                          <td className="num">
                            <input
                              type="number" min={0} step={1000}
                              value={Math.round(row.justifiedCents / 100)}
                              disabled={row.locked}
                              onChange={e => {
                                const d = parseInt(e.target.value, 10)
                                updateRow(row.lineItemId, { justifiedCents: isNaN(d) ? 0 : Math.max(0, d * 100) })
                              }}
                            />
                          </td>
                          <td className="num" style={{ color: delta > 0 ? 'var(--danger)' : delta < 0 ? 'var(--success)' : 'inherit', fontWeight: 600 }}>
                            {delta > 0 ? `−${fmtCents(delta)}` : delta < 0 ? `+${fmtCents(-delta)}` : '$0'}
                          </td>
                          <td className="num" style={{ color: pct > 0 ? 'var(--danger)' : 'inherit', fontSize: 12 }}>
                            {pct > 0 ? `−${pct}%` : pct < 0 ? `+${-pct}%` : '—'}
                          </td>
                          <td>
                            <select
                              value={row.priorityTier}
                              disabled={row.locked}
                              onChange={e => {
                                const t = e.target.value as PriorityTier
                                updateRow(row.lineItemId, {
                                  priorityTier: t,
                                  ...(t === 'Zero' ? { justifiedCents: 0 } : {}),
                                })
                              }}
                              style={{ width: 100 }}
                            >
                              {TIERS.map(t => <option key={t}>{t}</option>)}
                            </select>
                            <div className={`priority-badge ${row.priorityTier}`} style={{ marginTop: 3, display: 'block', textAlign: 'center', width: 100 }}>
                              {row.priorityTier}
                            </div>
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: 4, alignItems: 'flex-start' }}>
                              <textarea
                                value={row.justificationText}
                                onChange={e => updateRow(row.lineItemId, { justificationText: e.target.value })}
                                placeholder="Justification…"
                                rows={3}
                                style={{ flex: 1, minWidth: 180, minHeight: 60, fontSize: 11 }}
                              />
                              {row.description.includes('ALLOC') ? (
                                <span
                                  title="Allocation row — Part IB proviso conditions apply to the receiving program's section, not this entry"
                                  style={{ flexShrink: 0, fontSize: 10, padding: '4px 6px', color: 'var(--text-muted)', cursor: 'help' }}
                                >✦ N/A</span>
                              ) : (
                                <button
                                  className="btn btn-ghost btn-sm"
                                  title="Suggest from Part IB provisos"
                                  disabled={suggestingId === row.lineItemId}
                                  onClick={() => suggestJustification(row)}
                                  style={{ flexShrink: 0, fontSize: 10, padding: '4px 6px' }}
                                >
                                  {suggestingId === row.lineItemId ? '…' : '✦'}
                                </button>
                              )}
                            </div>
                          </td>
                          <td>
                            <button
                              className={`btn btn-sm ${row.locked ? 'btn-primary' : 'btn-ghost'}`}
                              onClick={() => updateRow(row.lineItemId, { locked: !row.locked })}
                              title={row.locked ? 'Unlock' : 'Lock (exclude from bulk ops)'}
                            >
                              {row.locked ? '🔒' : '🔓'}
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Summary sidebar */}
          <div style={{ position: 'sticky', top: 16 }}>
            <div className="card">
              <div className="card-header"><h3>Running Total</h3></div>
              <div className="card-body stack" style={{ gap: 14 }}>
                <div>
                  <div className="label">Current Appropriation</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--navy)', fontVariantNumeric: 'tabular-nums' }}>
                    {fmtCents(originalTotal)}
                    <span className="cite-badge verified" title="From SQLite — H.4025" style={{ marginLeft: 4 }}>✓</span>
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>FY2025-2026 enacted</div>
                </div>
                <div>
                  <div className="label">Proposed Total</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--gold)', fontVariantNumeric: 'tabular-nums' }}>
                    {fmtCents(justifiedTotal)}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>Arithmetic projection</div>
                </div>
                <div>
                  <div className="label">Variance</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: deltaTotal > 0 ? 'var(--danger)' : 'var(--success)', fontVariantNumeric: 'tabular-nums' }}>
                    {deltaTotal >= 0 ? `−${fmtCents(deltaTotal)}` : `+${fmtCents(-deltaTotal)}`}
                  </div>
                  {originalTotal > 0 && (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {deltaTotalPct}% {deltaTotal >= 0 ? 'reduction' : 'increase'}
                    </div>
                  )}
                </div>

                <hr style={{ borderColor: 'var(--border)' }} />

                {/* By tier */}
                <div>
                  <div className="label" style={{ marginBottom: 8 }}>By Priority Tier</div>
                  {TIERS.map(tier => {
                    const tierRows = includedRows.filter(r => r.priorityTier === tier)
                    if (!tierRows.length) return null
                    const tierTotal = tierRows.reduce((s, r) => s + r.justifiedCents, 0)
                    return (
                      <div key={tier} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                        <span className={`priority-badge ${tier}`}>{tier}</span>
                        <span style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>{fmtCents(tierTotal)}</span>
                      </div>
                    )
                  })}
                </div>

                {fedWarnings.length > 0 && (
                  <div className="alert alert-warn" style={{ fontSize: 11, padding: '8px 12px' }}>
                    ⚠ {fedWarnings.length} FED match item{fedWarnings.length !== 1 ? 's' : ''} cut
                  </div>
                )}

                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {includedRows.length} of {rows.length} items included
                </div>

                <button className="btn btn-gold" style={{ width: '100%' }}
                  onClick={handleExport} disabled={exporting || includedRows.length === 0}>
                  {exporting ? 'Exporting…' : '⬇ Export to Word'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
