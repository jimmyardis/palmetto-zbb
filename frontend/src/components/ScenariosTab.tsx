import { useState } from 'react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell, ReferenceLine,
} from 'recharts'
import type { AgencySummary } from '../types'
import { useScenarios } from '../hooks/useScenarios'
import type { SavedScenario } from '../hooks/useScenarios'
import { api } from '../api'

interface Props {
  agencies: AgencySummary[]
}

function fmtCents(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(cents / 100)
}

function fmtAbbrev(cents: number): string {
  const d = cents / 100
  if (Math.abs(d) >= 1e9) return `$${(d / 1e9).toFixed(1)}B`
  if (Math.abs(d) >= 1e6) return `$${(d / 1e6).toFixed(0)}M`
  return `$${(d / 1e3).toFixed(0)}K`
}

export default function ScenariosTab({ agencies }: Props) {
  const { scenarios, deleteScenario } = useScenarios()
  const [slotA, setSlotA] = useState('')
  const [slotB, setSlotB] = useState('')
  const [slotC, setSlotC] = useState('')
  const [exporting, setExporting] = useState<string | null>(null)

  function getScenario(id: string): SavedScenario | null {
    return scenarios.find(s => s.id === id) ?? null
  }

  const sA = slotA ? getScenario(slotA) : null
  const sB = slotB ? getScenario(slotB) : null
  const sC = slotC ? getScenario(slotC) : null
  const active = [sA, sB, sC].filter(Boolean) as SavedScenario[]

  // Build comparison rows — union of all agency sections across active scenarios
  const sections = [...new Set(active.map(s => s.agencySection))]
  const agencyMap = new Map(agencies.map(a => [a.section_number, a]))

  const comparisonRows = sections.map(sec => {
    const baseline = agencyMap.get(sec)
    const baselineCents = baseline?.total_funds_cents ?? 0
    return {
      sec,
      name: baseline?.agency_name ?? sec,
      baselineCents,
      baselineDisplay: baseline?.total_funds_display ?? '—',
      a: computeScenarioCents(sA, sec),
      b: computeScenarioCents(sB, sec),
      c: computeScenarioCents(sC, sec),
    }
  })

  function computeScenarioCents(s: SavedScenario | null, section: string): number | null {
    if (!s || s.agencySection !== section) return null
    return s.rows.filter(r => r.included).reduce((sum, r) => sum + r.justifiedCents, 0)
  }

  // Waterfall data: deltas for scenario A (or first active)
  const primary = sA ?? sB ?? sC
  const waterfallData = primary
    ? (() => {
        const sec = primary.agencySection
        const baseline = agencyMap.get(sec)?.total_funds_cents ?? 0
        const proposed = primary.rows.filter(r => r.included).reduce((s, r) => s + r.justifiedCents, 0)
        const deltas = primary.rows
          .filter(r => r.included && r.justifiedCents !== r.originalCents)
          .map(r => ({ name: r.description.slice(0, 24), delta: r.justifiedCents - r.originalCents }))
          .sort((a, b) => a.delta - b.delta)
          .slice(0, 15)
        return { sec, baseline, proposed, deltas }
      })()
    : null

  // What changed
  const fedWarnings = primary
    ? primary.rows.filter(r => r.hasFederalMatch && r.justifiedCents < r.originalCents * 0.9)
    : []
  const mandatedCuts = primary
    ? primary.rows.filter(r => r.priorityTier === 'Mandated' && r.justifiedCents < r.originalCents)
    : []
  const topCuts = primary
    ? [...primary.rows]
        .filter(r => r.justifiedCents < r.originalCents)
        .sort((a, b) => (b.originalCents - b.justifiedCents) - (a.originalCents - a.justifiedCents))
        .slice(0, 10)
    : []

  async function exportScenario(s: SavedScenario) {
    setExporting(s.id)
    try {
      const { blob, name } = await api.exportDocx(
        s.agencyName, s.agencySection,
        s.rows.filter(r => r.included).map(r => ({
          line_item_id: r.lineItemId,
          justified_amount_cents: r.justifiedCents,
          justification_text: r.justificationText || '(No justification provided)',
          priority_tier: r.priorityTier === 'Zero' ? 'Low' : r.priorityTier as 'Mandated' | 'High' | 'Medium' | 'Low',
        }))
      )
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = name; a.click()
      URL.revokeObjectURL(url)
    } catch { /* silent */ } finally {
      setExporting(null)
    }
  }

  function exportCSV() {
    const header = ['Section', 'Agency', 'Baseline', ...active.map(s => s.name), ...active.map(s => `${s.name} Delta`)]
    const rows = comparisonRows.map(r => [
      r.sec, r.name, r.baselineDisplay,
      ...([r.a, r.b, r.c].slice(0, active.length).map(v => v !== null ? fmtCents(v) : '—')),
      ...([r.a, r.b, r.c].slice(0, active.length).map(v =>
        v !== null ? fmtCents(v - r.baselineCents) : '—'
      )),
    ])
    const csv = [header, ...rows].map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'scenario-comparison.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  if (scenarios.length === 0) {
    return (
      <div className="card">
        <div className="card-body" style={{ textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: 32, marginBottom: 16 }}>📋</div>
          <h3 style={{ marginBottom: 8, color: 'var(--navy)' }}>No saved scenarios yet</h3>
          <p style={{ color: 'var(--text-muted)', maxWidth: 400, margin: '0 auto 20px' }}>
            Go to <strong>ZBB Sandbox</strong>, load an agency, make your adjustments, and click <strong>Save Scenario</strong>.
            Then return here to compare scenarios side by side.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="stack">
      {/* Scenario selector */}
      <div className="card">
        <div className="card-header"><h3>Compare Scenarios (up to 3)</h3></div>
        <div className="card-body">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            {[
              { label: 'Scenario A', val: slotA, set: setSlotA },
              { label: 'Scenario B', val: slotB, set: setSlotB },
              { label: 'Scenario C', val: slotC, set: setSlotC },
            ].map(slot => (
              <div key={slot.label}>
                <label>{slot.label}</label>
                <select value={slot.val} onChange={e => slot.set(e.target.value)}>
                  <option value="">— None —</option>
                  {scenarios.map(s => (
                    <option key={s.id} value={s.id}>{s.name} ({s.agencyName})</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Saved scenarios list */}
      <div className="card">
        <div className="card-header">
          <h3>Saved Scenarios ({scenarios.length})</h3>
          <button className="btn btn-ghost btn-sm" onClick={exportCSV} disabled={active.length === 0}>
            Export CSV
          </button>
        </div>
        <div className="card-body">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
            {scenarios.map(s => {
              const total = s.rows.filter(r => r.included).reduce((sum, r) => sum + r.justifiedCents, 0)
              const orig = s.rows.filter(r => r.included).reduce((sum, r) => sum + r.originalCents, 0)
              const cut = orig - total
              return (
                <div key={s.id} className="scenario-card">
                  <div style={{ fontWeight: 700, color: 'var(--navy)', marginBottom: 4 }}>{s.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
                    {s.agencyName} · {new Date(s.createdAt).toLocaleDateString()}
                  </div>
                  <div style={{ fontSize: 13 }}>
                    <span style={{ color: 'var(--text-muted)' }}>Baseline: </span>{fmtCents(orig)}
                  </div>
                  <div style={{ fontSize: 13 }}>
                    <span style={{ color: 'var(--text-muted)' }}>Proposed: </span>
                    <strong style={{ color: 'var(--gold)' }}>{fmtCents(total)}</strong>
                  </div>
                  {cut > 0 && (
                    <div style={{ fontSize: 13, color: 'var(--danger)', fontWeight: 600 }}>
                      −{fmtCents(cut)} ({orig > 0 ? Math.round(cut * 100 / orig) : 0}% cut)
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                    <button className="btn btn-primary btn-sm" onClick={() => exportScenario(s)} disabled={exporting === s.id}>
                      {exporting === s.id ? 'Exporting…' : '⬇ Word'}
                    </button>
                    <button className="btn btn-danger btn-sm" onClick={() => deleteScenario(s.id)}>Delete</button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Comparison table */}
      {active.length > 0 && comparisonRows.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h3>Comparison Table</h3>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              Baseline from SQLite <span className="cite-badge verified">✓</span> · Scenario values are analyst proposals
            </span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Agency</th>
                  <th className="num">Baseline</th>
                  {sA && <th className="num">{sA.name}</th>}
                  {sA && <th className="num">Δ vs Baseline</th>}
                  {sB && <th className="num">{sB.name}</th>}
                  {sB && <th className="num">Δ vs Baseline</th>}
                  {sC && <th className="num">{sC.name}</th>}
                  {sC && <th className="num">Δ vs Baseline</th>}
                </tr>
              </thead>
              <tbody>
                {comparisonRows.map(row => (
                  <tr key={row.sec}>
                    <td>
                      <span className="section-tag" style={{ marginRight: 6 }}>{row.sec}</span>
                      {row.name}
                    </td>
                    <td className="num">
                      {row.baselineDisplay}
                      <span className="cite-badge verified" style={{ marginLeft: 3 }}>✓</span>
                    </td>
                    {[row.a, row.b, row.c].slice(0, active.length).flatMap((v, i) => {
                      if (v === null) return [<td key={`v${i}`} className="num">—</td>, <td key={`d${i}`} className="num">—</td>]
                      const delta = v - row.baselineCents
                      const isOver = delta > 0
                      const isCut = delta < 0
                      return [
                        <td key={`v${i}`} className="num">{fmtCents(v)}</td>,
                        <td key={`d${i}`} className="num"
                          style={{ color: isOver ? 'var(--success)' : isCut ? 'var(--danger)' : 'inherit', fontWeight: delta !== 0 ? 600 : 400 }}>
                          {delta === 0 ? '—' : `${delta > 0 ? '+' : '−'}${fmtCents(Math.abs(delta))}`}
                        </td>
                      ]
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Waterfall chart */}
      {waterfallData && waterfallData.deltas.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h3>
              {primary!.name} — Line Item Changes
            </h3>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {waterfallData.sec} · {agencyMap.get(waterfallData.sec)?.agency_name}
            </span>
          </div>
          <div className="card-body" style={{ padding: '12px 4px' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '0 16px 8px' }}>
              Baseline: {fmtCents(waterfallData.baseline)} →
              Proposed: <strong style={{ color: 'var(--gold)' }}>{fmtCents(waterfallData.proposed)}</strong>
              &nbsp;({waterfallData.baseline > 0 ? `${Math.round((waterfallData.baseline - waterfallData.proposed) * 100 / waterfallData.baseline)}%` : ''} change)
            </div>
            <ResponsiveContainer width="100%" height={Math.max(200, waterfallData.deltas.length * 28)}>
              <BarChart
                data={waterfallData.deltas}
                layout="vertical"
                margin={{ left: 8, right: 48, top: 4, bottom: 4 }}
              >
                <XAxis type="number" tickFormatter={v => fmtAbbrev(v * 100)} tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="name" width={170} tick={{ fontSize: 10 }} />
                <Tooltip
                  formatter={(v: number) => [fmtCents(Math.abs(v * 100)), v < 0 ? 'Cut' : 'Increase']}
                />
                <ReferenceLine x={0} stroke="#ccc" />
                <Bar dataKey="delta">
                  {waterfallData.deltas.map((entry, i) => (
                    <Cell key={i} fill={entry.delta < 0 ? '#1B2F5E' : '#C9963A'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* What changed */}
      {primary && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div className="card">
            <div className="card-header"><h3>Top 10 Cuts</h3></div>
            <div className="card-body" style={{ padding: 0 }}>
              {topCuts.length === 0 ? (
                <div className="empty" style={{ padding: 20 }}>No cuts in this scenario</div>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Line Item</th>
                      <th className="num">Cut</th>
                      <th className="num">Δ%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topCuts.map(r => {
                      const cut = r.originalCents - r.justifiedCents
                      const pct = r.originalCents > 0 ? Math.round(cut * 100 / r.originalCents) : 0
                      return (
                        <tr key={r.lineItemId}>
                          <td style={{ fontSize: 12 }}>
                            {r.description.slice(0, 32)}{r.description.length > 32 ? '…' : ''}
                            {r.hasFederalMatch && <span className="fed-badge" style={{ marginLeft: 4 }}>FED</span>}
                          </td>
                          <td className="num" style={{ color: 'var(--danger)', fontWeight: 600, fontSize: 12 }}>−{fmtCents(cut)}</td>
                          <td className="num" style={{ color: 'var(--danger)', fontSize: 12 }}>−{pct}%</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-header"><h3>Warnings</h3></div>
            <div className="card-body stack" style={{ gap: 12 }}>
              {fedWarnings.length > 0 ? (
                <div className="alert alert-warn">
                  <strong>⚠ {fedWarnings.length} federal match item{fedWarnings.length !== 1 ? 's' : ''} cut &gt;10%</strong>
                  {fedWarnings.map(r => (
                    <div key={r.lineItemId} style={{ fontSize: 12, marginTop: 4 }}>· {r.description}</div>
                  ))}
                </div>
              ) : (
                <div className="alert alert-success">✓ No federal match items cut more than 10%</div>
              )}
              {mandatedCuts.length > 0 && (
                <div className="alert alert-danger">
                  <strong>⚠ {mandatedCuts.length} Mandated item{mandatedCuts.length !== 1 ? 's' : ''} reduced</strong>
                  {mandatedCuts.map(r => (
                    <div key={r.lineItemId} style={{ fontSize: 12, marginTop: 4 }}>· {r.description}</div>
                  ))}
                </div>
              )}
              {fedWarnings.length === 0 && mandatedCuts.length === 0 && (
                <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No critical warnings for this scenario.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
