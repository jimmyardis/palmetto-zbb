import { useState } from 'react'
import {
  ResponsiveContainer, Treemap, BarChart, Bar, XAxis, YAxis,
  Tooltip, Legend, Cell,
} from 'recharts'
import type { AgencySummary } from '../types'
import { useAgencyStatus } from '../hooks/useAgencyStatus'

interface Props {
  agencies: AgencySummary[]
  onNavigateToAgency: (section: string) => void
}

function fmtCents(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(cents / 100)
}

function fmtAbbrev(cents: number): string {
  const dollars = cents / 100
  if (dollars >= 1e9) return `$${(dollars / 1e9).toFixed(1)}B`
  if (dollars >= 1e6) return `$${(dollars / 1e6).toFixed(0)}M`
  return `$${(dollars / 1e3).toFixed(0)}K`
}

function gfColor(gfPct: number): string {
  // Interpolate #E8EDF7 → #1B2F5E
  const t = Math.max(0, Math.min(1, gfPct))
  const r = Math.round(0xe8 + (0x1B - 0xe8) * t)
  const g = Math.round(0xed + (0x2F - 0xed) * t)
  const b = Math.round(0xf7 + (0x5E - 0xf7) * t)
  return `rgb(${r},${g},${b})`
}

interface TreemapContentProps {
  x?: number; y?: number; width?: number; height?: number
  name?: string; size?: number; gfPct?: number; section?: string
}

function TreemapContent({ x = 0, y = 0, width = 0, height = 0, name = '', size = 0, gfPct = 0, section: _s = '' }: TreemapContentProps) {
  const fill = gfColor(gfPct)
  const textColor = gfPct > 0.5 ? '#fff' : '#1B2F5E'
  const showLabel = width > 60 && height > 30
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} fill={fill} stroke="#fff" strokeWidth={1} />
      {showLabel && (
        <>
          <text x={x + width / 2} y={y + height / 2 - 6} textAnchor="middle" fontSize={11} fill={textColor} fontWeight={600}>
            {name.length > 18 ? name.slice(0, 16) + '…' : name}
          </text>
          {height > 45 && (
            <text x={x + width / 2} y={y + height / 2 + 10} textAnchor="middle" fontSize={10} fill={textColor} opacity={0.8}>
              {fmtAbbrev(size)}
            </text>
          )}
        </>
      )}
    </g>
  )
}

const STATUS_CYCLE = ['not-started', 'in-review', 'justified', 'flagged'] as const

