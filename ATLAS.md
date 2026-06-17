# ATLAS.md

> This file is maintained by Claude Code and read by Atlas (your AI Chief of Staff).
> You don't need to edit it manually — Claude Code updates it at the end of each work session.

## Meta

| Field | Value |
|-------|-------|
| **Project** | Palmetto ZBB Suite |
| **One-liner** | SC zero-based budgeting platform reconciling all 115 state agencies with prior-year data |
| **Status** | shipping |
| **Last Active** | 2026-06-17 |
| **Stall Threshold** | 14 days |
| **Repo** | git@github.com:jimmyardis/palmetto-zbb.git |
| **Stack** | Python/FastAPI, React/Vite, SQLite, Pinecone, Voyage AI, Claude Sonnet 4.6 |

## Current State

Phase 1 + Phase 2 live. Mission statements feature built (2026-06-17) — the item promised to Ocean. New pipeline `execution/extract_missions.py` downloads each FY2025 Agency Accountability Report PDF, extracts the budget SECTION number + mission/vision verbatim via Claude, and maps to all 115 budget sections; `execution/generate_mission_doc.py` emits the reference doc (`docs/agency_missions.html`) + API payload (`docs/agency_missions.json`). Result: 97/115 sections have verbatim missions; the other 18 are legitimately report-less (fund accounts like Debt Service/Capital Reserve/Aid to Subdivisions, the legislative & judicial branches, and §35–37 Behavioral Health whose AAR was "upload pending" at scrape time). Backend wired (`GET /agency` now returns a `mission` block, tested locally) and frontend mission card added to the live `AgencyExplorerTab.tsx` (builds clean). NOT yet committed or deployed — staged in the working tree pending Jimmy's review, because pushing to master auto-deploys to the live tool under Treasurer's Office review.

## Next Action

Review the staged mission feature (reference doc + in-app card), then commit and push to deploy. When the Behavioral Health & Developmental Disabilities AAR posts, add it to `AAR_REPORTS` + `CODE_SECTION_OVERRIDE` (§35/36/37) and re-run to close those gaps.

## Blockers

- None currently

## Open Questions

- Will Treasurer's Office / Controller General want the analysis embedded in the exported Decision Package Word doc?
- Should Claude be able to suggest specific Justified Amounts, or remain in "analyst questions" mode?
- Mission statements: one document, in-app display, or both? (Reply to Ocean offered both.)

## Session Log

<!-- Append-only. Most recent session on top. Claude Code adds an entry at the end of each work session. -->

### 2026-06-17

- Built the mission statements feature promised to Ocean. Context: Jimmy en route to meet SCPC/SCPIF; wanted it knocked out while getting ready.
- Source discovery: AAR2025 reports are per-agency PDFs keyed by SC agency code (N040=Corrections), not section number. Each PDF's page-3 header carries the budget `SECTION:` number, so mapping is exact — but several reports typo their own section (USC campuses: "0202B", "10D") or place the header past page 6, so an explicit `CODE_SECTION_OVERRIDE` map handles those.
- Decision: extract mission/vision via Claude rather than positional PDF parsing — the strategic-plan page is a form that scrambles label/value reading order across ~96 differently-filled templates. No arithmetic, so it respects the suite's no-LLM-math rule. Verbatim only.
- Built `execution/extract_missions.py` (resumable, `--only`/`--limit`/`--force`) + `execution/generate_mission_doc.py` (HTML reference doc + JSON payload).
- Debugging loop hardened the extractor: (1) section regex made colon-optional + searches all pages; (2) text window now puts mission-bearing pages first and caps at 40k so big university PDFs aren't truncated; (3) `max_tokens` 1024→2048 (long uni missions truncated the JSON); (4) JSON parse now greps the outermost `{...}` because Claude sometimes prepends prose before the fenced block — this last bug had silently nulled several agencies.
- Caught 3 section collisions via an audit (First Steps→§2, Lander→§18, College of Charleston→§15 had grabbed spurious "SECTION…AGENCY" matches); pinned them in the override map.
- Result: 97/115 sections with verbatim missions; 18 legitimately report-less (fund accounts, legislative/judicial branches, §35–37 Behavioral Health AAR pending upload).
- Wired backend (`GET /agency` → `mission` block, additive, tested locally on §65 and §3) and added a mission card to the live `AgencyExplorerTab.tsx` (avoided the orphan-twin trap; `npm run build` clean, dist rebuilt).
- Left staged in working tree, NOT committed/pushed — deploy gated on Jimmy's review since master auto-deploys to the live tool. Also discussed Todd Mitchell's idea: batch-run the existing Claude ZBB analysis (`/agency/{section}/insights`) for all 115 agencies into a Google Drive of 115 docs as on-ramps; feasible (~3 hrs runtime, ~$15–35), scoped for next session.

### 2026-06-12

- Second bug found when Jimmy smoke-tested the button on Clemson: NameError — the narrative insights path checked `get_claude()` but never bound `claude`, so every analysis 502'd. Fixed (commit 8f27bea), tested locally on §111 (200, 17k chars), deployed, and verified live on production (200, ~92s)
- Note: real analysis time is ~90s, not the 30–60s the UI/guide claim — consider updating copy
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
