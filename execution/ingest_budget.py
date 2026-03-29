#!/usr/bin/env python3
"""
Palmetto ZBB Suite — Phase 1 Budget Ingestion
==============================================
Source: SC FY2025-2026 Appropriations Act (H.4025), ratified May 28 2025

Data sources:
  tap1a.htm  — Part IA appropriations tables (HTML, parsed with BeautifulSoup)
  tap1b.pdf  — Part IB general provisions / provisos (PDF text → Pinecone)
  tarev.pdf  — Statement of revenues (PDF text → Pinecone)
  tap1b.pdf  — (also scanned for federal match flags)
  exec_budget — Governor's Executive Budget FY26 (PDF text → Pinecone)

SQLite schema:
  total_funds   — verbatim from HTML "TOTAL FUNDS" column, stored as integer CENTS
  general_funds — verbatim from HTML "GENERAL FUNDS" column, stored as integer CENTS
  other_funds   — computed: total_funds - general_funds (all non-general-fund appropriations)
  federal_funds — NOT SEPARATELY AVAILABLE in Part IA HTML source; stored as 0

CRITICAL: All money stored as INTEGER CENTS. $1,234,567 → 123456700.
          No floats are used at any point in this pipeline.

Usage:
  python execution/ingest_budget.py [--phase 1a|1b|1c|1d|all]
                                     [--skip-download] [--clear-db]
"""

import os
import re
import sys
import json
import sqlite3
import hashlib
import logging
import argparse
import requests
import pdfplumber
import tiktoken

from bs4 import BeautifulSoup
from pathlib import Path
from datetime import datetime, timezone
from typing import Optional

# ─── Paths ──────────────────────────────────────────────────────────────────
ROOT     = Path(__file__).parent.parent
PDF_DIR  = ROOT / "pdfs"
HTML_DIR = ROOT / "pdfs"   # HTML files stored alongside PDFs
DB_PATH  = ROOT / "budget_data.db"
LOG_PATH = ROOT / "ingestion.log"

BASE_URL = "https://www.scstatehouse.gov/sess126_2025-2026/appropriations2025/"

SOURCES = {
    "tap1a_htm": {
        "url": BASE_URL + "tap1a.htm",
        "filename": "tap1a.htm",
        "description": "Part IA — FY2025-2026 Appropriations Tables (H.4025)",
        "type": "part_ia_html",
    },
    "tap1a_pdf": {
        "url": BASE_URL + "tap1a.pdf",
        "filename": "tap1a.pdf",
        "description": "Part IA — FY2025-2026 Appropriations Tables PDF",
        "type": "part_ia_pdf",
    },
    "tap1b_pdf": {
        "url": BASE_URL + "tap1b.pdf",
        "filename": "tap1b.pdf",
        "description": "Part IB — FY2025-2026 General Provisions / Provisos",
        "type": "part_ib",
    },
    "tarev_pdf": {
        "url": BASE_URL + "tarev.pdf",
        "filename": "tarev.pdf",
        "description": "FY2025-2026 Statement of Revenues",
        "type": "revenue",
    },
}

EXEC_BUDGET_URL = (
    "https://governor.sc.gov/sites/governor/files/Documents/"
    "Executive-Budget/FY26%20Executive%20Budget%20Book.pdf"
)

FISCAL_YEAR = "2025-2026"

FEDERAL_KEYWORDS = re.compile(
    r"\b(federal|match|FMAP|Title XIX|Title XX|Title IV|TANF|Medicaid|Medicare"
    r"|match rate|matching funds|federal share|federal participation"
    r"|maintenance of effort|MOE|CHIP|CMS|HHS|SNAP|WIC|appropriation act)\b",
    re.IGNORECASE,
)

# ─── Logging ────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(LOG_PATH),
    ],
)
log = logging.getLogger(__name__)


# ════════════════════════════════════════════════════════════════════════════
# DOLLAR PARSING — Integer cents only. No floats.
# ════════════════════════════════════════════════════════════════════════════

def parse_dollar(text: str) -> int:
    """
    Convert a dollar string to integer cents. Never uses float.

    $1,234,567  →  123456700
    1,234,567   →  123456700
    (1,234,567) →  -123456700  (parentheses = negative)
    -           →  0
    ""          →  0
    """
    if not text:
        return 0

    text = text.strip().replace("\xa0", "").replace(",", "").replace("$", "").replace(" ", "")

    if not text or text in ("-", "--", "N/A", "n/a"):
        return 0

    negative = False
    if text.startswith("(") and text.endswith(")"):
        negative = True
        text = text[1:-1]
    elif text.startswith("-"):
        negative = True
        text = text[1:]

    # Strip decimal — SC budget shows whole dollars
    if "." in text:
        whole, frac = text.split(".", 1)
        if frac.strip("0"):
            log.debug("Non-zero cents in source: '%s' — truncated", text)
        text = whole

    if not text:
        return 0

    # Skip FTE counts like "(1.00)" already handled above,
    # also skip if text still has non-numeric chars after stripping
    try:
        dollars = int(text)
    except ValueError:
        return 0

    cents = dollars * 100
    return -cents if negative else cents


