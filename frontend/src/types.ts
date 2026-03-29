// ── Citation ─────────────────────────────────────────────────────────────
export interface Citation {
  source_doc: string
  page_number: number | null
  section?: string
  fiscal_year?: string
  act?: string
}

// ── Agencies list ─────────────────────────────────────────────────────────
export interface AgencySummary {
  section_number: string
  agency_name: string
  total_funds_cents: number
  total_funds_display: string
  general_funds_cents: number
  general_funds_display: string
  other_funds_cents: number
  other_funds_display: string
  line_item_count: number
  federal_match_items: number
  citation: Citation
}

export interface AgenciesResponse {
  fiscal_year: string
  source: string
  agency_count: number
  agencies: AgencySummary[]
}

// ── Agency detail ─────────────────────────────────────────────────────────
export interface LineItem {
  id: number
  subsection: string | null
  description: string
  general_funds_cents: number
  general_funds_display: string
  other_funds_cents: number
  other_funds_display: string
  total_funds_cents: number
  total_funds_display: string
  has_federal_match: boolean
  federal_match_note: string | null
  extraction_confidence: string
  citation: Citation
}

export interface Proviso {
  score: number
  text: string
  source_doc: string
  page_number: number | null
  source_type: string
  linked_section: string
}

export interface AgencyDetail {
  section_number: string
  agency_name: string
  fiscal_year: string
  totals: {
    total_funds_cents: number
    total_funds_display: string
    general_funds_cents: number
    general_funds_display: string
    other_funds_cents: number
    other_funds_display: string
    citation: Citation
  }
  line_items: LineItem[]
  line_item_count: number
  provisos: Proviso[]
  data_note: string
}

// ── Ask / RAG ─────────────────────────────────────────────────────────────
export interface AskCitation {
  source_doc: string
  page_number: number | null
  section: string
  source_type: string
  relevance_score: number
  text_preview: string
  fiscal_year: string
  act: string
}

export interface AskResponse {
  answer: string
  citations: AskCitation[]
  chunks_retrieved: number
  model: string
  system_prompt_active: string
}

// ── Scenario ─────────────────────────────────────────────────────────────
export interface ScenarioLineItem {
  id: number
  subsection: string | null
  description: string
  original: { total_cents: number; total_display: string; general_funds_cents: number; general_funds_display: string; other_funds_cents: number; other_funds_display: string }
  proposed: { total_cents: number; total_display: string; general_funds_cents: number; general_funds_display: string; other_funds_cents: number; other_funds_display: string }
  delta: { total_cents: number; total_display: string; general_funds_cents: number; other_funds_cents: number }
  has_federal_match: boolean
  citation: Citation
}

export interface FederalWarning {
  line_item: string
  other_funds_cut_display: string
  warning: string
  proviso_note: string
  requires_confirmation: boolean
}

export interface ScenarioResponse {
  section_number: string
  agency_name: string
  fiscal_year: string
  cut_percentage: number
  arithmetic_method: string
  note: string
  summary: {
    original_total_cents: number
    original_total_display: string
    proposed_total_cents: number
    proposed_total_display: string
    total_cut_cents: number
    total_cut_display: string
    original_gf_display: string
    proposed_gf_display: string
    gf_cut_display: string
    citation: Citation
  }
  federal_match_warnings: FederalWarning[]
  federal_match_warning_count: number
  line_items: ScenarioLineItem[]
  line_item_count: number
}

// ── Reconciliation ────────────────────────────────────────────────────────
export interface ReconciliationRow {
  section_number: string
  agency_name: string
  recap_total_display: string
  db_total_display: string
  delta_display: string
  status: 'PASS' | 'WARN'
  line_item_count: number
}

export interface ReconciliationResponse {
  status: string
  run_at: string | null
  fiscal_year: string
  act: string
  source_doc: string
  summary: {
    recap_total_display: string
    recap_gf_display: string
    recap_total_cents: number
    agency_count: number
    pass_count: number
    warn_count: number
  }
  agencies: ReconciliationRow[]
}

// ── Health ────────────────────────────────────────────────────────────────
export interface HealthResponse {
  status: string
  fiscal_year: string
  database: {
    data_rows: number
    agencies: number
    federal_match_rows: number
    low_confidence_rows: number
    last_ingestion: string | null
  }
  pinecone: {
    available: boolean
    vector_count?: number
  }
  reconciliation: {
    status: string
    recap_total: string
    recap_gf: string
  }
}

// ── Sandbox export ────────────────────────────────────────────────────────
export interface DecisionUnit {
  line_item_id: number
  justified_amount_cents: number
  justification_text: string
  priority_tier: 'Mandated' | 'High' | 'Medium' | 'Low'
}

export type PriorityTier = 'Mandated' | 'High' | 'Medium' | 'Low'
