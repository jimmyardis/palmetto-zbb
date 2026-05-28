# ATLAS.md

> This file is maintained by Claude Code and read by Atlas (your AI Chief of Staff).
> You don't need to edit it manually — Claude Code updates it at the end of each work session.

## Meta

| Field | Value |
|-------|-------|
| **Project** | Palmetto ZBB Suite |
| **One-liner** | SC zero-based budgeting platform reconciling all 115 state agencies with prior-year data |
| **Status** | shipping |
| **Last Active** | 2026-05-27 |
| **Stall Threshold** | 14 days |
| **Repo** | git@github.com:jimmyardis/palmetto-zbb.git |
| **Stack** | Python/FastAPI, React/Vite, SQLite, Pinecone, Voyage AI, Claude Sonnet 4.6 |

## Current State

Phase 1 complete (115 agencies reconciled). Phase 2 feature now built and deployed: `GET /agency/{section}/insights` — Claude ZBB analyst report for any agency grounded in actual H.4025 line items. UI has "✦ Analyze with Claude" button and tabbed analysis panel in Agency Explorer. Dept of Corrections (Section 65) Word doc generated as a demo for Treasurer's Office and Controller General review.

## Next Action

Send demo Word doc to Alex/Ocean, await Treasurer's Office and Controller General feedback before scoping Phase 3.

## Blockers

- None currently — feature deployed, demo sent

## Open Questions

- Will Treasurer's Office / Controller General want the analysis embedded in the exported Decision Package Word doc?
- Should Claude be able to suggest specific Justified Amounts, or remain in "analyst questions" mode?

## Session Log

<!-- Append-only. Most recent session on top. Claude Code adds an entry at the end of each work session. -->

### 2026-05-27

- Built `GET /agency/{section}/insights` endpoint in api_server.py — Claude Sonnet 4.6 ZBB analyst report per agency, grounded in H.4025 line items + Pinecone provisos
- System prompt distinguishes SC budget facts (cite H.4025) from policy analysis (peer benchmarks, privatization)
- Tested on Section 65 (Dept of Corrections): 25 line items → full report with priority tiers, analyst questions per decision unit, federal match risks, peer state benchmarks
- Generated `ZBB_Section65_ClaudeAnalysis_20260527.docx` as client demo deliverable (saved to Windows Downloads)
- Added "✦ Analyze with Claude" button to Agency Explorer UI; tabbed panel toggles Provisos ↔ ZBB Analysis
- Built, committed (2017533), pushed to GitHub, deployed to Railway (mindful-connection project)
- Context: Treasurer's Office and Controller General are testing the suite; this is the "second-generation analysis" promised to Alex/Ocean

### 2026-05-23

- Created ATLAS.md for project tracking
- No code changes this session — file placement only
