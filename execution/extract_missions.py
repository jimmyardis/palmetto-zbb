#!/usr/bin/env python3
"""
extract_missions.py — Extract agency Mission + Vision statements from the
FY2025 State Agency Accountability Reports (AAR2025) and map them to the
115 budget sections in budget_data.db.

Source index : https://www.scstatehouse.gov/reports/aar2025/aar2025.php
Each agency   : a PDF keyed by SC agency code (e.g. N040 = Corrections).
Inside each PDF, page ~3 carries a structured header with the budget
SECTION number, and the Strategic Plan pages carry the Mission + Vision.

The AAR strategic-plan page is a form, so PDF text extraction scrambles
label/value reading order. Rather than fragile positional parsing across
~96 differently-filled templates, we feed the relevant pages to Claude and
ask for the mission + vision verbatim. No arithmetic is involved, so this
respects the suite's "no LLM math" rule.

Usage:
    source ../venv/bin/activate
    python execution/extract_missions.py            # full run (resumable)
    python execution/extract_missions.py --limit 3  # test on first 3
    python execution/extract_missions.py --only N040 # one agency by code

Output: mission_statements.json (keyed by budget section_number)
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sqlite3
import sys
import time
import urllib.parse
from pathlib import Path

import fitz  # pymupdf
import requests
from dotenv import load_dotenv
import anthropic

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT.parent / ".env")
load_dotenv(ROOT / ".env")

AAR_BASE   = "https://www.scstatehouse.gov/reports/aar2025/"
CACHE_DIR  = ROOT / "corpus" / "aar2025"
OUT_PATH   = ROOT / "mission_statements.json"
DB_PATH    = ROOT / "budget_data.db"
CLAUDE_MODEL = "claude-sonnet-4-6"

# (display name, pdf filename) scraped from the AAR2025 index page.
AAR_REPORTS: list[tuple[str, str]] = [
    ("Accident Fund, State", "R120.pdf"),
    ("Aeronautics Commission", "U300.pdf"),
    ("Adjutant General's Office", "E240.pdf"),
    ("Administration, Department of", "D500.pdf"),
    ("Administrative Law Court", "C050.pdf"),
    ("Aging, Department on", "L060.pdf"),
    ("Agriculture, Department of", "P160.pdf"),
    ("Archives and History, Department of", "H790.pdf"),
    ("Arts Commission", "H910.pdf"),
    ("Attorney General", "E200.pdf"),
    ("Auditor, Office of the State", "F270.pdf"),
    ("Blind, Commission for the", "L240.pdf"),
    ("Child Advocacy, Department of", "L080.pdf"),
    ("Clemson University Public Service Activities", "P200.pdf"),
    ("College of Charleston", "H150.pdf"),
    ("The Citadel", "H090.pdf"),
    ("Clemson University", "H120.pdf"),
    ("Coastal Carolina University", "H170.pdf"),
    ("Francis Marion University", "H180.pdf"),
    ("Lander University", "H210.pdf"),
    ("Medical University of South Carolina", "H510 and H530.pdf"),
    ("South Carolina State University", "H240.pdf"),
    ("University of South Carolina", "H270.pdf"),
    ("USC - Aiken", "H290.pdf"),
    ("USC - Beaufort", "H360.pdf"),
    ("USC - Lancaster", "H370.pdf"),
    ("USC - Salkehatchie", "H380.pdf"),
    ("USC - Sumter", "H390.pdf"),
    ("USC - Union", "H400.pdf"),
    ("USC - Upstate", "H340.pdf"),
    ("Winthrop University", "H470.pdf"),
    ("Commerce, Department of", "P320.pdf"),
    ("Comptroller General's Office", "E120.pdf"),
    ("Confederate Relic Room and Museum", "H960.pdf"),
    ("Conservation Bank, South Carolina", "P400.pdf"),
    ("Consumer Affairs, Department of", "R280.pdf"),
    ("Corrections, Department of", "N040.pdf"),
    ("Education, Department of", "H630.pdf"),
    ("Education Oversight Committee", "A850.pdf"),
    ("Educational Television Commission", "H670.pdf"),
    ("Election Commission", "E280.pdf"),
    ("Employment and Workforce, Department of", "R600.pdf"),
    ("Environmental Services, Department of", "P500.pdf"),
    ("Ethics Commission", "R520.pdf"),
    ("Financial Institutions, Board of", "R230.pdf"),
    ("First Steps, Office of", "H620.pdf"),
    ("Fiscal Accountability Authority, State", "E550.pdf"),
    ("Forestry Commission", "P120.pdf"),
    ("Governor's School For Agriculture At John De La Howe School", "L120.pdf"),
    ("Governor's School for Science and Mathematics", "H650.pdf"),
    ("Governor's School for the Arts and Humanities", "H640.pdf"),
    ("Health and Human Services, Department of", "J020.pdf"),
    ("Higher Education, Commission on", "H030.pdf"),
    ("Higher Education Tuition Grants Commission", "H060.pdf"),
    ("Housing Finance and Development Authority", "L320.pdf"),
    ("Human Affairs Commission", "L360.pdf"),
    ("Indigent Defense, Commission on", "E230.pdf"),
    ("Inspector General, Office of", "D250.pdf"),
    ("Insurance, Department of", "R200.pdf"),
    ("Jobs-Economic Development Authority", "P340.pdf"),
    ("Juvenile Justice, Department of", "N120.pdf"),
    ("Labor, Licensing and Regulation, Department of", "R360.pdf"),
    ("Law Enforcement Division, State", "D100.pdf"),
    ("Law Enforcement Training Council", "N200.pdf"),
    ("Community Advancement and Engagement, Commission for", "L460.pdf"),
    ("Motor Vehicles, Department of", "R400.pdf"),
    ("Museum Commission, South Carolina", "H950.pdf"),
    ("Natural Resources, Department of", "P240.pdf"),
    ("Parks, Recreation and Tourism, Department of", "P280.pdf"),
    ("Patriots Point Development Authority", "P360.pdf"),
    ("Probation, Parole and Pardon Services, Department & Board of", "N080.pdf"),
    ("Procurement Review Panel", "S600.pdf"),
    ("Prosecution Coordination, Commission on", "E210.pdf"),
    ("Public Employee Benefit Authority, South Carolina", "F500.pdf"),
    ("Public Health, Department of", "J060.pdf"),
    ("Public Safety, Department of", "K050.pdf"),
    ("Public Service Commission", "R040.pdf"),
    ("Regulatory Staff, Office of", "R060.pdf"),
    ("Resilience, Office of", "D300.pdf"),
    ("Retirement System Investment Commission", "E190.pdf"),
    ("Revenue and Fiscal Affairs Office", "E500.pdf"),
    ("Revenue, Department of", "R440.pdf"),
    ("Rural Infrastructure Authority, South Carolina", "P450.pdf"),
    ("S.C. State University Public Service Activities", "P210.pdf"),
    ("School for the Deaf and the Blind, South Carolina", "H750.pdf"),
    ("Sea Grant Consortium", "P260.pdf"),
    ("Secretary of State", "E080.pdf"),
    ("Social Services, Department of", "L040.pdf"),
    ("State Library, South Carolina", "H870.pdf"),
    ("Technical and Comprehensive Education, State Board for", "H590.pdf"),
    ("Transportation, Department of", "U120.pdf"),
    ("Transportation Infrastructure Bank", "U150.pdf"),
    ("Treasurer's Office, State", "E160.pdf"),
    ("Veterans Affairs', Department of", "E260.pdf"),
    ("Vocational Rehabilitation Department", "H730.pdf"),
    ("Wil Lou Gray Opportunity School", "H710.pdf"),
    ("Workers' Compensation Commission", "R080.pdf"),
]

# Some AARs typo their own SECTION field (USC campuses: "0202B", "10D") or put
# it past page 6, so we pin those to the authoritative budget section here.
CODE_SECTION_OVERRIDE: dict[str, str] = {
    "H270": "20A",  # University of South Carolina (Columbia)
    "H290": "20B",  # USC - Aiken
    "H340": "20C",  # USC - Upstate
    "H360": "20D",  # USC - Beaufort
    "H370": "20E",  # USC - Lancaster
    "H380": "20F",  # USC - Salkehatchie
    "H390": "20G",  # USC - Sumter
    "H400": "20H",  # USC - Union
    "J020": "33",   # Health and Human Services (header on later page)
    "L320": "42",   # Housing Finance and Development Authority
    "H950": "29",   # South Carolina Museum Commission
    "L460": "71",   # Community Advancement and Engagement (fka Minority Affairs)
    "H590": "25",   # State Board for Technical and Comprehensive Education
    "D300": "92D",  # Office of Resilience
    "H620": "2",    # First Steps (header parse collided with Education §1)
    "H210": "18",   # Lander University (collided with ETV §8)
    "H150": "15",   # College of Charleston (collided with PSC §72)
}

EXTRACT_PROMPT = """You are reading the text of a South Carolina State Agency \
Accountability Report (FY2025). The text was extracted from a PDF form, so \
labels and their values may appear out of order.

