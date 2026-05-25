"""Content-type-router + readers: råbytes → ren text.

Allt sidinnehåll (HTML, PDF, …) kokas ner till samma sak: ren text + titel.
Routern väljer reader på content-type/filändelse. Nya format (PPTX, DOCX,
YouTube) läggs till genom att registrera en reader till — inget nedströms ändras.

Tunga beroenden (trafilatura, pypdf) importeras lazy inne i respektive reader, så
modulen kan importeras även där de inte är installerade. Saknas beroendet, eller
misslyckas extraktionen, returneras None (graceful — connectorn hoppar över sidan).

Inskannade PDF:er (bildlager, ingen text) flaggas needs_ocr=True och ger tom text.
OCR ligger utanför v1 (se docs/website-connector-spec.md §7).
"""
from __future__ import annotations

import logging
from dataclasses import dataclass

log = logging.getLogger(__name__)

# Chunk-parametrar (docs/website-connector-spec.md §6).
CHUNK_SIZE = 2500          # tecken/chunk
CHUNK_OVERLAP = 200        # överlapp så inget tappas vid sektionsgräns
MAX_CHUNKS_PER_DOC = 40    # tak: en monster-PDF får inte dränka allt annat


@dataclass
class Document:
    text: str
    title: str | None
    content_type: str       # "html" | "pdf"
    needs_ocr: bool = False


def detect_content_type(url: str, header_content_type: str | None) -> str | None:
    """→ 'html' | 'pdf' | None (okänt/binärt → hoppas över)."""
    ct = (header_content_type or "").lower()
    if "application/pdf" in ct or url.lower().split("?")[0].endswith(".pdf"):
        return "pdf"
    if "text/html" in ct or "application/xhtml" in ct:
        return "html"
    # Ingen tydlig content-type men ser ut som en vanlig sida → behandla som html.
    if not ct and not _looks_binary(url):
        return "html"
    return None


def extract(url: str, content_type: str, raw: bytes) -> Document | None:
    if content_type == "html":
        return _extract_html(url, raw)
    if content_type == "pdf":
        return _extract_pdf(raw)
    return None


def chunk_text(text: str) -> list[str]:
    """Dela ren text i överlappande chunks, cap MAX_CHUNKS_PER_DOC.

    Försöker bryta vid stycke/menings-gräns nära chunk-slutet hellre än mitt i
    ett ord, så ett påstående inte styckas onödigt.
    """
    text = (text or "").strip()
    if not text:
        return []
    chunks: list[str] = []
    start = 0
    n = len(text)
    while start < n and len(chunks) < MAX_CHUNKS_PER_DOC:
        end = min(start + CHUNK_SIZE, n)
        if end < n:
            end = _soft_break(text, start, end)
        chunks.append(text[start:end].strip())
        if end >= n:
            break
        start = max(end - CHUNK_OVERLAP, start + 1)
    return [c for c in chunks if c]


# --- readers ---------------------------------------------------------------


def _extract_html(url: str, raw: bytes) -> Document | None:
    try:
        import trafilatura
    except ImportError:
        log.warning("trafilatura not installed — cannot extract html")
        return None
    try:
        html = raw.decode("utf-8", errors="replace")
        text = trafilatura.extract(html, url=url, favor_recall=True) or ""
        meta = trafilatura.extract_metadata(html)
        title = getattr(meta, "title", None) if meta else None
    except Exception as exc:  # parsing varierar vilt mellan sajter — var defensiv
        log.warning("html extract failed for %s: %s", url, exc)
        return None
    text = text.strip()
    if not text:
        return None
    return Document(text=text, title=title, content_type="html")


def _extract_pdf(raw: bytes) -> Document | None:
    try:
        from pypdf import PdfReader
    except ImportError:
        log.warning("pypdf not installed — cannot extract pdf")
        return None
    import io

    try:
        reader = PdfReader(io.BytesIO(raw))
        title = (reader.metadata or {}).get("/Title") if reader.metadata else None
        pages = [(p.extract_text() or "").strip() for p in reader.pages]
    except Exception as exc:
        log.warning("pdf extract failed: %s", exc)
        return None
    text = "\n\n".join(p for p in pages if p).strip()
    if not text:
        # Textlager saknas → sannolikt inskannad. Flagga för senare OCR.
        return Document(text="", title=title, content_type="pdf", needs_ocr=True)
    return Document(text=text, title=title, content_type="pdf")


# --- helpers ---------------------------------------------------------------


def _soft_break(text: str, start: int, end: int) -> int:
    """Flytta brytpunkten bakåt till närmaste stycke-/menings-/ordgräns."""
    window = text[start:end]
    for sep in ("\n\n", "\n", ". ", " "):
        idx = window.rfind(sep)
        if idx > CHUNK_SIZE // 2:  # bryt bara om vi inte kapar bort halva chunken
            return start + idx + len(sep)
    return end


_BINARY_EXT = (
    ".jpg", ".jpeg", ".png", ".gif", ".svg", ".webp", ".ico",
    ".zip", ".gz", ".mp4", ".mp3", ".mov", ".css", ".js",
    ".woff", ".woff2", ".ttf", ".xml", ".json",
)


def _looks_binary(url: str) -> bool:
    return url.lower().split("?")[0].endswith(_BINARY_EXT)
