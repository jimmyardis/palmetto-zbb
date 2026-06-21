# Palmetto ZBB — Running Punch List

Fixes queued from the SCPC/SCPIF review (2026-06-17). Batch and deploy together.

---

## 1. Prior-year line items leak into line-item queries  ✅ FIXED 2026-06-21 (deployed)

Filtered `(fund_category IS NULL OR fund_category != 'prior_year')` into all four
leaking queries: header stats count (was 5,106 → now 2,513 current-year rows),
`get_agency` items + subtotals, and the Sandbox items query. Verified: line items
now sum EXACTLY to the official recap total for every agency (MUSC §23 $981,083,449,
Clemson §14 $1,807,026,326), zero duplicates. Also added a per-agency "Verify in
official budget" deep link to the ENACTED doc (tap1a.htm#s{N}). Original notes kept
below for reference.

---
### (original diagnosis)
## 1. Prior-year line items leak into line-item queries  ⬅ ROOT CAUSE (two symptoms)

**Problem:** `budget_data.db` holds both FY2025-26 (`fund_category='recurring'`) and
FY2024-25 (`fund_category='prior_year'`) line items. Several queries return BOTH
because they only filter `is_total_row=0`. The fix already exists in the insights
endpoint and should be applied everywhere line items are listed/summed:
`AND (fund_category IS NULL OR fund_category != 'prior_year')`

**Symptom A — Agency Explorer (cosmetic):** the line-item list shows each
flat-funded line twice (current + prior year), unlabeled, so they read as exact
duplicates. *Totals are still correct* — they come from the `recapitulation` table.
- Fix at `execution/api_server.py` ~line 361 (`get_agency` items query).

**Symptom B — ZBB Sandbox (CORRECTNESS BUG, higher priority):** the Running Total /
"Current Appropriation" sums ALL line items, so the baseline is ~doubled for any
agency with prior-year data, and it's mislabeled "FY2025-2026 enacted." Every
proposed cut % is then computed against an inflated base.
- Verified on §23 MUSC: dropdown (recap) = **$981,083,449**; Running Total = **$1,933,419,396**
  (= 23 recurring rows $981,083,449 + 23 prior-year rows $952,335,947; "46 items").
- Fix at `execution/api_server.py` ~line 1073 (sandbox items query). Also audit the
  CSV export and any other `FROM line_items ... is_total_row=0` query (grep found
  ~361, 1073, 1262, 1280).

**Decision:** drop prior-year from all displays/sums now. The data stays in the DB.

## 2. (Future, optional) Year-over-year comparison view
Prior-year data has one legitimate use: a deliberate, labeled "% change vs FY24-25"
column / fastest-growing-line flag. On-message for ZBB ("here's where spending grew —
justify from zero"). Caveat: prior-year row counts don't always match current year
(e.g. Clemson 35 vs 32), so deltas would have gaps. Only build if there's appetite.

## 3. Behavioral Health & Developmental Disabilities missions (§35/36/37)
Their merged AAR was "upload pending" when scraped, so those three sections have no
mission yet. When it posts: add to `AAR_REPORTS` + `CODE_SECTION_OVERRIDE` in
`execution/extract_missions.py` and re-run.
