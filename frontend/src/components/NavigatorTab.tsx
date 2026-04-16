import { useState, useRef } from 'react'
import { api } from '../api'
import type { AskResponse, AskCitation } from '../types'

interface HistoryEntry {
  question: string
  result: AskResponse
  timestamp: Date
}

const EXAMPLES = [
  'What are the provisos governing K-12 education?',
  'Which agencies have federal matching fund requirements?',
  'What does the budget say about Medicaid managed care?',
  'Show me all provisos related to higher education tuition',
  'What are the Capital Reserve Fund requirements?',
  'What justification was given for the Education Department\'s General Fund increase?',
  'What nonrecurring funds were allocated and why?',
]

// Annotate answer text: verified ✓ or unverified ⚠ for dollar figures
function AnnotatedAnswer({ text, citations }: { text: string; citations: AskCitation[] }) {
  const citedText = citations.map(c => c.text_preview).join(' ')
  const dollarRe = /\$[\d,]+(?:\.\d+)?(?:\s*(?:billion|million|thousand|B|M|K))?/g

  const parts: React.ReactNode[] = []
  let last = 0
  let match: RegExpExecArray | null
  let key = 0

  while ((match = dollarRe.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index))
    const figure = match[0]
    const normalized = figure.replace(/\s+/g, '').replace(/,/g, '')
    const isCited = citedText.replace(/,/g, '').includes(normalized)
    parts.push(
      <span key={key++}>
        {isCited ? (
          <span title="Figure appears verbatim in retrieved source context">
            {figure}
            <span className="cite-badge verified" style={{ marginLeft: 2 }}>✓</span>
          </span>
        ) : (
          <span className="uncited-dollar" title="Not found verbatim in retrieved context — verify against source document">
            ⚠ [Verify: {figure}]
          </span>
        )}
      </span>
    )
    last = match.index + figure.length
  }
  if (last < text.length) parts.push(text.slice(last))

  // Render as paragraphs
  const joined = parts
  return (
    <div className="answer-box">
      {joined}
    </div>
  )
}

function CitationCard({ citation, index }: { citation: AskCitation; index: number }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="proviso-card" style={{ marginBottom: 8 }}>
      <div className="proviso-meta" style={{ display: 'flex', justifyContent: 'space-between', cursor: 'pointer' }} onClick={() => setOpen(o => !o)}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="proviso-score">{(citation.relevance_score * 100).toFixed(0)}%</span>
          <span>{citation.source_doc}</span>
          {citation.page_number != null && <span>p.{citation.page_number}</span>}
          {citation.section && <span className="section-tag">§{citation.section}</span>}
        </div>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{open ? '▲' : '▼'}</span>
      </div>
      {open && (
        <p style={{ marginTop: 8, fontSize: 13, color: 'var(--text)', lineHeight: 1.6 }}>
          {citation.text_preview}
        </p>
      )}
    </div>
  )
}

