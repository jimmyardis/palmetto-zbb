import { useState, useRef } from 'react'
import { api } from '../api'
import type { AskResponse, AskCitation } from '../types'

// Scan answer text for dollar patterns; flag any not found verbatim in citation previews
function AnnotatedAnswer({ text, citations }: { text: string; citations: AskCitation[] }) {
  const citedText = citations.map(c => c.text_preview).join(' ')
  const dollarRe = /\$[\d,]+(?:\.\d+)?(?:\s*(?:billion|million|thousand|B|M|K))?/g

  const parts: React.ReactNode[] = []
  let last = 0
  let match: RegExpExecArray | null
  let key = 0

  while ((match = dollarRe.exec(text)) !== null) {
    if (match.index > last) {
      parts.push(text.slice(last, match.index))
    }
    const figure = match[0]
    const isCited = citedText.includes(figure.replace(/\s+/g, ''))
    parts.push(
      <span
        key={key++}
        className={isCited ? '' : 'uncited-dollar'}
        title={isCited
          ? 'Figure appears verbatim in retrieved source context'
          : '⚠ Figure not found verbatim in retrieved context — verify against source document'}
      >
        {figure}
        {isCited
          ? <sup style={{ color: 'var(--success)', marginLeft: 1, fontSize: 9 }}>✓</sup>
          : <sup style={{ color: 'var(--warn)', marginLeft: 1, fontSize: 9 }}>⚠</sup>
        }
      </span>
    )
    last = match.index + figure.length
  }
  if (last < text.length) parts.push(text.slice(last))

  return <div className="answer-box">{parts}</div>
}

function CitationCard({ citation, index }: { citation: AskCitation; index: number }) {
  return (
    <div className="citation-item">
      <span className="citation-num">{index + 1}</span>
      <div>
        <div style={{ fontWeight: 600, marginBottom: 3 }}>
          {citation.source_doc}
          {citation.page_number != null && ` · p.${citation.page_number}`}
          {citation.section && ` · §${citation.section}`}
          <span style={{
            marginLeft: 8, fontSize: 10, color: 'var(--text-muted)',
            background: 'var(--bg)', padding: '1px 5px', borderRadius: 3,
            border: '1px solid var(--border)'
          }}>
            score: {citation.relevance_score}
          </span>
        </div>
        <div style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>{citation.text_preview}</div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>
          {citation.act} · {citation.fiscal_year}
        </div>
      </div>
    </div>
  )
}

export default function NavigatorTab() {
  const [question, setQuestion] = useState('')
  const [result, setResult] = useState<AskResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleAsk() {
    const q = question.trim()
    if (!q) return
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const resp = await api.ask(q)
      setResult(resp)
    } catch (e: unknown) {
      const msg = (e as Error).message
      if (msg.includes('503') || msg.includes('RAG services')) {
        setError('RAG search is not available — Phase 1C Pinecone ingestion has not completed. The Agency Explorer and Scenario tabs are fully functional without it.')
      } else {
        setError(msg)
      }
    } finally {
      setLoading(false)
    }
  }

  const uncitedCount = result
    ? (result.answer.match(/\$[\d,]+/g) ?? [])
        .filter(f => !result.citations.some(c => c.text_preview.includes(f.replace(/,/g, ''))))
        .length
    : 0

  return (
    <div className="stack">
      <div className="card">
        <div className="card-header">
          <h2>Budget Navigator</h2>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            RAG search · Part IB provisos + Revenue Statement
          </span>
        </div>
        <div className="card-body">
          <div className="alert alert-warn" style={{ marginBottom: 16 }}>
            <strong>Anti-hallucination enforced:</strong> The AI is strictly forbidden from stating any dollar amount
            not present verbatim in the retrieved source context. Dollar figures are annotated
            <span className="cite-badge verified" style={{ margin: '0 3px', display: 'inline-flex' }}>✓</span> if verified in sources,
            <span className="cite-badge unverified" style={{ margin: '0 3px', display: 'inline-flex' }}>⚠</span> if not found verbatim.
          </div>
          <div className="ask-form">
            <input
              ref={inputRef}
              type="text"
              placeholder="Ask about SC budget provisos, policy requirements, or appropriations…"
              value={question}
              onChange={e => setQuestion(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAsk()}
            />
            <button
              className="btn btn-primary"
              onClick={handleAsk}
              disabled={loading || !question.trim()}
            >
              {loading ? 'Searching…' : 'Ask'}
            </button>
          </div>

          {/* Example questions */}
          {!result && !loading && (
            <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {[
                'What provisos govern DHHS Medicaid spending?',
                'What are the reporting requirements for DSS?',
                'What federal match requirements apply to DAODAS?',
                'What are the restrictions on carry-forward funds?',
              ].map(q => (
                <button
                  key={q}
                  className="btn btn-ghost btn-sm"
                  style={{ border: '1px solid var(--border)', borderRadius: 12 }}
                  onClick={() => { setQuestion(q); setTimeout(handleAsk, 0) }}
                >
                  {q}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}
      {loading && <div className="loading">Retrieving from source documents…</div>}

      {result && (
        <>
          {/* Answer */}
          <div className="card">
            <div className="card-header">
              <h2>Answer</h2>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {result.chunks_retrieved} source chunks retrieved
                </span>
                {uncitedCount > 0 && (
                  <span className="cite-badge unverified" title={`${uncitedCount} dollar figure(s) not found verbatim in retrieved context`}>
                    ⚠
                  </span>
                )}
                <span style={{
                  fontSize: 10, padding: '2px 6px', borderRadius: 3,
                  background: 'var(--success-bg)', color: 'var(--success)', border: '1px solid #aad4b8'
                }}>
                  {result.system_prompt_active}
                </span>
              </div>
            </div>
            <div className="card-body">
              <AnnotatedAnswer text={result.answer} citations={result.citations} />
              <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-muted)' }}>
                ✓ = figure appears verbatim in retrieved source context ·
                ⚠ = figure not found verbatim — verify against official document ·
                Model: {result.model}
              </div>
            </div>
          </div>

          {/* Citations */}
          {result.citations.length > 0 && (
            <div className="card">
              <div className="card-header">
                <h2>Source Citations</h2>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto' }}>
                  {result.citations.length} sources · H.4025 FY2025-2026
                </span>
              </div>
              <div className="card-body">
                <div className="citation-list">
                  {result.citations.map((c, i) => (
                    <CitationCard key={i} citation={c} index={i} />
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
