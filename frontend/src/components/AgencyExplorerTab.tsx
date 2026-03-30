import { useState, useEffect, useRef } from 'react'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts'
import { api } from '../api'
import type { AgencySummary, AgencyDetail, LineItem } from '../types'
import { useAgencyStatus, type AgencyStatus } from '../hooks/useAgencyStatus'

interface Props {
  agencies: AgencySummary[]
  initialSection?: string
  onOpenInSandbox: (section: string) => void
}

function fmtCents(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(cents / 100)
}

const STATUS_CYCLE: AgencyStatus[] = ['not-started', 'in-review', 'justified', 'flagged']
const STATUS_LABELS: Record<AgencyStatus, string> = {
  'not-started': '⬜ Not Started',
  'in-review':   '🔄 In Review',
  'justified':   '✅ Justified',
  'flagged':     '🔴 Flagged',
}

const SENSITIVITY_PCTS = [0, 5, 10, 15, 20, 25]

const FEDERAL_KEYWORDS = ['federal', 'fmap', 'medicaid', 'title', 'matching', 'cfda']

export default function AgencyExplorerTab({ agencies, initialSection, onOpenInSandbox }: Props) {
  const [search, setSearch] = useState('')
  const [selectedSection, setSelectedSection] = useState<string | null>(initialSection ?? null)
  const [detail, setDetail] = useState<AgencyDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [sortCol, setSortCol] = useState<'description' | 'gf' | 'other' | 'total' | 'page'>('total')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [expandedRowId, setExpandedRowId] = useState<number | null>(null)
  const [showProviso, setShowProviso] = useState(false)
  const [showSensitivity, setShowSensitivity] = useState(false)
  const [activeVizTab, setActiveVizTab] = useState<'bar' | 'sensitivity'>('bar')
  const [flaggedRows, setFlaggedRows] = useState<Set<number>>(new Set())
  const [copiedId, setCopiedId] = useState<number | null>(null)
  const prevSection = useRef<string | null>(null)

  const { status, setStatus, getEmoji } = useAgencyStatus()

  // Load initial section
  useEffect(() => {
    if (initialSection && initialSection !== prevSection.current) {
      prevSection.current = initialSection
      setSelectedSection(initialSection)
    }
  }, [initialSection])

  useEffect(() => {
    if (!selectedSection) return
    setLoading(true)
    setDetail(null)
    api.agency(selectedSection)
      .then(setDetail)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [selectedSection])

  const filtered = agencies.filter(a =>
    !search || a.agency_name.toLowerCase().includes(search.toLowerCase()) || a.section_number.includes(search)
  )

  function sort(items: LineItem[]): LineItem[] {
    return [...items].sort((a, b) => {
      let va: number | string, vb: number | string
      switch (sortCol) {
        case 'gf':    va = a.general_funds_cents;  vb = b.general_funds_cents;  break
        case 'other': va = a.other_funds_cents;    vb = b.other_funds_cents;    break
        case 'total': va = a.total_funds_cents;    vb = b.total_funds_cents;    break
        case 'page':  va = a.citation?.page_number ?? 0; vb = b.citation?.page_number ?? 0; break
        default:      va = a.description.toLowerCase(); vb = b.description.toLowerCase()
      }
      if (va < vb) return sortDir === 'asc' ? -1 : 1
      if (va > vb) return sortDir === 'asc' ? 1 : -1
      return 0
    })
  }

  function toggleSort(col: typeof sortCol) {
    if (col === sortCol) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('desc') }
  }

  function cycleStatus(section: string) {
    const cur = status[section] ?? 'not-started'
    const idx = STATUS_CYCLE.indexOf(cur)
    setStatus(section, STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length])
  }

  function exportCSV() {
    if (!detail) return
    const rows = [
      ['Section', 'Description', 'Subsection', 'GF', 'Other', 'Total', 'Federal Match', 'Page'],
      ...detail.line_items.map(li => [
        detail.section_number, li.description, li.subsection ?? '',
        li.general_funds_display, li.other_funds_display, li.total_funds_display,
        li.has_federal_match ? 'YES' : 'NO', li.citation?.page_number ?? '',
      ])
    ]
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `${detail.section_number}-line-items.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  async function copyProviso(text: string, id: number) {
    await navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const sel = agencies.find(a => a.section_number === selectedSection)
  const sortedItems = detail ? sort(detail.line_items) : []

  const barData = detail ? detail.line_items.slice(0, 30).map(li => ({
    name: li.description.slice(0, 20),
    gf: li.general_funds_cents / 100,
    other: li.other_funds_cents / 100,
  })) : []

  function SortArrow({ col }: { col: typeof sortCol }) {
    if (sortCol !== col) return <span style={{ opacity: .3 }}>↕</span>
    return <span>{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  return (
    <div className="split-layout" style={{ gap: 0, minHeight: 0 }}>
      {/* Left panel */}
      <div className="left-panel">
        <div className="panel-search">
          <input
            type="text"
            placeholder="Search agencies…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: '100%' }}
          />
        </div>
        {filtered.map(a => {
          const gfPct = a.total_funds_cents > 0 ? Math.round(a.general_funds_cents * 100 / a.total_funds_cents) : 0
          const s = status[a.section_number] ?? 'not-started'
          return (
            <div
              key={a.section_number}
              className={`agency-list-item${selectedSection === a.section_number ? ' active' : ''}`}
              onClick={() => setSelectedSection(a.section_number)}
            >
              <div className="name">{a.agency_name}</div>
              <div className="meta">
                <span className="section-number">{a.section_number}</span>
                <span>{a.total_funds_display}</span>
                <button
                  className={`status-badge ${s}`}
                  onClick={e => { e.stopPropagation(); cycleStatus(a.section_number) }}
                  title="Click to cycle status"
                >
                  {getEmoji(s)}
                </button>
              </div>
              <div style={{ marginTop: 4 }}>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', marginRight: 4 }}>GF {gfPct}%</span>
                <span className="gf-bar-mini">
                  <span className="gf-bar-mini-fill" style={{ width: `${gfPct}%` }} />
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Main panel */}
      <div style={{ padding: 20, overflowY: 'auto' }}>
        {!selectedSection && (
          <div className="empty">Select an agency from the left panel to view details.</div>
        )}

        {loading && <div className="loading">Loading agency data…</div>}

        {detail && sel && (
          <>
            {/* Agency header */}
            <div style={{ marginBottom: 20 }}>
              <div className="row between" style={{ flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--navy)' }}>{detail.agency_name}</h2>
                  <div className="row" style={{ gap: 8, marginTop: 6 }}>
                    <span className="section-tag">{detail.section_number}</span>
                    <span className="page-tag">FY{detail.fiscal_year}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{detail.line_item_count} line items</span>
                  </div>
                </div>
                <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                  <select
                    value={status[detail.section_number] ?? 'not-started'}
                    onChange={e => setStatus(detail.section_number, e.target.value as AgencyStatus)}
                    style={{ fontSize: 12, padding: '5px 8px', width: 'auto' }}
                  >
                    {STATUS_CYCLE.map(s => (
                      <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                    ))}
                  </select>
                  <button className="btn btn-primary btn-sm" onClick={() => onOpenInSandbox(detail.section_number)}>
                    Open in Sandbox
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={exportCSV}>
                    Export CSV
                  </button>
                </div>
              </div>

              {/* Stat pills */}
              <div className="row" style={{ gap: 12, marginTop: 14, flexWrap: 'wrap' }}>
                {[
                  { label: 'Total Funds', val: detail.totals.total_funds_display },
                  { label: 'General Funds', val: detail.totals.general_funds_display },
                  { label: 'Other / Federal', val: detail.totals.other_funds_display },
                ].map(p => (
                  <div key={p.label} style={{ background: 'var(--light-blue)', padding: '8px 14px', borderRadius: 8 }}>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 2 }}>{p.label}</div>
                    <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--navy)' }}>
                      {p.val}
                      <span className="cite-badge verified" title={`Source: ${detail.totals.citation?.source_doc} p.${detail.totals.citation?.page_number}`}>✓</span>
                    </div>
                  </div>
                ))}
                {/* Donut GF% */}
                {(() => {
                  const gfPct = detail.totals.total_funds_cents > 0
                    ? Math.round(detail.totals.general_funds_cents * 100 / detail.totals.total_funds_cents)
                    : 0
                  const r = 20
                  const circ = 2 * Math.PI * r
                  const dash = circ * gfPct / 100
                  return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <svg width="50" height="50" viewBox="0 0 50 50">
                        <circle cx="25" cy="25" r={r} fill="none" stroke="var(--border)" strokeWidth="6" />
                        <circle cx="25" cy="25" r={r} fill="none" stroke="var(--navy)" strokeWidth="6"
                          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" transform="rotate(-90 25 25)" />
                        <text x="25" y="29" textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--navy)">{gfPct}%</text>
                      </svg>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>GF</span>
                    </div>
                  )
                })()}
              </div>

              {detail.data_note && (
                <div className="alert alert-info" style={{ marginTop: 12, fontSize: 12 }}>{detail.data_note}</div>
              )}
            </div>

            {/* Viz tab strip */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
              <button className={`btn btn-sm ${activeVizTab === 'bar' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setActiveVizTab('bar')}>Bar Chart</button>
              <button className={`btn btn-sm ${activeVizTab === 'sensitivity' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setActiveVizTab('sensitivity')}>Sensitivity</button>
            </div>

            {activeVizTab === 'bar' && (
              <div className="card mb-16">
                <div className="card-header"><h3>Line Items — GF vs Other</h3></div>
                <div className="card-body" style={{ padding: '12px 4px' }}>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={barData} layout="vertical" margin={{ left: 8, right: 20, top: 4, bottom: 4 }}>
                      <XAxis type="number" tickFormatter={v => `$${(v/1e6).toFixed(0)}M`} tick={{ fontSize: 10 }} />
                      <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 10 }} />
                      <Tooltip formatter={(v: number) => [fmtCents(v * 100), '']} />
                      <Bar dataKey="gf" name="General Funds" stackId="a" fill="#1B2F5E" />
                      <Bar dataKey="other" name="Other Funds" stackId="a" fill="#C9963A" radius={[0, 3, 3, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {activeVizTab === 'sensitivity' && (
              <div className="card mb-16">
                <div className="card-header">
                  <h3>Sensitivity — Cut Scenarios</h3>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Arithmetic only — verify before use</span>
                </div>
                <div className="card-body">
                  <div className="table-wrap">
                    <table className="sensitivity-table">
                      <thead>
                        <tr>
                          <th>Fund</th>
                          {SENSITIVITY_PCTS.map(p => <th key={p}>{p}% cut</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          { label: 'Total', cents: detail.totals.total_funds_cents },
                          { label: 'General Funds', cents: detail.totals.general_funds_cents },
                          { label: 'Other', cents: detail.totals.other_funds_cents },
                        ].map(row => (
                          <tr key={row.label}>
                            <td>{row.label}</td>
                            {SENSITIVITY_PCTS.map(p => (
                              <td key={p} style={{ color: p > 0 ? 'var(--danger)' : 'inherit' }}>
                                {fmtCents(Math.floor(row.cents * (100 - p) / 100))}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* Line items table */}
            <div className="card mb-16">
              <div className="card-header">
                <h3>Line Items</h3>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{detail.line_item_count} items</span>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th style={{ cursor: 'pointer' }} onClick={() => toggleSort('description')}>
                        Description <SortArrow col="description" />
                      </th>
                      <th className="num" style={{ cursor: 'pointer' }} onClick={() => toggleSort('gf')}>
                        General Funds <SortArrow col="gf" />
                      </th>
                      <th className="num" style={{ cursor: 'pointer' }} onClick={() => toggleSort('other')}>
                        Other Funds <SortArrow col="other" />
                      </th>
                      <th className="num" style={{ cursor: 'pointer' }} onClick={() => toggleSort('total')}>
                        Total <SortArrow col="total" />
                      </th>
                      <th style={{ cursor: 'pointer' }} onClick={() => toggleSort('page')}>
                        Page <SortArrow col="page" />
                      </th>
                      <th>Flag</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedItems.map(li => (
                      <>
                        <tr
                          key={li.id}
                          className={flaggedRows.has(li.id) ? 'row-flagged' : ''}
                          style={{ cursor: 'pointer' }}
                          onClick={() => setExpandedRowId(expandedRowId === li.id ? null : li.id)}
                        >
                          <td>
                            <div style={{ fontWeight: 500 }}>{li.description}</div>
                            {li.subsection && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{li.subsection}</div>}
                            {li.has_federal_match && <span className="fed-badge">FED</span>}
                          </td>
                          <td className="num">
                            {li.general_funds_display}
                            <span
                              className="cite-badge verified"
                              title={`Source: ${li.citation?.source_doc} p.${li.citation?.page_number}`}
                            >✓</span>
                          </td>
                          <td className="num">{li.other_funds_display}</td>
                          <td className="num">{li.total_funds_display}</td>
                          <td className="page-tag">{li.citation?.page_number ?? '—'}</td>
                          <td>
                            <button
                              className={`btn btn-sm ${flaggedRows.has(li.id) ? 'btn-danger' : 'btn-ghost'}`}
                              onClick={e => {
                                e.stopPropagation()
                                setFlaggedRows(prev => {
                                  const n = new Set(prev)
                                  n.has(li.id) ? n.delete(li.id) : n.add(li.id)
                                  return n
                                })
                              }}
                            >
                              {flaggedRows.has(li.id) ? '🔴' : '⚑'}
                            </button>
                          </td>
                        </tr>
                        {expandedRowId === li.id && (
                          <tr key={`${li.id}-expand`}>
                            <td colSpan={6} className="row-expand">
                              {li.federal_match_note && (
                                <div className="alert alert-warn" style={{ marginBottom: 8 }}>
                                  <strong>Federal Match Note:</strong> {li.federal_match_note}
                                </div>
                              )}
                              <div>
                                <strong>Source:</strong> {li.citation?.source_doc}, page {li.citation?.page_number}
                              </div>
                              <div style={{ marginTop: 4 }}>
                                <strong>Extraction confidence:</strong> {li.extraction_confidence}
                              </div>
                              {/* Related provisos */}
                              {detail.provisos.filter(p => p.linked_section === detail.section_number).slice(0, 2).map((p, i) => (
                                <div key={i} className="proviso-card" style={{ marginTop: 10 }}>
                                  <div className="proviso-meta">
                                    <span className="proviso-score">{(p.score * 100).toFixed(0)}%</span>
                                    <span>{p.source_doc} {p.page_number ? `p.${p.page_number}` : ''}</span>
                                  </div>
                                  <div>{p.text.slice(0, 300)}{p.text.length > 300 ? '…' : ''}</div>
                                </div>
                              ))}
                            </td>
                          </tr>
                        )}
                      </>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Proviso panel */}
            {detail.provisos.length > 0 && (
              <div className="card">
                <div className="card-header">
                  <h3>Provisos ({detail.provisos.length})</h3>
                  <button className="collapse-toggle" onClick={() => setShowProviso(p => !p)}>
                    {showProviso ? '▲ Hide' : '▼ Show'}
                  </button>
                </div>
                {showProviso && (
                  <div className="card-body">
                    {detail.provisos.map((p, i) => {
                      const isFed = FEDERAL_KEYWORDS.some(kw => p.text.toLowerCase().includes(kw))
                      return (
                        <div key={i} className={`proviso-card${isFed ? ' federal' : ''}`}>
                          <div className="proviso-meta">
                            <span className="proviso-score">{(p.score * 100).toFixed(0)}%</span>
                            <span>{p.source_doc}{p.page_number ? ` p.${p.page_number}` : ''}</span>
                            {isFed && <span className="fed-badge">FED</span>}
                          </div>
                          <p style={{ marginBottom: 8 }}>{p.text}</p>
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => copyProviso(p.text, i)}
                          >
                            {copiedId === i ? '✓ Copied' : 'Copy for justification'}
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
