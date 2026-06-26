# ATLAS.md

> This file is maintained by Claude Code and read by Atlas (your AI Chief of Staff).
> You don't need to edit it manually — Claude Code updates it at the end of each work session.

## Meta

| Field | Value |
|-------|-------|
| **Project** | Palmetto ZBB Suite |
| **One-liner** | SC zero-based budgeting platform reconciling all 115 state agencies with prior-year data |
| **Status** | shipping |
| **Last Active** | 2026-06-26 |
| **Stall Threshold** | 14 days |
| **Repo** | git@github.com:jimmyardis/palmetto-zbb.git |
| **Stack** | Python/FastAPI, React/Vite, SQLite, Pinecone, Voyage AI, Claude Sonnet 4.6 |

## Current State

Phase 1 + Phase 2 live. Pre-Treasurer's-Office polish in progress: SCPC verifiers compare our Agency Explorer line-item table side-by-side with the scstatehouse.gov appropriations tables, so the table now mirrors the source — money columns reordered to **Total Funds → General Funds** (source order), the computed "Other Funds" column demoted out of the table (preserved in the row dropdown + CSV export, no data loss), and source citations hyperlinked: Page number → exact PDF page (`tap1a.pdf#page=N`), Source line in the dropdown → HTML section anchor (`tap1a.htm#s14`) + PDF page. Deployed (`4a25238`, live bundle `index-D4e9Wzhe.js`). The earlier dedup fix (`bce5adf`) already closed most of the gap SCPC flagged — their screenshot was pre-fix (5,106 items, duplicate rows, prior-year `tap1a_fy2425.htm` citations); live Clemson §14 now shows 26 clean rows whose names match the source, cited to the enacted act. Mission statements feature also shipped earlier (`5300942`): 97/115 sections with verbatim missions from FY2025 AARs; 18 legitimately report-less (fund accounts, legislative/judicial branches, §35–37 Behavioral Health AAR pending).

## Next Action

Draft the reply to SCPC: (a) re-pull — their screenshot predates the dedup fix; (b) verify against the ENACTED act `tap1a.htm`, not the Ways & Means draft `wmp1a.htm` they were on (pre-conference numbers differ); (c) explain the source fields they didn't recognize — Total vs General Funds, the `(5.00)` parentheticals = FTE position counts, and "I. Education & General / II. Auxiliary Enterprises" = program divisions. Before sending, re-pull `tap1a.htm` to confirm the exact scenario-column order (W&M / House / Senate / Conference). When the Behavioral Health AAR posts, add §35/36/37 to `AAR_REPORTS` + `CODE_SECTION_OVERRIDE` and re-run `extract_missions.py`.

## Blockers

- None currently

## Open Questions

- Will Treasurer's Office / Controller General want the analysis embedded in the exported Decision Package Word doc?
- Should Claude be able to suggest specific Justified Amounts, or remain in "analyst questions" mode?
- Mission statements: one document, in-app display, or both? (Reply to Ocean offered both.)

## Session Log

<!-- Append-only. Most recent session on top. Claude Code adds an entry at the end of each work session. -->

### 2026-06-26

- SCPC sent a screenshot comparing our Clemson §14 line items against scstatehouse.gov; asked to make our view mirror the source as closely as possible, plus two questions (unfamiliar source fields; could the source dropdown be hyperlinked).
- Diagnosed first: their screenshot was **pre-dedup-fix** (showed 5,106 items, duplicate "II. Auxiliary Enterprises" rows, prior-year `tap1a_fy2425.htm` citations). Live API for §14 now returns 26 clean rows with source-matching names (PRESIDENT, CLASSIFIED/UNCLASSIFIED POSITIONS, …) cited to the enacted act `tap1a.htm`. So the `bce5adf` fix already closed most of the gap — SCPC needs to re-pull. Also noticed they were verifying against `wmp1a.htm` (Ways & Means draft), not the enacted `tap1a.htm`.
- Shipped 3 frontend changes to `AgencyExplorerTab.tsx` to mirror the source: (1) reordered money columns to Total Funds → General Funds, moved ✓ badge to Total; (2) demoted the computed "Other Funds" column out of the table into the row dropdown ("Other / Earmarked (Total − General)") + kept it in CSV export — no data loss since it's `total − general`; (3) hyperlinked citations — Page → `tap1a.pdf#page=N`, dropdown Source → HTML section anchor + PDF page, all derived from the agency's enacted-act `official_source.url`.
- Decision on "Other Funds": demote, don't delete. It has analytical value (General = zero-base-able state money; Other = federal/earmarked, often non-discretionary) but isn't in the source and confused verifiers; computed so re-derivable.
- Built clean (tsc + vite), committed `4a25238`, pushed to master, Railway auto-deployed (confirmed Building, then live bundle `index-D4e9Wzhe.js` after ~60s). Treasurer's Office hasn't received the tool yet — Jimmy explicitly wanted these loose ends closed first, so deploying now was safe.
- Left open: draft the SCPC reply (re-pull + use tap1a not wmp1a + field-meaning explainer); verify exact scenario-column order in tap1a before sending.

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