export default function OverviewTab({ agencies, onNavigateToAgency }: Props) {
  const [treemapMode, setTreemapMode] = useState<'total' | 'gf'>('total')
  const [showAllAgencies, setShowAllAgencies] = useState(false)
  const { status, setStatus, getEmoji, summary } = useAgencyStatus()

  const totalCents = agencies.reduce((s, a) => s + a.total_funds_cents, 0)
  const gfCents    = agencies.reduce((s, a) => s + a.general_funds_cents, 0)
  const otherCents = totalCents - gfCents

  const top20 = [...agencies]
    .sort((a, b) => b.total_funds_cents - a.total_funds_cents)
    .slice(0, 20)

  const barData = top20.map(a => ({
    name: a.agency_name.slice(0, 22),
    section: a.section_number,
    gf: a.general_funds_cents / 100,
    other: a.other_funds_cents / 100,
    total: a.total_funds_cents / 100,
  }))

  const treemapData = agencies.map(a => ({
    name: a.agency_name,
    section: a.section_number,
    size: treemapMode === 'total' ? a.total_funds_cents : a.general_funds_cents,
    gf: a.general_funds_cents,
    other: a.other_funds_cents,
    gfPct: a.total_funds_cents > 0 ? a.general_funds_cents / a.total_funds_cents : 0,
  }))

  const sessionAgencies = agencies.slice(0, showAllAgencies ? agencies.length : 10)
  const reviewed = Object.values(status).filter(v => v !== 'not-started').length + summary.justified

  function cycleStatus(section: string) {
    const cur = status[section] ?? 'not-started'
    const idx = STATUS_CYCLE.indexOf(cur)
    const next = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length]
    setStatus(section, next)
  }

  return (
    <div>
      {/* Stat cards */}
      <div className="stat-grid">
        <div className="stat-card">
          <div className="label">Total Budget</div>
          <div className="value" style={{ fontSize: 22 }}>{fmtCents(totalCents)}</div>
          <div className="sub">All funds — arithmetic from extracted data</div>
        </div>
        <div className="stat-card">
          <div className="label">General Funds</div>
          <div className="value" style={{ fontSize: 22 }}>{fmtCents(gfCents)}</div>
          <div className="sub">{totalCents > 0 ? Math.round(gfCents * 100 / totalCents) : 0}% of total</div>
        </div>
        <div className="stat-card">
          <div className="label">Other / Federal</div>
          <div className="value" style={{ fontSize: 22 }}>{fmtCents(otherCents)}</div>
          <div className="sub">{totalCents > 0 ? Math.round(otherCents * 100 / totalCents) : 0}% of total</div>
        </div>
        <div className="stat-card">
          <div className="label">Agencies</div>
          <div className="value">{agencies.length}</div>
          <div className="sub">Part IA · H.4025</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 16 }}>
        {/* Charts column */}
        <div className="stack">
          {/* Treemap */}
          <div className="card">
            <div className="card-header">
              <h3>Budget Treemap — All Agencies</h3>
              <div className="form-row" style={{ marginBottom: 0 }}>
                <button
                  className={`btn btn-sm ${treemapMode === 'total' ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setTreemapMode('total')}
                >Total Funds</button>
                <button
                  className={`btn btn-sm ${treemapMode === 'gf' ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setTreemapMode('gf')}
                >GF Only</button>
              </div>
            </div>
            <div className="card-body" style={{ padding: '12px 20px' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
                Color intensity = GF share (light = low GF%, dark navy = high GF%). Click agency to explore.
              </div>
              <ResponsiveContainer width="100%" height={400}>
                <Treemap
                  data={treemapData}
                  dataKey="size"
                  content={<TreemapContent />}
                  onClick={(data) => data?.section && onNavigateToAgency(data.section as string)}
                >
                  <Tooltip
                    content={({ payload }) => {
                      if (!payload?.length) return null
                      const d = payload[0]?.payload
                      if (!d) return null
                      return (
                        <div style={{ background: '#fff', border: '1px solid #ccc', padding: '8px 12px', borderRadius: 6, fontSize: 12 }}>
                          <div style={{ fontWeight: 700, marginBottom: 4 }}>{d.name}</div>
                          <div>Total: {fmtCents(d.size)}</div>
                          <div>GF: {fmtCents(d.gf)}</div>
                          <div>Other: {fmtCents(d.other)}</div>
                          <div>GF%: {d.gfPct ? Math.round(d.gfPct * 100) : 0}%</div>
                        </div>
                      )
                    }}
                  />
                </Treemap>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Top 20 bar */}
          <div className="card">
            <div className="card-header">
              <h3>Top 20 Agencies by Total Funds</h3>
            </div>
            <div className="card-body" style={{ padding: '12px 4px' }}>
              <ResponsiveContainer width="100%" height={500}>
                <BarChart data={barData} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }}
                  onClick={(data) => data?.activePayload?.[0]?.payload?.section && onNavigateToAgency(data.activePayload[0].payload.section as string)}
                >
                  <XAxis type="number" tickFormatter={v => fmtAbbrev(v * 100)} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" width={155} tick={{ fontSize: 11 }} />
                  <Tooltip
                    formatter={(value: number, name: string) => [
                      new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value),
                      name === 'gf' ? 'General Funds' : 'Other Funds',
                    ]}
                    labelFormatter={(label) => label}
                  />
                  <Legend formatter={v => v === 'gf' ? 'General Funds' : 'Other Funds'} />
                  <Bar dataKey="gf" name="gf" stackId="a" fill="#1B2F5E" />
                  <Bar dataKey="other" name="other" stackId="a" fill="#C9963A" radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Session progress panel */}
        <div className="stack" style={{ position: 'sticky', top: 0, alignSelf: 'start' }}>
          <div className="card">
            <div className="card-header">
              <h3>ZBB Session Progress</h3>
            </div>
            <div className="card-body">
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--navy)' }}>
                  {reviewed} <span style={{ fontSize: 14, fontWeight: 400, color: 'var(--text-muted)' }}>of {agencies.length}</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>agencies reviewed this session</div>
                <div style={{ height: 6, background: 'var(--border)', borderRadius: 3, marginTop: 8, overflow: 'hidden' }}>
                  <div style={{ height: '100%', background: 'var(--navy)', borderRadius: 3, width: `${Math.round(reviewed * 100 / Math.max(agencies.length, 1))}%` }} />
                </div>
              </div>

              {/* Progress rows */}
              {[
                { key: 'not-started', label: '⬜ Not Started', count: agencies.length - reviewed, color: '#999' },
                { key: 'in-review',   label: '🔄 In Review',   count: summary.inReview,   color: '#1565c0' },
                { key: 'justified',   label: '✅ Justified',   count: summary.justified,   color: 'var(--success)' },
                { key: 'flagged',     label: '🔴 Flagged',     count: summary.flagged,     color: 'var(--danger)' },
              ].map(row => (
                <div key={row.key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 12, color: row.color, minWidth: 110 }}>{row.label}</span>
                  <div style={{ flex: 1, height: 5, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ height: '100%', background: row.color, borderRadius: 3, width: `${Math.round(row.count * 100 / Math.max(agencies.length, 1))}%` }} />
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 20, textAlign: 'right' }}>{row.count}</span>
                </div>
              ))}

              <div style={{ borderTop: '1px solid var(--border)', marginTop: 12, paddingTop: 12 }}>
                {sessionAgencies.map(a => (
                  <div key={a.section_number} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #f0f0f0', gap: 6 }}>
                    <button
                      style={{ background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', flex: 1, fontSize: 12, color: 'var(--text)' }}
                      onClick={() => onNavigateToAgency(a.section_number)}
                      title={a.agency_name}
                    >
                      {a.agency_name.slice(0, 24)}{a.agency_name.length > 24 ? '…' : ''}
                    </button>
                    <button
                      className={`status-badge ${status[a.section_number] ?? 'not-started'}`}
                      onClick={() => cycleStatus(a.section_number)}
                      title="Click to cycle status"
                      style={{ flexShrink: 0 }}
                    >
                      {getEmoji(status[a.section_number] ?? 'not-started')}
                    </button>
                  </div>
                ))}
                {!showAllAgencies && agencies.length > 10 && (
                  <button className="btn btn-ghost btn-sm" style={{ marginTop: 8, width: '100%' }} onClick={() => setShowAllAgencies(true)}>
                    Show all {agencies.length} agencies
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