export default function NavigatorTab() {
  const [question, setQuestion] = useState('')
  const [result, setResult] = useState<AskResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [followUp, setFollowUp] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleAsk(q: string) {
    const trimmed = q.trim()
    if (!trimmed) return
    setLoading(true)
    setError('')
    setResult(null)
    setFollowUp('')
    try {
      const resp = await api.ask(trimmed)
      setResult(resp)
      setHistory(prev => [{ question: trimmed, result: resp, timestamp: new Date() }, ...prev])
    } catch (e: unknown) {
      const msg = (e as Error).message
      if (msg.includes('503') || msg.includes('RAG')) {
        setError('RAG search unavailable — Pinecone ingestion may not be complete.')
      } else {
        setError(msg)
      }
    } finally {
      setLoading(false)
    }
  }

  function loadFromHistory(entry: HistoryEntry) {
    setQuestion(entry.question)
    setResult(entry.result)
    setError('')
    setFollowUp('')
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 0, minHeight: 0 }}>
      {/* History sidebar */}
      <div style={{
        borderRight: '1px solid var(--border)',
        overflowY: 'auto',
        height: 'calc(100vh - 107px)',
        position: 'sticky',
        top: 0,
        background: 'var(--surface)',
      }}>
        <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--navy)' }}>Session History</span>
          {history.length > 0 && (
            <button className="btn btn-ghost btn-sm" style={{ fontSize: 10, padding: '2px 6px' }}
              onClick={() => setHistory([])}>Clear</button>
          )}
        </div>
        {history.length === 0 ? (
          <div style={{ padding: 20, fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
            Your questions will appear here
          </div>
        ) : (
          history.map((entry, i) => (
            <div
              key={i}
              className="history-item"
              onClick={() => loadFromHistory(entry)}
            >
              <div className="q-text">{entry.question.slice(0, 60)}{entry.question.length > 60 ? '…' : ''}</div>
              <div className="q-time">
                {entry.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                {' · '}{entry.result.chunks_retrieved} sources
              </div>
            </div>
          ))
        )}
      </div>

      {/* Main Q&A */}
      <div style={{ padding: 24, overflowY: 'auto' }}>
        {/* Search bar */}
        <div style={{ maxWidth: 640, margin: '0 auto 20px', display: 'flex', gap: 8 }}>
          <input
            ref={inputRef}
            type="text"
            value={question}
            onChange={e => setQuestion(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAsk(question)}
            placeholder="Ask about SC budget provisos, appropriations, or policy requirements…"
            style={{ flex: 1, fontSize: 15, padding: '10px 14px' }}
          />
          <button
            className="btn btn-primary"
            onClick={() => handleAsk(question)}
            disabled={loading || !question.trim()}
            style={{ padding: '10px 20px', fontSize: 14 }}
          >
            {loading ? '…' : 'Ask'}
          </button>
        </div>

        {/* Example questions */}
        {!result && !loading && (
          <div style={{ maxWidth: 640, margin: '0 auto 24px', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {EXAMPLES.map(q => (
              <button
                key={q}
                className="btn btn-ghost btn-sm"
                style={{ borderRadius: 20, fontSize: 12 }}
                onClick={() => { setQuestion(q); handleAsk(q) }}
              >
                {q}
              </button>
            ))}
          </div>
        )}

        {/* Anti-hallucination notice */}
        {!result && !loading && (
          <div className="alert alert-info" style={{ maxWidth: 640, margin: '0 auto', fontSize: 12 }}>
            <strong>Anti-hallucination enforced.</strong> Dollar figures are annotated{' '}
            <span className="cite-badge verified" style={{ display: 'inline-flex' }}>✓</span> if found verbatim in
            retrieved source context, or{' '}
            <span className="uncited-dollar" style={{ padding: '1px 6px', borderRadius: 3 }}>⚠ [Verify]</span>{' '}
            if not found — verify those against the source document.
          </div>
        )}

        {error && <div className="alert alert-danger" style={{ maxWidth: 640, margin: '0 auto 16px' }}>{error}</div>}
        {loading && <div className="loading">Retrieving from Part IB source documents…</div>}

        {result && (
          <div style={{ maxWidth: 800 }}>
            {/* Answer */}
            <div className="card mb-16">
              <div className="card-header">
                <h3>Answer</h3>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {result.chunks_retrieved} source chunks retrieved
                  </span>
                  <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 3, background: '#e8f5e9', color: '#1b5e20', border: '1px solid #a5d6a7' }}>
                    {result.system_prompt_active}
                  </span>
                </div>
              </div>
              <div className="card-body">
                <AnnotatedAnswer text={result.answer} citations={result.citations} />
                <div style={{ marginTop: 12, fontSize: 11, color: 'var(--text-muted)' }}>
                  ✓ = verbatim in retrieved context · ⚠ [Verify] = not found verbatim · Model: {result.model}
                </div>
              </div>
            </div>

            {/* Follow-up */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <input
                type="text"
                value={followUp}
                onChange={e => setFollowUp(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAsk(followUp)}
                placeholder="Ask a follow-up question…"
                style={{ flex: 1 }}
              />
              <button className="btn btn-outline btn-sm" onClick={() => handleAsk(followUp)} disabled={!followUp.trim() || loading}>
                Follow up
              </button>
            </div>

            {/* Source citations */}
            {result.citations.length > 0 && (
              <div className="card">
                <div className="card-header">
                  <h3>Source Citations</h3>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {result.citations.length} sources · H.4025 / tap1b.pdf + Conference Report
                  </span>
                </div>
                <div className="card-body" style={{ padding: '12px 16px' }}>
                  {result.citations.map((c, i) => (
                    <CitationCard key={i} citation={c} index={i} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
