import { useState, useEffect } from 'react'
import { marked } from 'marked'
import { api } from '../api'
import type { AgencySummary, AgencyDetail, LineItem, InsightsResponse } from '../types'

// Citation badge shown next to every dollar figure
function CiteBadge({ citation }: { citation: LineItem['citation'] }) {
  const tip = `Source: ${citation.source_doc} · Page ${citation.page_number} · Section ${citation.section} · ${citation.act}`
  return (
    <span className="cite-badge verified" title={tip}>✓</span>
  )
}

function AmountCell({ display, citation }: { display: string; citation: LineItem['citation'] }) {
  return (
    <span className="cited-amount">
      {display}
      <CiteBadge citation={citation} />
    </span>
  )
}

export default function AgencyExplorer() {
  const [agencies, setAgencies] = useState<AgencySummary[]>([])
  const [selected, setSelected] = useState('')
  const [detail, setDetail] = useState<AgencyDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')

  // Insights panel state
  const [rightPanel, setRightPanel] = useState<'provisos' | 'insights'>('provisos')
  const [insights, setInsights] = useState<InsightsResponse | null>(null)
  const [insightsLoading, setInsightsLoading] = useState(false)
  const [insightsError, setInsightsError] = useState('')

  useEffect(() => {
    api.agencies()
      .then(r => setAgencies([...r.agencies].sort((a, b) =>
        a.agency_name.localeCompare(b.agency_name)
      )))
      .catch(e => setError(e.message))
  }, [])

  const filtered = agencies.filter(a =>
    a.agency_name.toLowerCase().includes(search.toLowerCase()) ||
    a.section_number.toLowerCase().includes(search.toLowerCase())
  )

  function loadAgency(section: string) {
    if (!section) { setDetail(null); return }
    setSelected(section)
    setLoading(true)
    setError('')
    setInsights(null)
    setInsightsError('')
    setRightPanel('provisos')
    api.agency(section)
      .then(setDetail)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }

  function runInsights() {
    if (!selected) return
    setInsightsLoading(true)
    setInsightsError('')
    setRightPanel('insights')
    api.insights(selected)
      .then(r => { setInsights(r); setInsightsLoading(false) })
      .catch(e => { setInsightsError(e.message); setInsightsLoading(false) })
  }

  // Group line items by subsection
  function groupBySubsection(items: LineItem[]) {
    const groups: Map<string, LineItem[]> = new Map()
    for (const it of items) {
      const key = it.subsection ?? '—'
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(it)
    }
    return groups
  }

  return (
    <div className="stack">
      {/* Agency selector */}
      <div className="card">
        <div className="card-header">
          <h2>Agency Explorer</h2>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            FY2025-2026 · H.4025 · {agencies.length} agencies
          </span>
        </div>
        <div className="card-body">
          <div className="row" style={{ gap: 12 }}>
            <div style={{ flex: '0 0 220px' }}>
              <label>Search agencies</label>
              <input
                type="text"
                placeholder="Name or section number…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <div className="grow">
              <label>Select agency</label>
              <select
                value={selected}
                onChange={e => loadAgency(e.target.value)}
              >
                <option value="">— Choose an agency —</option>
                {filtered.map(a => (
                  <option key={a.section_number} value={a.section_number}>
                    §{a.section_number} · {a.agency_name} · {a.total_funds_display}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}
      {loading && <div className="loading">Loading agency data…</div>}

      {detail && !loading && (
        <div className="split-layout">
          {/* Left: line items */}
          <div className="stack">
            {/* Agency totals */}
            <div className="card">
              <div className="card-header">
                <div>
                  <h2>{detail.agency_name}</h2>
                  <span className="section-tag" style={{ marginTop: 4 }}>Section {detail.section_number}</span>
                </div>
                <button
                  className="btn btn-primary"
                  onClick={runInsights}
                  disabled={insightsLoading}
                  title="Run a full ZBB analyst report using Claude Sonnet — takes 30–60 seconds"
                  style={{ marginLeft: 'auto' }}
                >
                  {insightsLoading ? '⏳ Analyzing…' : '✦ Analyze with Claude'}
                </button>
              </div>
              <div className="card-body">
                <div className="stat-grid">
                  <div className="stat-card">
                    <div className="label">Total Funds</div>
                    <div className="value">{detail.totals.total_funds_display}</div>
                    <div className="sub cited-amount">
                      <CiteBadge citation={detail.totals.citation} />
                      {' '}Recapitulation
                    </div>
                  </div>
                  <div className="stat-card">
                    <div className="label">General Funds</div>
                    <div className="value">{detail.totals.general_funds_display}</div>
                    <div className="sub">State GF appropriation</div>
                  </div>
                  <div className="stat-card">
                    <div className="label">Other Funds</div>
                    <div className="value">{detail.totals.other_funds_display}</div>
                    <div className="sub">Federal + restricted</div>
                  </div>
                </div>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 10 }}>
                  {detail.data_note}
                </p>
              </div>
            </div>

            {/* Line items table */}
            <div className="card">
              <div className="card-header">
                <h2>Line Items</h2>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto' }}>
                  {detail.line_item_count} items · all cited
                </span>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Line Item</th>
                      <th className="num">General Funds</th>
                      <th className="num">Other Funds</th>
                      <th className="num">Total</th>
                      <th>Page</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const groups = groupBySubsection(detail.line_items)
                      const rows: JSX.Element[] = []
                      groups.forEach((items, sub) => {
                        if (sub !== '—') {
                          rows.push(
                            <tr key={`sub-${sub}`} className="subsection-header">
                              <td colSpan={5}>{sub}</td>
                            </tr>
                          )
                        }
                        items.forEach(it => {
                          rows.push(
                            <tr key={it.id}>
                              <td>
                                {it.description}
                                {it.has_federal_match && (
                                  <span className="fed-badge" title={it.federal_match_note ?? ''}>FED</span>
                                )}
                              </td>
                              <td className="num">
                                <AmountCell display={it.general_funds_display} citation={it.citation} />
                              </td>
                              <td className="num">
                                <AmountCell display={it.other_funds_display} citation={it.citation} />
                              </td>
                              <td className="num">
                                <AmountCell display={it.total_funds_display} citation={it.citation} />
                              </td>
                              <td>
                                <span className="page-tag"
                                  title={`${it.citation.source_doc} · Section ${it.citation.section} · ${it.citation.act}`}>
                                  p.{it.citation.page_number}
                                </span>
                              </td>
                            </tr>
                          )
                        })
                      })
                      return rows
                    })()}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Right: provisos / insights panel */}
          <div className="stack">
            <div className="card">
              <div className="card-header">
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className={`btn ${rightPanel === 'provisos' ? 'btn-primary' : 'btn-outline'}`}
                    style={{ fontSize: 12, padding: '4px 10px' }}
                    onClick={() => setRightPanel('provisos')}
                  >
                    Provisos
                  </button>
                  <button
                    className={`btn ${rightPanel === 'insights' ? 'btn-primary' : 'btn-outline'}`}
                    style={{ fontSize: 12, padding: '4px 10px' }}
                    onClick={() => { if (!insights && !insightsLoading) runInsights(); else setRightPanel('insights') }}
                  >
                    ✦ ZBB Analysis
                  </button>
                </div>
                {rightPanel === 'provisos' && (
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto' }}>
                    {detail.provisos.length > 0 ? `${detail.provisos.length} retrieved` : 'RAG not available'}
                  </span>
                )}
                {rightPanel === 'insights' && insights && (
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>
                    {insights.model} · {new Date(insights.generated_at).toLocaleTimeString()}
                  </span>
                )}
              </div>
              <div className="card-body">

                {/* Provisos tab */}
                {rightPanel === 'provisos' && (
                  detail.provisos.length === 0 ? (
                    <div className="alert alert-info">
                      Proviso text retrieval requires Phase 1C Pinecone ingestion to complete.
                    </div>
                  ) : (
                    <div className="proviso-panel">
                      {detail.provisos.map((p, i) => (
                        <div key={i} className="proviso-item">
                          <div className="proviso-meta">
                            <span className="proviso-score">Score: {p.score}</span>
                            <span className="proviso-src">
                              {p.source_doc} · p.{p.page_number}
                              {p.linked_section && ` · §${p.linked_section}`}
                            </span>
                          </div>
                          <p>{p.text}</p>
                        </div>
                      ))}
                    </div>
                  )
                )}

                {/* Insights tab */}
                {rightPanel === 'insights' && (
                  <>
                    {insightsLoading && (
                      <div style={{ textAlign: 'center', padding: '2rem 0', color: 'var(--text-muted)' }}>
                        <div className="loading" style={{ marginBottom: 8 }}>Running ZBB analysis…</div>
                        <p style={{ fontSize: 12 }}>Claude is reading all line items and provisos.<br />This takes 30–60 seconds.</p>
                      </div>
                    )}
                    {insightsError && (
                      <div className="alert alert-danger">{insightsError}</div>
                    )}
                    {insights && !insightsLoading && (
                      <>
                        <div
                          className="insights-body"
                          dangerouslySetInnerHTML={{ __html: marked.parse(insights.analysis) as string }}
                        />
                        <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                          {insights.data_note}
                        </p>
                      </>
                    )}
                    {!insights && !insightsLoading && !insightsError && (
                      <div style={{ textAlign: 'center', padding: '2rem 0', color: 'var(--text-muted)' }}>
                        <p>Click <strong>✦ Analyze with Claude</strong> above to run a full ZBB analyst report for this agency.</p>
                      </div>
                    )}
                  </>
                )}

              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
