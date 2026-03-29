import { useState, useEffect, useRef } from 'react'
import { api } from '../api'
import type { AgencySummary, ScenarioResponse } from '../types'

export default function ScenarioTab() {
  const [agencies, setAgencies] = useState<AgencySummary[]>([])
  const [selected, setSelected] = useState('')
  const [cutPct, setCutPct] = useState(10)
  const [result, setResult] = useState<ScenarioResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    api.agencies()
      .then(r => setAgencies([...r.agencies].sort((a, b) =>
        a.agency_name.localeCompare(b.agency_name)
      )))
      .catch(() => {})
  }, [])

  function runScenario(section: string, pct: number) {
    if (!section) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setLoading(true)
      setError('')
      api.scenario(section, pct)
        .then(setResult)
        .catch(e => { setError(e.message); setResult(null) })
        .finally(() => setLoading(false))
    }, 250)
  }

  function onAgencyChange(section: string) {
    setSelected(section)
    setResult(null)
    runScenario(section, cutPct)
  }

  function onSliderChange(pct: number) {
    setCutPct(pct)
    runScenario(selected, pct)
  }

  const hasFedWarnings = (result?.federal_match_warning_count ?? 0) > 0

  return (
    <div className="stack">
      {/* Controls */}
      <div className="card">
        <div className="card-header">
          <h2>Scenario Modeler</h2>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Integer arithmetic · No LLM · All figures cited from SQLite
          </span>
        </div>
        <div className="card-body">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <div>
              <label>Agency</label>
              <select value={selected} onChange={e => onAgencyChange(e.target.value)}>
                <option value="">— Select agency —</option>
                {agencies.map(a => (
                  <option key={a.section_number} value={a.section_number}>
                    §{a.section_number} · {a.agency_name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label>Cut Percentage — {cutPct}%</label>
              <div className="slider-wrap">
                <input
                  type="range"
                  min={0} max={100} step={1}
                  value={cutPct}
                  onChange={e => onSliderChange(Number(e.target.value))}
                  disabled={!selected}
                />
                <span className="slider-pct">{cutPct}%</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                Arithmetic: amount × {cutPct} ÷ 100 (integer floor, no floats)
              </div>
            </div>
          </div>
        </div>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}
      {loading && <div className="loading">Calculating…</div>}

      {result && !loading && (
        <>
          {/* Federal match warning */}
          {hasFedWarnings && (
            <div className="alert alert-danger">
              <div>
                <strong>⚠ Federal Match Warning — {result.federal_match_warning_count} flagged items</strong>
                {result.federal_match_warnings.map((w, i) => (
                  <div key={i} style={{ marginTop: 8 }}>
                    <strong>{w.line_item}</strong> — {w.other_funds_cut_display} other-funds cut<br/>
                    <span style={{ fontSize: 12 }}>{w.warning}</span>
                    {w.proviso_note && (
                      <details style={{ marginTop: 4, fontSize: 12 }}>
                        <summary>Proviso context</summary>
                        <pre style={{ whiteSpace: 'pre-wrap', marginTop: 4 }}>{w.proviso_note}</pre>
                      </details>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Summary cards */}
          <div className="stat-grid">
            <div className="stat-card">
              <div className="label">Current Total Funds</div>
              <div className="value">{result.summary.original_total_display}</div>
              <div className="sub">
                FY{result.fiscal_year} enacted ·
                <span className="cite-badge verified" style={{ marginLeft: 4 }}
                  title={`Source: ${result.summary.citation.source_doc} · Section ${result.summary.citation.section} · H.4025`}>✓</span>
              </div>
            </div>
            <div className="stat-card proposed">
              <div className="label">Proposed Total (−{result.cut_percentage}%)</div>
              <div className="value" style={{ color: 'var(--gold)' }}>{result.summary.proposed_total_display}</div>
            </div>
            <div className="stat-card cut">
              <div className="label">Total Cut</div>
              <div className="value" style={{ color: 'var(--danger)' }}>−{result.summary.total_cut_display}</div>
              <div className="sub">{result.cut_percentage}% of total</div>
            </div>
            <div className="stat-card">
              <div className="label">General Fund Current</div>
              <div className="value" style={{ fontSize: 18 }}>{result.summary.original_gf_display}</div>
            </div>
            <div className="stat-card proposed">
              <div className="label">General Fund Proposed</div>
              <div className="value" style={{ fontSize: 18, color: 'var(--gold)' }}>{result.summary.proposed_gf_display}</div>
            </div>
            <div className="stat-card cut">
              <div className="label">GF Cut</div>
              <div className="value" style={{ fontSize: 18, color: 'var(--danger)' }}>−{result.summary.gf_cut_display}</div>
            </div>
          </div>

          {/* Line-by-line delta table */}
          <div className="card">
            <div className="card-header">
              <h2>{result.agency_name} — Line-by-Line Impact</h2>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto' }}>
                {result.line_item_count} items
              </span>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Line Item</th>
                    <th className="num">Current Total</th>
                    <th className="num">Proposed Total</th>
                    <th className="num">Cut Amount</th>
                    <th>Current GF</th>
                    <th>Page</th>
                  </tr>
                </thead>
                <tbody>
                  {result.line_items.map(it => (
                    <tr key={it.id}>
                      <td>
                        {it.description}
                        {it.has_federal_match && <span className="fed-badge">FED</span>}
                        {it.subsection && (
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{it.subsection}</div>
                        )}
                      </td>
                      <td className="num">{it.original.total_display}</td>
                      <td className="num" style={{ color: 'var(--gold)' }}>{it.proposed.total_display}</td>
                      <td className="num delta-positive">
                        {it.delta.total_cents > 0 ? `−${it.delta.total_display}` : it.delta.total_display}
                      </td>
                      <td className="num">{it.original.general_funds_display}</td>
                      <td>
                        <span className="page-tag"
                          title={`${it.citation.source_doc} · Section ${it.citation.section} · ${it.citation.fiscal_year}`}>
                          p.{it.citation.page_number}
                          <span className="cite-badge verified" style={{ marginLeft: 3 }}>✓</span>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