def is_fte_value(text: str) -> bool:
    """Return True if this looks like a position count: (1.00), (325.04) etc."""
    t = text.strip()
    return bool(re.match(r"^\(\d+\.\d{2}\)$", t))


def cents_to_display(cents: int) -> str:
    """Format integer cents as dollar string."""
    sign = "-" if cents < 0 else ""
    return f"{sign}${abs(cents) // 100:,.0f}"


# ════════════════════════════════════════════════════════════════════════════
# DATABASE
# ════════════════════════════════════════════════════════════════════════════

def setup_db(conn: sqlite3.Connection):
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS line_items (
            id                    INTEGER PRIMARY KEY AUTOINCREMENT,
            agency_name           TEXT    NOT NULL,
            section_number        TEXT,
            subsection_name       TEXT,
            line_item_description TEXT    NOT NULL,
            general_funds         INTEGER NOT NULL DEFAULT 0,
            federal_funds         INTEGER NOT NULL DEFAULT 0,
            other_funds           INTEGER NOT NULL DEFAULT 0,
            total_funds           INTEGER NOT NULL DEFAULT 0,
            fiscal_year           TEXT    NOT NULL DEFAULT '2025-2026',
            source_doc            TEXT    NOT NULL,
            page_number           INTEGER,
            extraction_confidence TEXT    NOT NULL DEFAULT 'high'
                CHECK(extraction_confidence IN ('high','low')),
            is_total_row          INTEGER NOT NULL DEFAULT 0,
            has_federal_match     INTEGER NOT NULL DEFAULT 0,
            federal_match_note    TEXT,
            created_at            TEXT    DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS recapitulation (
            section_number TEXT    NOT NULL,
            agency_name    TEXT    NOT NULL,
            total_funds    INTEGER NOT NULL,
            general_funds  INTEGER NOT NULL,
            source_doc     TEXT    NOT NULL,
            PRIMARY KEY (section_number)
        );

        CREATE TABLE IF NOT EXISTS reconciliation_log (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            run_at         TEXT    NOT NULL,
            section_number TEXT    NOT NULL,
            agency_name    TEXT    NOT NULL,
            recap_total    INTEGER NOT NULL,
            db_total       INTEGER NOT NULL,
            delta_cents    INTEGER NOT NULL,
            status         TEXT    NOT NULL
        );

        CREATE TABLE IF NOT EXISTS ingestion_meta (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_section   ON line_items(section_number);
        CREATE INDEX IF NOT EXISTS idx_agency    ON line_items(agency_name);
        CREATE INDEX IF NOT EXISTS idx_federal   ON line_items(has_federal_match);
        CREATE INDEX IF NOT EXISTS idx_total_row ON line_items(is_total_row);
    """)
    conn.commit()
    log.info("Database schema ready: %s", DB_PATH)


# ════════════════════════════════════════════════════════════════════════════
# DOWNLOADS
# ════════════════════════════════════════════════════════════════════════════

def download_file(url: str, dest: Path, force: bool = False) -> bool:
    if dest.exists() and not force:
        log.info("  Already present: %s (%.1f MB)", dest.name, dest.stat().st_size / 1_048_576)
        return True
    log.info("  Downloading %s ...", dest.name)
    try:
        r = requests.get(url, timeout=180, stream=True,
                         headers={"User-Agent": "Mozilla/5.0 (research bot)"})
        r.raise_for_status()
        PDF_DIR.mkdir(parents=True, exist_ok=True)
        with open(dest, "wb") as f:
            for chunk in r.iter_content(65536):
                f.write(chunk)
        log.info("  Downloaded %s (%.1f MB)", dest.name, dest.stat().st_size / 1_048_576)
        return True
    except Exception as e:
        log.error("  Download failed %s: %s", url, e)
        return False


def download_all(skip: bool = False) -> dict[str, Path]:
    paths: dict[str, Path] = {}

    if not skip:
        log.info("Downloading source documents ...")
        for key, meta in SOURCES.items():
            dest = PDF_DIR / meta["filename"]
            ok = download_file(meta["url"], dest)
            if not ok and "tap1a_htm" in key:
                log.critical("Part IA HTML is required. Cannot continue.")
                sys.exit(1)

        # Executive Budget (optional)
        eb = PDF_DIR / "exec_budget_fy26.pdf"
        download_file(EXEC_BUDGET_URL, eb)
    else:
        log.info("--skip-download: using existing files")

    # Build paths dict from whatever exists on disk
    for key, meta in SOURCES.items():
        p = PDF_DIR / meta["filename"]
        if p.exists():
            paths[key] = p
    eb = PDF_DIR / "exec_budget_fy26.pdf"
    if eb.exists():
        paths["exec_budget"] = eb

    return paths


# ════════════════════════════════════════════════════════════════════════════
# STEP 1A — PART IA HTML PARSING
# ════════════════════════════════════════════════════════════════════════════

_FTE_RE    = re.compile(r"^\([\d]+\.[\d]{2}\)$")
_NUMBER_RE = re.compile(r"^[\d,]+$")


def parse_part_ia_html(html_path: Path, conn: sqlite3.Connection) -> int:
    """
    Parse Part IA HTML into SQLite line_items and recapitulation tables.
    Returns count of data rows (non-total) inserted.

    HTML column structure (4 <td> per data row):
      [0] blank/section-number   [1] description   [2] TOTAL FUNDS   [3] GENERAL FUNDS

    Note: federal_funds is not separately available in Part IA HTML.
          other_funds = total_funds - general_funds (all non-GF appropriations).
    """
    log.info("=== Phase 1A: Parsing Part IA HTML ===")

    with open(html_path, "r", encoding="iso-8859-1", errors="replace") as f:
        html = f.read()

    soup = BeautifulSoup(html, "lxml")

    # Track state across page divs
    current_section   = None
    current_agency    = None
    current_subsection = None
    current_page      = 0
    rows_inserted     = 0
    in_recap          = False

    # Process page-break divs in document order
    page_divs = soup.find_all("div", style=re.compile("page-break-after"))

    for page_div in page_divs:
        # ── Detect page number ────────────────────────────────────────────
        next_sib = page_div.find_next_sibling("div", style=re.compile("text-align.*center"))
        if next_sib and next_sib.get_text().strip().startswith("pg."):
            try:
                current_page = int(next_sib.get_text().strip().split(".")[-1].strip())
            except ValueError:
                pass

        # ── Detect recapitulation sections ───────────────────────────────
        anchor = page_div.find("a", {"name": True})
        if anchor and anchor.get("name", "").lower() == "srecap":
            in_recap = True
        elif anchor and anchor.get("name", "").lower().startswith("s"):
            in_recap = False

        if in_recap:
            _parse_recap_tables(page_div, conn, current_page)
            continue

        # ── Extract section header from first basetable3 on the page ─────
        tables = page_div.find_all("table", class_="basetable3")
        if not tables:
            continue

        first_table = tables[0]
        header_row = first_table.find("tr", style=re.compile("font-weight.*bold"))
        if header_row:
            cells = header_row.find_all("td")
            if cells:
                sec_cell = cells[0].get_text(strip=True)
                if sec_cell.startswith("Sec."):
                    new_sec = sec_cell.replace("Sec.", "").strip()
                    # Agency name may span multiple cells
                    if len(cells) > 1:
                        new_agency = " ".join(
                            c.get_text(separator=" ", strip=True)
                            for c in cells[1:]
                            if c.get_text(strip=True)
                        ).strip()
                    else:
                        new_agency = ""

                    if new_sec:
                        current_section    = new_sec
                        current_agency     = new_agency
                        current_subsection = None

        if not current_section:
            continue

        # ── Process data tables on this page ─────────────────────────────
        # Skip the first (header) table; process remaining
        for table in tables[1:]:
            for tr in table.find_all("tr"):
                cells = tr.find_all("td")
                if len(cells) < 2:
                    continue

                # Extract cell texts
                texts = [c.get_text(separator=" ", strip=True).replace("\xa0", "").strip()
                         for c in cells]

                # ── Sub-section header: colspan=3 on col 2 ───────────────
                # e.g. "I. SUPERINTENDENT OF EDUCATION"
                second_cell = cells[1] if len(cells) > 1 else None
                if second_cell and second_cell.get("colspan"):
                    hdr = texts[1] if len(texts) > 1 else ""
                    if hdr and not hdr.startswith("TOTAL FUNDS") and not hdr.startswith("GENERAL FUNDS"):
                        current_subsection = hdr
                    continue

                # ── Column header row (skip) ──────────────────────────────
                if len(texts) >= 3 and ("TOTAL FUNDS" in texts[2] or "GENERAL FUNDS" in texts[2]):
                    continue

                # ── Need exactly 4 cells for a data row ──────────────────
                if len(cells) < 4:
                    continue

                desc_raw  = texts[1] if len(texts) > 1 else ""
                total_raw = texts[2] if len(texts) > 2 else ""
                gf_raw    = texts[3] if len(texts) > 3 else ""

                # Skip blank rows
                if not desc_raw:
                    continue

                # Skip FTE position count rows (values look like "(1.00)")
                if is_fte_value(total_raw) or is_fte_value(gf_raw):
                    continue

                # Skip if both money cells are blank/dashes (continuation
                # of a wrapped multi-line description)
                if not total_raw and not gf_raw:
                    continue

                total_cents = parse_dollar(total_raw)
                gf_cents    = parse_dollar(gf_raw)
                other_cents = total_cents - gf_cents   # integer arithmetic only

                # Skip rows with negative totals — these are HTML continuation text artifacts
                # where a wrapped multi-line description's second line is mis-parsed.
                # They carry no real appropriations data.
                if total_cents < 0 or gf_cents < 0:
                    log.debug("  Skipping negative-value continuation row sec=%s desc='%s' total=%s page=%d",
                              current_section, desc_raw[:50], cents_to_display(total_cents), current_page)
                    continue

                confidence = "high"

                # Detect total/subtotal rows by description text (bold is on <td>, not <tr>)
                is_total = desc_raw.upper().startswith("TOTAL")

                conn.execute("""
                    INSERT INTO line_items
                        (agency_name, section_number, subsection_name,
                         line_item_description,
                         general_funds, federal_funds, other_funds, total_funds,
                         fiscal_year, source_doc, page_number,
                         extraction_confidence, is_total_row)
                    VALUES
                        (?,?,?,?,?,?,?,?,?,?,?,?,?)
                """, (
                    current_agency,
                    current_section,
                    current_subsection,
                    desc_raw,
                    gf_cents,
                    0,              # federal_funds not in Part IA HTML source
                    other_cents,
                    total_cents,
                    FISCAL_YEAR,
                    html_path.name,
                    current_page,
                    confidence,
                    1 if is_total else 0,
                ))

                if not is_total:
                    rows_inserted += 1

    conn.commit()
    log.info("Phase 1A complete: %d data rows inserted (total_rows incl. totals: see DB)", rows_inserted)
    return rows_inserted


def _parse_recap_tables(page_div, conn: sqlite3.Connection, page_num: int):
    """Extract recapitulation agency totals into the recapitulation table."""
    for table in page_div.find_all("table"):
        for tr in table.find_all("tr"):
            cells = tr.find_all("td")
            if len(cells) < 4:
                continue

            texts = [c.get_text(separator=" ", strip=True).replace("\xa0", "").strip()
                     for c in cells]

            sec_num  = texts[0]
            agency   = texts[1]
            total_r  = texts[2]
            gf_r     = texts[3]

            # Section number should be a digit (or like "20A", "91B")
            if not sec_num or not re.match(r"^\d", sec_num):
                continue

            # Skip header rows
            if "TOTAL FUNDS" in total_r or "GENERAL FUNDS" in gf_r:
                continue

            # Skip FTE rows
            if is_fte_value(total_r):
                continue

            if not total_r and not gf_r:
                continue

            total_cents = parse_dollar(total_r)
            gf_cents    = parse_dollar(gf_r)

            if total_cents == 0 and gf_cents == 0 and not agency:
                continue

            # Upsert: some agencies span multiple recap pages (continuation rows)
            existing = conn.execute(
                "SELECT total_funds, general_funds FROM recapitulation WHERE section_number=?",
                (sec_num,)
            ).fetchone()

            if existing:
                # Accumulate continuation rows (same section, extra agency name text)
                # The continuation rows have blank money columns — skip them
                pass
            elif total_cents > 0 or agency:
                conn.execute("""
                    INSERT OR IGNORE INTO recapitulation
                        (section_number, agency_name, total_funds, general_funds, source_doc)
                    VALUES (?,?,?,?,?)
                """, (sec_num, agency, total_cents, gf_cents, "tap1a.htm"))

    conn.commit()


# ════════════════════════════════════════════════════════════════════════════
# STEP 1B — RECONCILIATION
# ════════════════════════════════════════════════════════════════════════════

def run_reconciliation(conn: sqlite3.Connection) -> bool:
    """
    Compare DB line_item sums vs. recapitulation totals.
    Prints full reconciliation report.
    Returns True if all agencies pass (delta < $1,000).
    """
    log.info("")
    log.info("════════════════════════════════════════════════")
    log.info("  STEP 1B — RECONCILIATION REPORT")
    log.info("════════════════════════════════════════════════")

    # Overall DB totals (non-total rows only to avoid double-counting)
    overall = conn.execute("""
        SELECT
            SUM(total_funds)   AS sum_total,
            SUM(general_funds) AS sum_gf,
            COUNT(*)           AS row_count,
            SUM(CASE WHEN extraction_confidence='low' THEN 1 ELSE 0 END) AS low_count
        FROM line_items
        WHERE is_total_row = 0
    """).fetchone()

    sum_total = overall["sum_total"] or 0
    sum_gf    = overall["sum_gf"]    or 0
    row_count = overall["row_count"] or 0
    low_count = overall["low_count"] or 0

    # Recapitulation grand total
    recap_totals = conn.execute("""
        SELECT SUM(total_funds) AS rt, SUM(general_funds) AS rg, COUNT(*) AS sections
        FROM recapitulation
    """).fetchone()
    recap_total = recap_totals["rt"] or 0
    recap_gf    = recap_totals["rg"] or 0
    recap_secs  = recap_totals["sections"] or 0

    log.info("")
    log.info("LINE ITEMS (non-total rows):")
    log.info("  SUM(total_funds)   : %s", cents_to_display(sum_total))
    log.info("  SUM(general_funds) : %s", cents_to_display(sum_gf))
    log.info("  Row count          : %d", row_count)
    log.info("  Low-confidence     : %d", low_count)
    log.info("")
    log.info("RECAPITULATION (verbatim from HTML):")
    log.info("  Grand total        : %s", cents_to_display(recap_total))
    log.info("  General fund total : %s", cents_to_display(recap_gf))
    log.info("  Agency sections    : %d", recap_secs)
    log.info("")

    run_at = datetime.now(timezone.utc).isoformat()
    all_pass = True

    # Per-section reconciliation
    log.info("PER-SECTION RECONCILIATION:")
    log.info(f"  {'Sec':<6} {'Agency':<45} {'Recap Total':>18} {'DB Sum':>18} {'Delta':>12} Status")
    log.info("  " + "─" * 110)

    recap_rows = conn.execute(
        "SELECT section_number, agency_name, total_funds, general_funds FROM recapitulation ORDER BY section_number"
    ).fetchall()

    for r in recap_rows:
        sec    = r["section_number"]
        agency = r["agency_name"]
        recap_tf = r["total_funds"] or 0

        db_sum = conn.execute("""
            SELECT SUM(total_funds) AS s
            FROM line_items
            WHERE section_number=? AND is_total_row=0
        """, (sec,)).fetchone()["s"] or 0

        delta = abs(db_sum - recap_tf)
        status = "PASS" if delta < 100_000 else "WARN"

        if status == "WARN":
            all_pass = False
            log.warning("  %-6s %-45s %18s %18s %12s [%s]",
                        sec, agency[:45],
                        cents_to_display(recap_tf), cents_to_display(db_sum),
                        cents_to_display(delta), status)
        else:
            log.info("  %-6s %-45s %18s %18s %12s [%s]",
                     sec, agency[:45],
                     cents_to_display(recap_tf), cents_to_display(db_sum),
                     cents_to_display(delta), status)

        conn.execute("""
            INSERT INTO reconciliation_log
                (run_at, section_number, agency_name, recap_total, db_total, delta_cents, status)
            VALUES (?,?,?,?,?,?,?)
        """, (run_at, sec, agency, recap_tf, db_sum, delta, status))

    conn.commit()

    # ── Anti-hallucination verification block (per spec) ─────────────────
    log.info("")
    log.info("════════════════════════════════════════════════")
    log.info("  ANTI-HALLUCINATION VERIFICATION")
    log.info("  (Report these 3 values to user for spot-check)")
    log.info("════════════════════════════════════════════════")
    log.info("  [1] SELECT SUM(total_funds) FROM line_items   : %s", cents_to_display(sum_total))
    log.info("  [2] SELECT SUM(general_funds) FROM line_items : %s", cents_to_display(sum_gf))
    log.info("  [3] Low-confidence rows                       : %d", low_count)
    log.info("")

    # ── Spot-check: 3 random agencies ────────────────────────────────────
    log.info("SPOT-CHECK — 3 RANDOM AGENCIES (first 8 line items each):")
    sample = conn.execute("""
        SELECT DISTINCT section_number, agency_name
        FROM line_items
        WHERE is_total_row=0
        ORDER BY RANDOM()
        LIMIT 3
    """).fetchall()

    for s in sample:
        sec    = s["section_number"]
        agency = s["agency_name"]
        log.info("")
        log.info("  ── Section %s: %s ──", sec, agency)

        items = conn.execute("""
            SELECT line_item_description, general_funds, other_funds, total_funds,
                   source_doc, page_number, extraction_confidence
            FROM line_items
            WHERE section_number=? AND agency_name=? AND is_total_row=0
            ORDER BY id
            LIMIT 8
        """, (sec, agency)).fetchall()

        for it in items:
            log.info("    [p.%s|%s] %-45s  GF:%s  Other:%s  TOT:%s",
                     str(it["page_number"]).ljust(3),
                     it["extraction_confidence"],
                     (it["line_item_description"] or "")[:45],
                     cents_to_display(it["general_funds"] or 0).rjust(14),
                     cents_to_display(it["other_funds"] or 0).rjust(14),
                     cents_to_display(it["total_funds"] or 0).rjust(14))

    log.info("")
    log.info("Recap GF total      : %s", cents_to_display(recap_gf))
    log.info("Reconciliation      : %s", "PASS" if all_pass else "WARNINGS PRESENT")

    conn.execute("INSERT OR REPLACE INTO ingestion_meta VALUES (?,?)",
                 ("last_reconciliation", run_at))
    conn.execute("INSERT OR REPLACE INTO ingestion_meta VALUES (?,?)",
                 ("reconciliation_status", "pass" if all_pass else "warning"))
    conn.execute("INSERT OR REPLACE INTO ingestion_meta VALUES (?,?)",
                 ("recap_total_cents", str(recap_total)))
    conn.execute("INSERT OR REPLACE INTO ingestion_meta VALUES (?,?)",
                 ("recap_gf_cents", str(recap_gf)))
    conn.commit()

    return all_pass


# ════════════════════════════════════════════════════════════════════════════
# STEP 1C — NARRATIVE CHUNKING (Pinecone)
# ════════════════════════════════════════════════════════════════════════════

PINECONE_INDEX = "sc-budget"
PINECONE_NS    = "fy2026-zia"
VOYAGE_MODEL   = "voyage-3"
VOYAGE_DIMS    = 1024
CHUNK_TOKENS   = 600
CHUNK_OVERLAP  = 100
MIN_TOKENS     = 50


def chunk_text(text: str) -> list[str]:
    enc    = tiktoken.get_encoding("cl100k_base")
    tokens = enc.encode(text)
    chunks = []
    start  = 0
    while start < len(tokens):
        end    = min(start + CHUNK_TOKENS, len(tokens))
        piece  = tokens[start:end]
        if len(piece) < MIN_TOKENS:
            break
        chunks.append(enc.decode(piece))
        start += CHUNK_TOKENS - CHUNK_OVERLAP
    return chunks


def extract_pdf_pages(pdf_path: Path) -> list[dict]:
    """Returns [{page: n, text: str}] from a PDF."""
    pages = []
    with pdfplumber.open(pdf_path) as pdf:
        for i, page in enumerate(pdf.pages, 1):
            text = (page.extract_text(x_tolerance=3, y_tolerance=3) or "").strip()
            if text:
                pages.append({"page": i, "text": text})
    return pages


def setup_pinecone(pinecone_key: str):
    from pinecone import Pinecone, ServerlessSpec
    pc = Pinecone(api_key=pinecone_key)
    existing = {idx.name for idx in pc.list_indexes().indexes}
    if PINECONE_INDEX not in existing:
        log.info("Creating Pinecone index '%s' ...", PINECONE_INDEX)
        pc.create_index(
            name=PINECONE_INDEX,
            dimension=VOYAGE_DIMS,
            metric="cosine",
            spec=ServerlessSpec(cloud="aws", region="us-east-1"),
        )
    else:
        log.info("Pinecone index '%s' exists", PINECONE_INDEX)
    return pc.Index(PINECONE_INDEX)


def build_section_map(conn: sqlite3.Connection) -> dict:
    """Map section_number → list of agency name keywords for proviso linking."""
    rows = conn.execute("""
        SELECT DISTINCT section_number, agency_name FROM line_items
        WHERE section_number IS NOT NULL
    """).fetchall()
    skip = {"and", "the", "for", "of", "in", "at", "by", "to", "sc", "state",
            "south", "carolina", "commission", "department"}
    result = {}
    for r in rows:
        kws = [w.lower() for w in (r["agency_name"] or "").split()
               if len(w) > 3 and w.lower() not in skip]
        result[r["section_number"]] = kws[:3]
    return result


def ingest_pdf_to_pinecone(key: str, description: str, pdf_path: Path,
                            section_map: dict, voyage, pc_index) -> int:
    log.info("Chunking %s → Pinecone ...", pdf_path.name)
    pages = extract_pdf_pages(pdf_path)
    all_chunks = []

    for p in pages:
        for ci, chunk in enumerate(chunk_text(p["text"])):
            # Find linked sections
            linked = []
            for sec, kws in section_map.items():
                if re.search(r"\bSection\s+" + re.escape(sec) + r"\b", chunk, re.I):
                    linked.append(sec)
                elif kws and any(kw in chunk.lower() for kw in kws):
                    if sec not in linked:
                        linked.append(sec)

            chunk_id = hashlib.sha256(f"{key}:{p['page']}:{ci}".encode()).hexdigest()[:32]
            all_chunks.append({
                "id": chunk_id,
                "text": chunk,
                "meta": {
                    "source_id": key,
                    "source_pdf": pdf_path.name,
                    "description": description,
                    "fiscal_year": FISCAL_YEAR,
                    "page_number": p["page"],
                    "chunk_index": ci,
                    "linked_section": ",".join(linked),
                    "text_preview": chunk[:200],
                },
            })

    BATCH = 96
    upserted = 0
    for i in range(0, len(all_chunks), BATCH):
        batch = all_chunks[i : i + BATCH]
        try:
            result = voyage.embed([c["text"] for c in batch],
                                  model=VOYAGE_MODEL, input_type="document")
            vectors = [{"id": c["id"], "values": emb, "metadata": c["meta"]}
                       for c, emb in zip(batch, result.embeddings)]
            pc_index.upsert(vectors=vectors, namespace=PINECONE_NS)
            upserted += len(vectors)
            log.info("  Batch %d/%d: %d vectors",
                     i // BATCH + 1, (len(all_chunks) + BATCH - 1) // BATCH, len(vectors))
        except Exception as e:
            log.error("  Upsert error batch %d: %s", i // BATCH, e)

    return upserted


# ════════════════════════════════════════════════════════════════════════════
# STEP 1D — FEDERAL MATCH FLAGS
# ════════════════════════════════════════════════════════════════════════════

def flag_federal_match(conn: sqlite3.Connection, ib_path: Path):
    """
    Scan Part IB proviso text for federal match language.
    Update SQLite line_items with has_federal_match=1.
    """
    log.info("=== Phase 1D: Federal match flagging ===")

    pages = extract_pdf_pages(ib_path)
    full_text = "\n".join(p["text"] for p in pages)

    # SC provisos look like "1.1. (LEG: ..." or "33.7. (DHHS: ..."
    proviso_re = re.compile(
        r"(\d+)\.(\d+)\.\s*\(([^)]+)\)([^\n]*(?:\n(?!\d+\.\d+\.).*)*)",
        re.MULTILINE,
    )

    flagged_total = 0
    for m in proviso_re.finditer(full_text):
        sec_num      = m.group(1)           # "33"
        proviso_body = m.group(0)[:1000]    # full proviso text, capped

        if not FEDERAL_KEYWORDS.search(proviso_body):
            continue

        updated = conn.execute("""
            UPDATE line_items
            SET has_federal_match  = 1,
                federal_match_note = COALESCE(federal_match_note, ?)
            WHERE section_number = ?
        """, (proviso_body, sec_num)).rowcount

        flagged_total += updated

    conn.commit()

    # Summary
    total_flagged = conn.execute(
        "SELECT COUNT(*) FROM line_items WHERE has_federal_match=1"
    ).fetchone()[0]
    fed_value = conn.execute(
        "SELECT SUM(other_funds) FROM line_items WHERE has_federal_match=1 AND is_total_row=0"
    ).fetchone()[0] or 0

    log.info("Federal match: %d rows flagged", total_flagged)
    log.info("Non-GF funds in flagged items: %s", cents_to_display(fed_value))


# ════════════════════════════════════════════════════════════════════════════
# MAIN
# ════════════════════════════════════════════════════════════════════════════

def load_env():
    from dotenv import load_dotenv
    load_dotenv(ROOT.parent / ".env")
    load_dotenv(ROOT / ".env")


def main():
    parser = argparse.ArgumentParser(description="Palmetto ZBB Suite — Phase 1 Ingestion")
    parser.add_argument("--phase", choices=["1a", "1b", "1c", "1d", "all"], default="all")
    parser.add_argument("--skip-download", action="store_true")
    parser.add_argument("--force-download", action="store_true")
    parser.add_argument("--clear-db", action="store_true",
                        help="Clear existing line_items before extraction")
    args = parser.parse_args()

    load_env()
    log.info("Palmetto ZBB Suite — Phase 1 Ingestion")
    log.info("DB: %s", DB_PATH)

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    setup_db(conn)

    if args.clear_db:
        log.info("--clear-db: clearing line_items and recapitulation")
        conn.execute("DELETE FROM line_items")
        conn.execute("DELETE FROM recapitulation")
        conn.execute("DELETE FROM reconciliation_log")
        conn.commit()

    phases = set()
    if args.phase == "all":
        phases = {"1a", "1b", "1c", "1d"}
    else:
        phases = {args.phase}

    paths = download_all(skip=args.skip_download)

    # ── Phase 1A ─────────────────────────────────────────────────────────
    if "1a" in phases:
        htm = paths.get("tap1a_htm")
        if not htm:
            log.critical("tap1a.htm not found")
            sys.exit(1)
        parse_part_ia_html(htm, conn)

    # ── Phase 1B ─────────────────────────────────────────────────────────
    if "1b" in phases:
        recon_ok = run_reconciliation(conn)
        status = "PASS" if recon_ok else "WARNING"
        log.info("")
        log.info("══ RECONCILIATION: %s ══", status)
        if not recon_ok:
            log.warning("Discrepancies found. Review before proceeding to Phase 2.")

    # ── Phase 1C ─────────────────────────────────────────────────────────
    if "1c" in phases:
        vk = os.environ.get("VOYAGE_API_KEY", "")
        pk = os.environ.get("PINECONE_API_KEY", "")
        if not vk or not pk:
            log.error("VOYAGE_API_KEY and PINECONE_API_KEY required for Phase 1C")
        else:
            import voyageai
            voyage    = voyageai.Client(api_key=vk)
            pc_index  = setup_pinecone(pk)
            sec_map   = build_section_map(conn)

            ib = paths.get("tap1b_pdf")
            if ib:
                n = ingest_pdf_to_pinecone(
                    "tap1b", SOURCES["tap1b_pdf"]["description"], ib, sec_map, voyage, pc_index)
                conn.execute("INSERT OR REPLACE INTO ingestion_meta VALUES (?,?)",
                             ("pinecone_ib_vectors", str(n)))
                log.info("Part IB: %d vectors", n)

            rev = paths.get("tarev_pdf")
            if rev:
                n = ingest_pdf_to_pinecone(
                    "tarev", SOURCES["tarev_pdf"]["description"], rev, sec_map, voyage, pc_index)
                log.info("Revenues: %d vectors", n)

            eb = paths.get("exec_budget")
            if eb:
                n = ingest_pdf_to_pinecone(
                    "exec_budget", "FY2026 Governor's Executive Budget", eb, sec_map, voyage, pc_index)
                conn.execute("INSERT OR REPLACE INTO ingestion_meta VALUES (?,?)",
                             ("pinecone_eb_vectors", str(n)))
                log.info("Executive Budget: %d vectors", n)

            conn.execute("INSERT OR REPLACE INTO ingestion_meta VALUES (?,?)",
                         ("last_pinecone_ingest", datetime.now(timezone.utc).isoformat()))
            conn.commit()

    # ── Phase 1D ─────────────────────────────────────────────────────────
    if "1d" in phases:
        ib = paths.get("tap1b_pdf")
        if ib:
            flag_federal_match(conn, ib)
        else:
            log.error("tap1b.pdf required for Phase 1D")

    # ── Final summary ─────────────────────────────────────────────────────
    log.info("")
    log.info("═══════════ PHASE 1 SUMMARY ═══════════")
    total_rows = conn.execute("SELECT COUNT(*) FROM line_items WHERE is_total_row=0").fetchone()[0]
    low_rows   = conn.execute("SELECT COUNT(*) FROM line_items WHERE extraction_confidence='low'").fetchone()[0]
    fed_rows   = conn.execute("SELECT COUNT(*) FROM line_items WHERE has_federal_match=1").fetchone()[0]
    sum_total  = conn.execute("SELECT SUM(total_funds) FROM line_items WHERE is_total_row=0").fetchone()[0] or 0
    sum_gf     = conn.execute("SELECT SUM(general_funds) FROM line_items WHERE is_total_row=0").fetchone()[0] or 0
    recap_tot  = conn.execute("SELECT SUM(total_funds) FROM recapitulation").fetchone()[0] or 0
    recap_gf   = conn.execute("SELECT SUM(general_funds) FROM recapitulation").fetchone()[0] or 0

    log.info("  Data rows (non-total)       : %d", total_rows)
    log.info("  Low-confidence rows         : %d", low_rows)
    log.info("  Federal match flagged       : %d", fed_rows)
    log.info("  SUM(total_funds) line items : %s", cents_to_display(sum_total))
    log.info("  SUM(general_funds) line items: %s", cents_to_display(sum_gf))
    log.info("  Recapitulation grand total  : %s", cents_to_display(recap_tot))
    log.info("  Recapitulation GF total     : %s", cents_to_display(recap_gf))
    log.info("  DB: %s", DB_PATH)
    log.info("")
    log.info("  ▶ STOP: Report the 3 anti-hallucination numbers to the user")
    log.info("  ▶ for manual verification before proceeding to Phase 2.")

    conn.close()


if __name__ == "__main__":
    main()
