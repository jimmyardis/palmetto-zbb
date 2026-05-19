#!/usr/bin/env python3
"""
Palmetto ZBB Suite — FY2024-2025 Prior Year Ingestion
======================================================
Source: SC FY2024-2025 Appropriations Act (H.5100), Part IA
URL: https://www.scstatehouse.gov/sess125_2023-2024/appropriations2024/tap1a.htm

Appends fiscal_year='2024-2025' rows to the existing line_items table.
Does NOT touch existing FY2025-2026 data.

Recap stored in recapitulation_fy (section_number, fiscal_year) compound PK.
Reconciliation runs against FY2024-2025 rows only.

Usage:
  python execution/ingest_prior_year.py [--skip-download]
"""

import os
import re
import sys
import sqlite3
import logging
import argparse
import requests

from bs4 import BeautifulSoup
from pathlib import Path
from datetime import datetime, timezone

# ─── Paths ──────────────────────────────────────────────────────────────────
ROOT     = Path(__file__).parent.parent
PDF_DIR  = ROOT / "pdfs"
DB_PATH  = ROOT / "budget_data.db"
LOG_PATH = ROOT / "ingestion_prior.log"

FISCAL_YEAR  = "2024-2025"
SOURCE_URL   = "https://www.scstatehouse.gov/sess125_2023-2024/appropriations2024/tap1a.htm"
SOURCE_FILE  = "tap1a_fy2425.htm"
SOURCE_DOC   = SOURCE_FILE
BILL_CITE    = "H.5100 FY2024-2025 Part IA"

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
# DOLLAR PARSING — Integer cents only. No floats. (identical to main script)
# ════════════════════════════════════════════════════════════════════════════

def parse_dollar(text: str) -> int:
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
    if "." in text:
        whole, _ = text.split(".", 1)
        text = whole
    if not text:
        return 0
    try:
        dollars = int(text)
    except ValueError:
        return 0
    cents = dollars * 100
    return -cents if negative else cents


def is_fte_value(text: str) -> bool:
    return bool(re.match(r"^\(\d+\.\d{2}\)$", text.strip()))


def cents_to_display(cents: int) -> str:
    sign = "-" if cents < 0 else ""
    return f"{sign}${abs(cents) // 100:,.0f}"


# ════════════════════════════════════════════════════════════════════════════
# DATABASE — multi-year recap table
# ════════════════════════════════════════════════════════════════════════════