Find this agency's MISSION statement and VISION statement and return them \
VERBATIM (exact wording, no paraphrasing, no added punctuation). These usually \
sit near the labels "Agency Mission" and "Agency Vision" on the Strategic Plan \
page, but may appear a few lines away due to form layout.

Return ONLY a JSON object, no other text:
{"mission": "<verbatim mission or null>", "vision": "<verbatim vision or null>"}

Rules:
- The value is often SEPARATED from its "Agency Mission"/"Agency Vision" label by \
unrelated form fields (e.g. "Recommendations for reorganization", "None"). Look past \
that boilerplate. Sentences phrased like "The mission of X is to...", "X has as its \
mission to...", or "To <verb>..." are the mission; "The vision of X is..." is the vision.
- If you genuinely cannot identify a statement, use null for that field.
- Do not invent or summarize. Copy the exact sentence(s).
- Strip leading/trailing whitespace and de-hyphenate line breaks.

REPORT TEXT:
"""

_claude: anthropic.Anthropic | None = None


def get_claude() -> anthropic.Anthropic:
    global _claude
    if _claude is None:
        key = os.environ.get("ANTHROPIC_API_KEY", "")
        if not key:
            sys.exit("ANTHROPIC_API_KEY not set (expected in ~/.env)")
        _claude = anthropic.Anthropic(api_key=key)
    return _claude


def download(pdf_file: str) -> Path:
    """Download (and cache) an AAR PDF. Returns local path."""
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    safe = pdf_file.replace(" ", "_")
    local = CACHE_DIR / safe
    if local.exists() and local.stat().st_size > 1000:
        return local
    url = AAR_BASE + urllib.parse.quote(pdf_file)
    r = requests.get(url, timeout=60)
    r.raise_for_status()
    local.write_bytes(r.content)
    return local


def parse_section(full_text: str) -> str | None:
    """Pull the budget SECTION number from the AAR header block.

    Colon is optional ('SECTION \\n020F'); we accept the digits+suffix that
    immediately precede the 'AGENCY' analysis heading.
    """
    m = re.search(
        r"SECTION:?\s*\n?\s*0*([0-9]{1,3}[A-Z]?)\s*\n[\s\n]*AGENCY", full_text
    )
    if m:
        return (m.group(1).lstrip("0") or "0")
    return None


def relevant_text(doc: "fitz.Document") -> str:
    """Mission/vision-bearing pages first (never truncated), then header.

    The AAR strategic-plan form scrambles label/value order, so we include the
    FULL page that mentions the mission plus the following page (values often
    flow over), and put them ahead of the header so the cap can't cut them.
    """
    mission_pages: list[str] = []
    for i in range(doc.page_count):
        t = doc[i].get_text()
        if "Agency Mission" in t or "Agency Vision" in t or "Mission Statement" in t:
            mission_pages.append(t)
            if i + 1 < doc.page_count:
                mission_pages.append(doc[i + 1].get_text())
            if len(mission_pages) >= 6:
                break
    header = "\n".join(doc[i].get_text() for i in range(min(3, doc.page_count)))
    blob = "\n\n".join(mission_pages) + "\n\n--- HEADER ---\n" + header
    return blob[:40000]


def extract_one(name: str, pdf_file: str) -> dict:
    path = download(pdf_file)
    doc = fitz.open(path)
    code = pdf_file.split(".")[0].split(" ")[0].upper()
    section = CODE_SECTION_OVERRIDE.get(code)
    if not section:
        allpages = "\n".join(doc[i].get_text() for i in range(doc.page_count))
        section = parse_section(allpages)
    text = relevant_text(doc)
    doc.close()

    resp = get_claude().messages.create(
        model=CLAUDE_MODEL,
        max_tokens=2048,
        messages=[{"role": "user", "content": EXTRACT_PROMPT + text}],
    )
    raw = resp.content[0].text.strip()
    # Claude sometimes wraps the JSON in ``` fences or prepends prose; grab the
    # outermost {...} object rather than trusting bare output.
    m = re.search(r"\{.*\}", raw, flags=re.DOTALL)
    try:
        parsed = json.loads(m.group(0)) if m else json.loads(raw)
    except json.JSONDecodeError:
        parsed = {"mission": None, "vision": None, "_parse_error": raw[:300]}

    return {
        "aar_name": name,
        "pdf_file": pdf_file,
        "pdf_url": AAR_BASE + urllib.parse.quote(pdf_file),
        "section_number": section,
        "mission": parsed.get("mission"),
        "vision": parsed.get("vision"),
        "source": "FY2025 State Agency Accountability Report",
    }


def load_existing() -> dict:
    if OUT_PATH.exists():
        return json.loads(OUT_PATH.read_text())
    return {}


def db_sections() -> dict[str, str]:
    if not DB_PATH.exists():
        return {}
    c = sqlite3.connect(DB_PATH)
    rows = c.execute("SELECT section_number, agency_name FROM recapitulation").fetchall()
    c.close()
    return {str(s): n for s, n in rows}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0, help="process only first N reports")
    ap.add_argument("--only", type=str, default="", help="single PDF code, e.g. N040")
    ap.add_argument("--force", action="store_true", help="re-extract even if cached in JSON")
    args = ap.parse_args()

    results = load_existing()
    sections = db_sections()

    work = AAR_REPORTS
    if args.only:
        work = [(n, f) for n, f in AAR_REPORTS if f.upper().startswith(args.only.upper())]
    if args.limit:
        work = work[: args.limit]

    done = unmatched = errors = 0
    for name, pdf_file in work:
        key = pdf_file
        if not args.force and key in results and results[key].get("mission"):
            continue
        try:
            rec = extract_one(name, pdf_file)
            sec = rec["section_number"]
            rec["budget_agency_name"] = sections.get(sec) if sec else None
            if sec and sec not in sections:
                unmatched += 1
                rec["_note"] = "section not found in budget_data.db"
            results[key] = rec
            done += 1
            mflag = "✓" if rec["mission"] else "✗MISSION"
            print(f"[{done}] {pdf_file:20} §{sec or '?':4} {mflag}  {name[:40]}")
        except Exception as e:  # noqa: BLE001
            errors += 1
            print(f"[ERR] {pdf_file}: {e}")
        OUT_PATH.write_text(json.dumps(results, indent=2, ensure_ascii=False))
        time.sleep(0.3)

    print(f"\nDone. extracted={done} unmatched_section={unmatched} errors={errors}")
    print(f"Total in {OUT_PATH.name}: {len(results)}")


if __name__ == "__main__":
    main()
