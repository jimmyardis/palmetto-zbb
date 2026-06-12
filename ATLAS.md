# ATLAS.md

> This file is maintained by Claude Code and read by Atlas (your AI Chief of Staff).
> You don't need to edit it manually — Claude Code updates it at the end of each work session.

## Meta

| Field | Value |
|-------|-------|
| **Project** | Palmetto ZBB Suite |
| **One-liner** | SC zero-based budgeting platform reconciling all 115 state agencies with prior-year data |
| **Status** | shipping |
| **Last Active** | 2026-06-12 |
| **Stall Threshold** | 14 days |
| **Repo** | git@github.com:jimmyardis/palmetto-zbb.git |
| **Stack** | Python/FastAPI, React/Vite, SQLite, Pinecone, Voyage AI, Claude Sonnet 4.6 |

## Current State

Phase 1 + Phase 2 live. Critical UI bug fixed (2026-06-12): the "✦ Analyze with Claude" button had been added to orphaned AgencyExplorer.tsx instead of the live AgencyExplorerTab.tsx, so it never appeared on the live site — Ocean/Alex couldn't find it during their pre-launch review. Button + analysis panel now ported into the live component, deployed (commit 682ef42), and verified in the production bundle. User guide (HTML + PDF) updated with Step 7 documenting the feature.

## Next Action

Build the mission statements feature: extract all 115 agency mission statements from the FY2025 Agency Accountability Reports (scstatehouse.gov/reports/aar2025/aar2025.php) and surface them per-agency in Agency Explorer + produce a single reference document, as promised in the reply to Ocean.

## Blockers

- None currently

## Open Questions

- Will Treasurer's Office / Controller General want the analysis embedded in the exported Decision Package Word doc?
- Should Claude be able to suggest specific Justified Amounts, or remain in "analyst questions" mode?
- Mission statements: one document, in-app display, or both? (Reply to Ocean offered both.)

## Session Log

<!-- Append-only. Most recent session on top. Claude Code adds an entry at the end of each work session. -->

### 2026-06-12

- Ocean/Alex emailed pre-launch questions: (1) where are mission statements, (2) can't find the Claude Analysis button
- Root-caused the missing button: it was added to `AgencyExplorer.tsx`, a dead component nothing imports — App.tsx renders `AgencyExplorerTab.tsx`. The feature was never visible on the live site despite the backend endpoint being deployed and tested
- Ported insights button + analysis panel into AgencyExplorerTab.tsx; verified "Analyze with Claude" present in production bundle after deploy (commit 682ef42, Railway deploy SUCCESS)
- Added Step 7 (Claude ZBB analysis) to user guide HTML; regenerated PDF (36 pp) via Playwright Chromium (needed local libasound extraction — no sudo)
- Drafted reply to Ocean: button now live + guide updated; mission statements to be extracted programmatically from AAR2025 reports rather than hand-copied — offered single doc and/or in-app display
- Decision: do NOT have Ocean hand-copy 115 mission statements; AAR page (scstatehouse.gov/reports/aar2025/aar2025.php) is scrapeable

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
