#!/usr/bin/env python3
"""
generate_mission_doc.py — Build the single reference document of all agency
mission + vision statements, ordered by budget section number.

Reads mission_statements.json (produced by extract_missions.py) and the
recapitulation table in budget_data.db (the authoritative 115-agency list),
and emits:
    docs/agency_missions.html   — styled, printable reference doc
    docs/agency_missions.json   — clean per-section payload for the API/frontend

Sections with no accountability report (fund accounts / pass-throughs such as
Debt Service, Capital Reserve Fund, Aid to Subdivisions) are listed with a
clear "no accountability report" note rather than omitted.

Usage:
    python execution/generate_mission_doc.py
"""
from __future__ import annotations

import html
import json
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MISSIONS = ROOT / "mission_statements.json"
DB_PATH = ROOT / "budget_data.db"
DOCS = ROOT / "docs"


def section_sort_key(sec: str):
    """Sort '20A' after '20', '91A' etc. numerically then by suffix."""
    num = "".join(c for c in sec if c.isdigit())
    suf = "".join(c for c in sec if not c.isdigit())
    return (int(num) if num else 0, suf)


def main() -> None:
    missions = json.loads(MISSIONS.read_text()) if MISSIONS.exists() else {}
    # index extracted records by section_number
    by_section: dict[str, dict] = {}
    for rec in missions.values():
        sec = rec.get("section_number")
        if sec:
            by_section[sec] = rec

    conn = sqlite3.connect(DB_PATH)
    agencies = conn.execute(
        "SELECT section_number, agency_name FROM recapitulation"
    ).fetchall()
    conn.close()
    agencies.sort(key=lambda r: section_sort_key(str(r[0])))

    payload = []
    with_mission = 0
    for sec, db_name in agencies:
        sec = str(sec)
        rec = by_section.get(sec)
        entry = {
            "section_number": sec,
            "agency_name": db_name,
            "mission": rec.get("mission") if rec else None,
            "vision": rec.get("vision") if rec else None,
            "aar_name": rec.get("aar_name") if rec else None,
            "pdf_url": rec.get("pdf_url") if rec else None,
            "source": rec.get("source") if rec else None,
            "has_report": bool(rec),
        }
        if entry["mission"]:
            with_mission += 1
        payload.append(entry)

    DOCS.mkdir(exist_ok=True)
    (DOCS / "agency_missions.json").write_text(
        json.dumps(payload, indent=2, ensure_ascii=False)
    )

    # ── HTML reference doc ───────────────────────────────────────────────
    rows = []
    for e in payload:
        sec = html.escape(e["section_number"])
        name = html.escape(e["agency_name"] or "")
        if e["mission"]:
            mission = html.escape(e["mission"])
            vision = (
                f'<p class="vision"><span class="lbl">Vision</span> {html.escape(e["vision"])}</p>'
                if e["vision"]
                else ""
            )
            src = (
                f'<a class="src" href="{html.escape(e["pdf_url"])}" target="_blank" rel="noopener">FY2025 Accountability Report ↗</a>'
                if e.get("pdf_url")
                else ""
            )
            body = (
                f'<p class="mission"><span class="lbl">Mission</span> {mission}</p>'
                f"{vision}{src}"
            )
        else:
            body = (
                '<p class="none">No agency accountability report '
                "(fund account / pass-through appropriation).</p>"
            )
        rows.append(
            f'<article class="agency"><h2><span class="sec">§{sec}</span> {name}</h2>{body}</article>'
        )

    generated = json.dumps(len(payload))
    htmldoc = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>South Carolina Agency Mission Statements — FY2025</title>
<style>
  :root {{ --ink:#1a2332; --muted:#5b6b7f; --line:#e2e8f0; --accent:#1a5276; }}
  * {{ box-sizing:border-box; }}
  body {{ font:16px/1.6 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;
          color:var(--ink); max-width:820px; margin:0 auto; padding:2.5rem 1.25rem; }}
  header h1 {{ font-size:1.7rem; margin:0 0 .35rem; }}
  header p {{ color:var(--muted); margin:.15rem 0; }}
  .agency {{ border-top:1px solid var(--line); padding:1.1rem 0; }}
  .agency h2 {{ font-size:1.08rem; margin:0 0 .5rem; }}
  .sec {{ display:inline-block; min-width:3.2rem; color:var(--accent); font-weight:700; }}
  .lbl {{ display:inline-block; font-size:.72rem; letter-spacing:.05em; text-transform:uppercase;
          color:var(--accent); font-weight:700; margin-right:.4rem; vertical-align:1px; }}
  .mission {{ margin:.3rem 0; }}
  .vision {{ margin:.3rem 0; color:var(--muted); }}
  .none {{ color:var(--muted); font-style:italic; }}
  .src {{ font-size:.8rem; color:var(--accent); text-decoration:none; }}
  .src:hover {{ text-decoration:underline; }}
  @media print {{ .agency {{ break-inside:avoid; }} }}
</style></head><body>
<header>
  <h1>South Carolina Agency Mission Statements</h1>
  <p>All {len(payload)} budget sections, ordered by section number. Mission and
     vision statements drawn verbatim from each agency's FY2025 State Agency
     Accountability Report.</p>
  <p>{with_mission} of {len(payload)} sections have a published mission statement.</p>
</header>
<main>
{chr(10).join(rows)}
</main>
<footer style="border-top:1px solid var(--line);margin-top:2rem;padding-top:1rem;color:var(--muted);font-size:.82rem">
  Source: South Carolina State Agency Accountability Reports, FY2024-25.
  Compiled for the Palmetto ZBB Suite. Section numbers correspond to the FY2026 Appropriations Act (H.4025).
</footer>
</body></html>"""
    (DOCS / "agency_missions.html").write_text(htmldoc)

    print(f"Agencies: {len(payload)} | with mission: {with_mission} | "
          f"no report: {len(payload) - with_mission}")
    print(f"Wrote {DOCS/'agency_missions.html'}")
    print(f"Wrote {DOCS/'agency_missions.json'}")


if __name__ == "__main__":
    main()
