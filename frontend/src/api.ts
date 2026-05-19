import type {
  AgenciesResponse, AgencyDetail, AskResponse,
  ScenarioResponse, ReconciliationResponse, HealthResponse,
  SummaryResponse, DecisionUnit,
} from './types'

const BASE = ''  // relative URLs — same origin in production, Vite proxies in dev

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail ?? `HTTP ${res.status}`)
  }
  return res.json()
}

export const api = {
  health: () =>
    apiFetch<HealthResponse>('/health'),

  summary: () =>
    apiFetch<SummaryResponse>('/summary'),

  agencies: () =>
    apiFetch<AgenciesResponse>('/agencies'),

  agency: (section: string) =>
    apiFetch<AgencyDetail>(`/agency/${encodeURIComponent(section)}`),

  ask: (question: string, sectionFilter?: string, mode: 'navigator' | 'suggest' = 'navigator') =>
    apiFetch<AskResponse>('/ask', {
      method: 'POST',
      body: JSON.stringify({ question, section_filter: sectionFilter ?? null, mode }),
    }),

  scenario: (section: string, cutPct: number) =>
    apiFetch<ScenarioResponse>('/scenario', {
      method: 'POST',
      body: JSON.stringify({ section_number: section, cut_percentage: cutPct }),
    }),

  exportDocx: async (
    agencyName: string,
    sectionNumber: string,
    decisionUnits: DecisionUnit[],
    preparerName?: string,
  ) => {
    const res = await fetch(BASE + '/sandbox/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agency_name: agencyName,
        section_number: sectionNumber,
        decision_units: decisionUnits,
        preparer_name: preparerName,
      }),
    })
    if (!res.ok) throw new Error(`Export failed: ${res.statusText}`)
    const blob = await res.blob()
    const cd = res.headers.get('Content-Disposition') ?? ''
    const name = cd.match(/filename="([^"]+)"/)?.[1] ?? 'zbb-export.docx'
    return { blob, name }
  },

  reconciliation: () =>
    apiFetch<ReconciliationResponse>('/reconciliation'),
}
