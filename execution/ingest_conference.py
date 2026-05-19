#!/usr/bin/env python3
"""
Ingest Conference Committee Summary Control Document into Pinecone.
Namespace: fy2026-conference  (separate from Part IB fy2026-zia)

Usage:
  python execution/ingest_conference.py
"""

import os
import hashlib
import logging
import sys
import tiktoken
import pdfplumber

from pathlib import Path
from dotenv import load_dotenv

ROOT = Path(__file__).parent.parent

load_dotenv(ROOT / ".env")
load_dotenv(ROOT.parent / ".env")

PINECONE_INDEX  = "sc-budget"
CONFERENCE_NS   = "fy2026-conference"
VOYAGE_MODEL    = "voyage-3"
VOYAGE_DIMS     = 1024
CHUNK_TOKENS    = 600
CHUNK_OVERLAP   = 100
MIN_TOKENS      = 50
PDF_PATH        = ROOT / "pdfs" / "conference_report_fy2026.pdf"
SOURCE_KEY      = "conference_report"
DESCRIPTION     = "Conference Committee Summary Control Document, May 21 2025"

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
log = logging.getLogger(__name__)


def chunk_text(text: str) -> list[str]:
    enc = tiktoken.get_encoding("cl100k_base")
    tokens = enc.encode(text)
    chunks = []
    start = 0
    while start < len(tokens):
        end = min(start + CHUNK_TOKENS, len(tokens))
        chunk = enc.decode(tokens[start:end]).strip()
        if len(enc.encode(chunk)) >= MIN_TOKENS:
            chunks.append(chunk)
        start += CHUNK_TOKENS - CHUNK_OVERLAP
    return chunks


def extract_pdf_pages(pdf_path: Path) -> list[dict]:
    pages = []
    with pdfplumber.open(pdf_path) as pdf:
        for i, page in enumerate(pdf.pages, 1):
            text = page.extract_text() or ""
            if text.strip():
                pages.append({"page": i, "text": text})
    return pages


def main():
    voyage_key  = os.environ.get("VOYAGE_API_KEY", "")
    pinecone_key = os.environ.get("PINECONE_API_KEY", "")

    if not voyage_key or not pinecone_key:
        log.error("VOYAGE_API_KEY and PINECONE_API_KEY must be set in .env")
        sys.exit(1)

    if not PDF_PATH.exists():
        log.error("Conference report PDF not found: %s", PDF_PATH)
        sys.exit(1)

    import voyageai
    from pinecone import Pinecone, ServerlessSpec

    voyage = voyageai.Client(api_key=voyage_key)
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
    pc_index = pc.Index(PINECONE_INDEX)

    log.info("Extracting pages from %s ...", PDF_PATH.name)
    pages = extract_pdf_pages(PDF_PATH)
    log.info("%d pages extracted", len(pages))

    all_chunks = []
    for p in pages:
        for ci, chunk in enumerate(chunk_text(p["text"])):
            chunk_id = hashlib.sha256(f"{SOURCE_KEY}:{p['page']}:{ci}".encode()).hexdigest()[:32]
            all_chunks.append({
                "id": chunk_id,
                "text": chunk,
                "meta": {
                    "source_id": SOURCE_KEY,
                    "source_pdf": PDF_PATH.name,
                    "description": DESCRIPTION,
                    "fiscal_year": "FY2025-2026",
                    "page_number": p["page"],
                    "chunk_index": ci,
                    "text_preview": chunk[:200],
                },
            })

    log.info("%d chunks to embed and upsert into '%s'", len(all_chunks), CONFERENCE_NS)

    BATCH = 96
    upserted = 0
    for i in range(0, len(all_chunks), BATCH):
        batch = all_chunks[i : i + BATCH]
        result = voyage.embed([c["text"] for c in batch], model=VOYAGE_MODEL, input_type="document")
        vectors = [{"id": c["id"], "values": emb, "metadata": c["meta"]}
                   for c, emb in zip(batch, result.embeddings)]
        pc_index.upsert(vectors=vectors, namespace=CONFERENCE_NS)
        upserted += len(vectors)
        log.info("  Batch %d/%d: %d vectors upserted",
                 i // BATCH + 1, (len(all_chunks) + BATCH - 1) // BATCH, len(vectors))

    log.info("Done. %d vectors in '%s' / '%s'", upserted, PINECONE_INDEX, CONFERENCE_NS)


if __name__ == "__main__":
    main()
