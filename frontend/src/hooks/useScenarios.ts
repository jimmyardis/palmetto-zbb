import { useState, useEffect } from 'react'
import type { Citation } from '../types'

export type PriorityTier = 'Mandated' | 'High' | 'Medium' | 'Low' | 'Zero'

// Full row stored in a saved scenario
export interface ScenarioSandboxRow {
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

// Keep the old SandboxRow as an alias for backward compat
export type SandboxRow = ScenarioSandboxRow

export interface SavedScenario {
  id: string
  name: string
  createdAt: string
  agencySection: string
  agencyName: string
  rows: ScenarioSandboxRow[]
}

const LS_KEY = 'palmetto_zbb_scenarios'

function load(): SavedScenario[] {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) return JSON.parse(raw) as SavedScenario[]
  } catch { /* ignore */ }
  return []
}

function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

export function useScenarios() {
  const [scenarios, setScenariosState] = useState<SavedScenario[]>(load)

  useEffect(() => {
    try { localStorage.setItem(LS_KEY, JSON.stringify(scenarios)) } catch { /* ignore */ }
  }, [scenarios])

  function saveScenario(name: string, agencySection: string, agencyName: string, rows: ScenarioSandboxRow[]): string {
    const id = genId()
    const scenario: SavedScenario = { id, name, createdAt: new Date().toISOString(), agencySection, agencyName, rows }
    setScenariosState(prev => [...prev, scenario])
    return id
  }

  function loadScenario(id: string): SavedScenario | null {
    return scenarios.find(s => s.id === id) ?? null
  }

  function deleteScenario(id: string) {
    setScenariosState(prev => prev.filter(s => s.id !== id))
  }

  function duplicateScenario(id: string, newName: string): string {
    const orig = scenarios.find(s => s.id === id)
    if (!orig) return ''
    const newId = genId()
    const dup: SavedScenario = { ...orig, id: newId, name: newName, createdAt: new Date().toISOString() }
    setScenariosState(prev => [...prev, dup])
    return newId
  }

  return { scenarios, saveScenario, loadScenario, deleteScenario, duplicateScenario }
}