def setup_db_prior(conn: sqlite3.Connection):
    """Create recapitulation_fy table if not present. line_items already has fiscal_year."""
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS recapitulation_fy (
            section_number TEXT    NOT NULL,
            fiscal_year    TEXT    NOT NULL,
            agency_name    TEXT    NOT NULL,
            total_funds    INTEGER NOT NULL,
            general_funds  INTEGER NOT NULL,
            source_doc     TEXT    NOT NULL,
            PRIMARY KEY (section_number, fiscal_year)
        );

        CREATE INDEX IF NOT EXISTS idx_fy_year ON recapitulation_fy(fiscal_year);
    """)
    conn.commit()
    log.info("recapitulation_fy table ready")


def clear_prior_year(conn: sqlite3.Connection):
    """Remove any existing FY2024-2025 rows (idempotent re-run)."""
    cur = conn.execute(
        "DELETE FROM line_items WHERE fiscal_year=?", (FISCAL_YEAR,)
    )
    log.info("Cleared %d existing FY2024-2025 line_items rows", cur.rowcount)
    cur2 = conn.execute(
        "DELETE FROM recapitulation_fy WHERE fiscal_year=?", (FISCAL_YEAR,)
    )
    log.info("Cleared %d existing FY2024-2025 recap rows", cur2.rowcount)
    conn.commit()


# ════════════════════════════════════════════════════════════════════════════
# DOWNLOAD
# ════════════════════════════════════════════════════════════════════════════

def download_source(skip: bool) -> Path:
    dest = PDF_DIR / SOURCE_FILE
    if dest.exists() and skip:
        log.info("--skip-download: using %s (%.2f MB)", SOURCE_FILE, dest.stat().st_size / 1_048_576)
        return dest
    if dest.exists() and not skip:
        log.info("Already present: %s — skipping re-download (use --force to re-fetch)", SOURCE_FILE)
        return dest
    log.info("Downloading %s ...", SOURCE_URL)
    PDF_DIR.mkdir(parents=True, exist_ok=True)
    r = requests.get(SOURCE_URL, timeout=180, stream=True,
                     headers={"User-Agent": "Mozilla/5.0 (research bot)"})
    r.raise_for_status()
    with open(dest, "wb") as f:
        for chunk in r.iter_content(65536):
            f.write(chunk)
    log.info("Downloaded %s (%.2f MB)", SOURCE_FILE, dest.stat().st_size / 1_048_576)
    return dest


# ════════════════════════════════════════════════════════════════════════════
# HTML PARSING — identical structure to FY2025-2026
# ════════════════════════════════════════════════════════════════════════════

def parse_part_ia_html(html_path: Path, conn: sqlite3.Connection) -> int:
    log.info("=== Parsing Part IA HTML: %s ===", html_path.name)

    with open(html_path, "r", encoding="iso-8859-1", errors="replace") as f:
        html = f.read()

    soup = BeautifulSoup(html, "lxml")

    current_section    = None
    current_agency     = None
    current_subsection = None
    current_page       = 0
    rows_inserted      = 0
    in_recap           = False

    page_divs = soup.find_all("div", style=re.compile("page-break-after"))

    for page_div in page_divs:
        # Detect page number
        next_sib = page_div.find_next_sibling("div", style=re.compile("text-align.*center"))
        if next_sib and next_sib.get_text().strip().startswith("pg."):
            try:
                current_page = int(next_sib.get_text().strip().split(".")[-1].strip())
            except ValueError:
                pass

        # Detect recapitulation
        anchor = page_div.find("a", {"name": True})
        if anchor and anchor.get("name", "").lower() == "srecap":
            in_recap = True
        elif anchor and anchor.get("name", "").lower().startswith("s"):
            in_recap = False

        if in_recap:
            _parse_recap_tables(page_div, conn, current_page)
            continue

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

        for table in tables[1:]:
            for tr in table.find_all("tr"):
                cells = tr.find_all("td")
                if len(cells) < 2:
                    continue

                texts = [c.get_text(separator=" ", strip=True).replace("\xa0", "").strip()
                         for c in cells]

                second_cell = cells[1] if len(cells) > 1 else None
                if second_cell and second_cell.get("colspan"):
                    hdr = texts[1] if len(texts) > 1 else ""
                    if hdr and not hdr.startswith("TOTAL FUNDS") and not hdr.startswith("GENERAL FUNDS"):
                        current_subsection = hdr
                    continue

                if len(texts) >= 3 and ("TOTAL FUNDS" in texts[2] or "GENERAL FUNDS" in texts[2]):
                    continue

                if len(cells) < 4:
                    continue

                desc_raw  = texts[1] if len(texts) > 1 else ""
                total_raw = texts[2] if len(texts) > 2 else ""
                gf_raw    = texts[3] if len(texts) > 3 else ""

                if not desc_raw:
                    continue
                if is_fte_value(total_raw) or is_fte_value(gf_raw):
                    continue
                if not total_raw and not gf_raw:
                    continue

                total_cents = parse_dollar(total_raw)
                gf_cents    = parse_dollar(gf_raw)
                other_cents = total_cents - gf_cents

                if total_cents < 0 or gf_cents < 0:
                    log.debug("Skipping negative row sec=%s desc='%s'", current_section, desc_raw[:50])
                    continue

                is_total = desc_raw.upper().startswith("TOTAL")

                conn.execute("""
                    INSERT INTO line_items
                        (agency_name, section_number, subsection_name,
                         line_item_description,
                         general_funds, federal_funds, other_funds, total_funds,
                         fiscal_year, source_doc, page_number,
                         extraction_confidence, is_total_row)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
                """, (
                    current_agency, current_section, current_subsection, desc_raw,
                    gf_cents, 0, other_cents, total_cents,
                    FISCAL_YEAR, SOURCE_DOC, current_page,
                    "high", 1 if is_total else 0,
                ))

                if not is_total:
                    rows_inserted += 1

    conn.commit()
    log.info("Parsing complete: %d data rows inserted", rows_inserted)
    return rows_inserted


def _parse_recap_tables(page_div, conn: sqlite3.Connection, page_num: int):
    for table in page_div.find_all("table"):
        for tr in table.find_all("tr"):
            cells = tr.find_all("td")
            if len(cells) < 4:
                continue
            texts = [c.get_text(separator=" ", strip=True).replace("\xa0", "").strip()
                     for c in cells]
            sec_num = texts[0]
            agency  = texts[1]
            total_r = texts[2]
            gf_r    = texts[3]

            if not sec_num or not re.match(r"^\d", sec_num):
                continue
            if "TOTAL FUNDS" in total_r or "GENERAL FUNDS" in gf_r:
                continue
            if is_fte_value(total_r):
                continue
            if not total_r and not gf_r:
                continue

            total_cents = parse_dollar(total_r)
            gf_cents    = parse_dollar(gf_r)

            if total_cents == 0 and gf_cents == 0 and not agency:
                continue

            conn.execute("""
                INSERT OR IGNORE INTO recapitulation_fy
                    (section_number, fiscal_year, agency_name, total_funds, general_funds, source_doc)
                VALUES (?,?,?,?,?,?)
            """, (sec_num, FISCAL_YEAR, agency, total_cents, gf_cents, SOURCE_DOC))

    conn.commit()


# ════════════════════════════════════════════════════════════════════════════
# RECONCILIATION — FY2024-2025 only
# ════════════════════════════════════════════════════════════════════════════

def run_reconciliation(conn: sqlite3.Connection) -> bool:
    log.info("")
    log.info("════════════════════════════════════════════════")
    log.info("  RECONCILIATION REPORT — %s", FISCAL_YEAR)
    log.info("════════════════════════════════════════════════")

    overall = conn.execute("""
        SELECT
            SUM(total_funds)   AS sum_total,
            SUM(general_funds) AS sum_gf,
            COUNT(*)           AS row_count,
            SUM(CASE WHEN extraction_confidence='low' THEN 1 ELSE 0 END) AS low_count
        FROM line_items
        WHERE is_total_row=0 AND fiscal_year=?
    """, (FISCAL_YEAR,)).fetchone()

    sum_total = overall["sum_total"] or 0
    sum_gf    = overall["sum_gf"]    or 0
    row_count = overall["row_count"] or 0
    low_count = overall["low_count"] or 0

    recap_totals = conn.execute("""
        SELECT SUM(total_funds) AS rt, SUM(general_funds) AS rg, COUNT(*) AS sections
        FROM recapitulation_fy
        WHERE fiscal_year=?
    """, (FISCAL_YEAR,)).fetchone()
    recap_total = recap_totals["rt"] or 0
    recap_gf    = recap_totals["rg"] or 0
    recap_secs  = recap_totals["sections"] or 0

    log.info("")
    log.info("LINE ITEMS (non-total rows, %s):", FISCAL_YEAR)
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

    all_pass   = True
    warn_count = 0

    recap_rows = conn.execute("""
        SELECT section_number, agency_name, total_funds, general_funds
        FROM recapitulation_fy
        WHERE fiscal_year=?
        ORDER BY section_number
    """, (FISCAL_YEAR,)).fetchall()

    log.info("PER-SECTION RECONCILIATION:")
    log.info(f"  {'Sec':<6} {'Agency':<45} {'Recap Total':>18} {'DB Sum':>18} {'Delta':>12} Status")
    log.info("  " + "─" * 110)

    for r in recap_rows:
        sec      = r["section_number"]
        agency   = r["agency_name"]
        recap_tf = r["total_funds"] or 0

        db_sum = conn.execute("""
            SELECT SUM(total_funds) AS s
            FROM line_items
            WHERE section_number=? AND is_total_row=0 AND fiscal_year=?
        """, (sec, FISCAL_YEAR)).fetchone()["s"] or 0

        delta  = abs(db_sum - recap_tf)
        status = "PASS" if delta < 100_000 else "WARN"

        if status == "WARN":
            all_pass = False
            warn_count += 1
            log.warning("  %-6s %-45s %18s %18s %12s [%s]",
                        sec, agency[:45],
                        cents_to_display(recap_tf), cents_to_display(db_sum),
                        cents_to_display(delta), status)
        else:
            log.info("  %-6s %-45s %18s %18s %12s [%s]",
                     sec, agency[:45],
                     cents_to_display(recap_tf), cents_to_display(db_sum),
                     cents_to_display(delta), status)

    log.info("")
    log.info("════════════════════════════════════════════════")
    log.info("  ANTI-HALLUCINATION VERIFICATION — %s", FISCAL_YEAR)
    log.info("  (Report these values to user for spot-check)")
    log.info("════════════════════════════════════════════════")
    log.info("  [1] SUM(total_funds)   : %s", cents_to_display(sum_total))
    log.info("  [2] SUM(general_funds) : %s", cents_to_display(sum_gf))
    log.info("  [3] Low-confidence rows: %d", low_count)
    log.info("  [4] Recap grand total  : %s", cents_to_display(recap_total))
    log.info("  [5] Delta (sum vs recap): %s", cents_to_display(abs(sum_total - recap_total)))
    log.info("  [6] Agencies with WARN : %d", warn_count)
    log.info("")
    log.info("Reconciliation: %s", "PASS" if all_pass else f"WARNING — {warn_count} sections")

    return all_pass


# ════════════════════════════════════════════════════════════════════════════
# MAIN
# ════════════════════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(description="Palmetto ZBB — FY2024-2025 Prior Year Ingestion")
    parser.add_argument("--skip-download", action="store_true",
                        help="Use already-downloaded file, skip HTTP fetch")
    parser.add_argument("--force", action="store_true",
                        help="Re-download source even if file exists")
    args = parser.parse_args()

    from dotenv import load_dotenv
    load_dotenv(ROOT.parent / ".env")
    load_dotenv(ROOT / ".env")

    log.info("Palmetto ZBB — FY2024-2025 Prior Year Ingestion")
    log.info("DB: %s", DB_PATH)
    log.info("Source: %s", SOURCE_URL)

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")

    # Create multi-year recap table if not present
    setup_db_prior(conn)

    # Clear any prior run of FY2024-2025 (idempotent)
    clear_prior_year(conn)

    # Download source
    if args.force:
        dest = PDF_DIR / SOURCE_FILE
        dest.unlink(missing_ok=True)
    html_path = download_source(skip=args.skip_download)

    # Parse and insert
    rows = parse_part_ia_html(html_path, conn)
    log.info("Inserted %d data rows for %s", rows, FISCAL_YEAR)

    # Reconcile
    ok = run_reconciliation(conn)

    conn.execute("INSERT OR REPLACE INTO ingestion_meta VALUES (?,?)",
                 (f"last_prior_ingest_{FISCAL_YEAR}", datetime.now(timezone.utc).isoformat()))
    conn.execute("INSERT OR REPLACE INTO ingestion_meta VALUES (?,?)",
                 (f"prior_recon_status_{FISCAL_YEAR}", "pass" if ok else "warning"))
    conn.commit()
    conn.close()

    print()
    print("=" * 60)
    print(f"  FY2024-2025 INGESTION {'COMPLETE — PASS' if ok else 'COMPLETE — WARNINGS'}")
    print(f"  {rows} data rows ingested")
    print("  Review reconciliation output above before proceeding.")
    print("=" * 60)

    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
