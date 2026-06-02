"""Attesterad ingestion: officiell tredjepartsdata (vi hämtar) → grafen.

Förvärvsmodell (docs/claims-provenance-spec.md §4): **vi** laddar ner filen direkt
från den officiella källan och laddar upp den mot kunden. Kunden rör aldrig datan på
vägen → vi kan ärligt attestera att den är oförvanskad per ett datum.

Läser LinkedIns **native multi-flik-export** (.xls/.xlsx) direkt — varje datatyp har sin
egen fliklayout. CSV i kanoniskt format (`dimension,segment,value`) stöds också (bakåt-
kompat + normaliserade uppladdningar). För fritext (personbiografier) läser vi .pdf/.txt/.md
via egen parser — varje källtyp pekar på sin egen parser.

Källtyper:
  * **linkedin_follower_demographics** → claims om följarbasens sammansättning (replace).
  * **linkedin_visitor_demographics**  → claims om vilka som besöker sidan (replace).
  * **linkedin_content**               → publika inlägg som SocialMediaPosting-RawItems
                                          (append; persondata/"Posted by" tas ALDRIG med).
  * **people_bio**                     → personbiografier från bolaget (replace; bolagets
                                          eget urval av personer som ska synliggöras).

Claims/items byggs **deterministiskt** (ingen LLM). Demografi taggas
`origin="attested:<typ>"`, inlägg `attested_source="linkedin_content"`, så replace hittar
rätt vid omkörning.
"""
from __future__ import annotations

import csv
import hashlib
import io
import logging
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Callable

import firestore_client as fs
from schemas import Claim, ClaimSource

log = logging.getLogger(__name__)

DEFAULT_ATTESTED_LABEL = "LinkedIn-data, verifierad av Geogiraph"
TOP_SEGMENTS_PER_DIMENSION = 5
MIN_VALUE = 1

# Fliknamn (LinkedIn-export) → vår dimension.
_SHEET_TO_DIM: dict[str, str] = {
    "location": "location",
    "job function": "function",
    "seniority": "seniority",
    "industry": "industry",
    "company size": "company_size",
}

_FOLLOWER_TEMPLATES: dict[str, str] = {
    "seniority": "{value} av {company}s LinkedIn-följare är på nivån {segment}.",
    "function": "{value} av {company}s LinkedIn-följare arbetar inom {segment}.",
    "industry": "{value} av {company}s LinkedIn-följare verkar inom branschen {segment}.",
    "location": "{value} av {company}s LinkedIn-följare finns i {segment}.",
    "company_size": "{value} av {company}s LinkedIn-följare arbetar på företag med {segment} anställda.",
}

_VISITOR_TEMPLATES: dict[str, str] = {
    "seniority": "{value} av besökarna på {company}s LinkedIn-sida är på nivån {segment}.",
    "function": "{value} av besökarna på {company}s LinkedIn-sida arbetar inom {segment}.",
    "industry": "{value} av besökarna på {company}s LinkedIn-sida verkar inom branschen {segment}.",
    "location": "{value} av besökarna på {company}s LinkedIn-sida finns i {segment}.",
    "company_size": "{value} av besökarna på {company}s LinkedIn-sida arbetar på företag med {segment} anställda.",
}


@dataclass(frozen=True)
class BuildCtx:
    company: str
    attested_at: str
    url: str | None

    @property
    def source(self) -> ClaimSource:
        return ClaimSource(kind="attested", label=DEFAULT_ATTESTED_LABEL, attested_at=self.attested_at, url=self.url)


# En skrivning en builder vill göra: (mål, dok-id, payload). mål ∈ {"claim", "raw_item"}.
Write = tuple[str, str, dict[str, Any]]


@dataclass(frozen=True)
class SourceType:
    key: str
    label: str
    description: str
    mode: str  # "replace" (ögonblicksbild) | "append" (logg)
    # build får payloaden parser:n returnerade. Default-parser:n (read_sheets)
    # returnerar {fliknamn: rader}; text-baserade källor (people_bio) använder
    # read_text och får en str. Builderns första arg ges som Any för att rymma båda.
    build: Callable[[Any, BuildCtx], list[Write]]
    parser: Callable[[str | None, bytes], Any] | None = None  # None → read_sheets


# --- Filinläsning: .xls / .xlsx / .csv → {fliknamn: rader} -----------------------


def read_sheets(filename: str | None, content: bytes) -> dict[str, list[list[str]]]:
    name = (filename or "").lower()
    if name.endswith(".xls"):  # gammal BIFF
        import xlrd

        wb = xlrd.open_workbook(file_contents=content)
        return {
            sh.name: [[_cell(sh.cell_value(r, c)) for c in range(sh.ncols)] for r in range(sh.nrows)]
            for sh in wb.sheets()
        }
    if name.endswith((".xlsx", ".xlsm")):
        import openpyxl

        wb = openpyxl.load_workbook(io.BytesIO(content), read_only=True, data_only=True)
        return {
            ws.title: [["" if c is None else _cell(c) for c in row] for row in ws.iter_rows(values_only=True)]
            for ws in wb.worksheets
        }
    # CSV (eller okänd text): en enda flik.
    text = content.decode("utf-8-sig", errors="ignore")
    sample = text[:2048]
    delim = ";" if sample.count(";") > sample.count(",") else ","
    return {"__csv__": [[c.strip() for c in row] for row in csv.reader(io.StringIO(text), delimiter=delim)]}


def _cell(v: Any) -> str:
    if isinstance(v, float):
        return str(int(v)) if v == int(v) else str(v)
    return str(v).strip()


# --- Fritext-läsare: .pdf / .txt / .md → str ------------------------------------


def read_text(filename: str | None, content: bytes) -> str:
    """Läs .pdf/.txt/.md som en sammanhängande sträng (sidbrytningar → blanka rader)."""
    name = (filename or "").lower()
    if name.endswith(".pdf"):
        from pypdf import PdfReader

        reader = PdfReader(io.BytesIO(content))
        return "\n\n".join((page.extract_text() or "").strip() for page in reader.pages).strip()
    return content.decode("utf-8-sig", errors="ignore").strip()


# --- Demografi (följare + besökare) → claims ------------------------------------


def _demographic_build(
    sheets: dict[str, list[list[str]]], ctx: BuildCtx, *, key: str, templates: dict[str, str]
) -> list[Write]:
    # Kanoniskt CSV-format (dimension,segment,value) → gruppera per dimension.
    for rows in sheets.values():
        if rows and _is_canonical_header(rows[0]):
            return _canonical_build(rows, ctx, key, templates)

    # Native multi-flik: fliknamnet är dimensionen, rad = [segment, värde].
    writes: list[Write] = []
    for sheet_name, rows in sheets.items():
        dim = _SHEET_TO_DIM.get(sheet_name.strip().lower())
        if not dim or dim not in templates or len(rows) < 2:
            continue
        parsed: list[tuple[str, int]] = []
        for r in rows[1:]:  # rad 0 = rubrik
            if len(r) < 2:
                continue
            seg = r[0].strip()
            val = _to_int(r[1])
            if seg and val is not None and val >= MIN_VALUE:
                parsed.append((seg, val))
        for seg, val in sorted(parsed, key=lambda x: x[1], reverse=True)[:TOP_SEGMENTS_PER_DIMENSION]:
            writes.append(_demo_claim(ctx, key, dim, seg, val, templates))
    return writes


def _is_canonical_header(row: list[str]) -> bool:
    return {"dimension", "segment", "value"} <= {c.strip().lower() for c in row}


def _canonical_build(rows: list[list[str]], ctx: BuildCtx, key: str, templates: dict[str, str]) -> list[Write]:
    header = [c.strip().lower() for c in rows[0]]
    di, si, vi = header.index("dimension"), header.index("segment"), header.index("value")
    by_dim: dict[str, list[tuple[str, int]]] = {}
    for r in rows[1:]:
        if max(di, si, vi) >= len(r):
            continue
        dim = r[di].strip().lower()
        seg = r[si].strip()
        val = _to_int(r[vi])
        if dim in templates and seg and val is not None and val >= MIN_VALUE:
            by_dim.setdefault(dim, []).append((seg, val))
    writes: list[Write] = []
    for dim, segs in by_dim.items():
        for seg, val in sorted(segs, key=lambda x: x[1], reverse=True)[:TOP_SEGMENTS_PER_DIMENSION]:
            writes.append(_demo_claim(ctx, key, dim, seg, val, templates))
    return writes


def _demo_claim(ctx: BuildCtx, key: str, dimension: str, segment: str, value: int, templates: dict[str, str]) -> Write:
    statement = templates[dimension].format(company=ctx.company, value=value, segment=segment)
    # Deterministiskt id på (typ, dimension, segment) → omkörning skriver över.
    claim_id = "att-" + hashlib.sha1(f"{key}|{dimension}|{segment.lower()}".encode("utf-8")).hexdigest()[:14]
    claim = Claim(
        claim_kind="narrative",
        subject_ref="org",
        statement=statement[:200],
        source=[ctx.source],
        confidence=1.0,
        # Staged: ingår INTE i grafen förrän operatören bekräftar "Inkludera i leverans".
        included_in_output=False,
        needs_review=False,
    )
    return ("claim", claim_id, claim.model_dump())


# --- Inlägg → SocialMediaPosting-RawItems (utan författare) ----------------------


def _content_build(sheets: dict[str, list[list[str]]], ctx: BuildCtx) -> list[Write]:
    rows = _find_sheet(sheets, "all posts")
    if not rows or len(rows) < 2:
        return []
    # Rubrikraden kan föregås av en beskrivningsrad — hitta den på "post link"/"post title".
    hidx = next(
        (i for i, r in enumerate(rows[:5]) if {"post link", "post title"} & {c.strip().lower() for c in r}),
        None,
    )
    if hidx is None:
        return []
    header = [c.strip().lower() for c in rows[hidx]]

    def col(*names: str) -> int | None:
        for n in names:
            if n in header:
                return header.index(n)
        return None

    c_title, c_link, c_type, c_date = col("post title"), col("post link"), col("post type"), col("created date")
    writes: list[Write] = []
    for r in rows[hidx + 1:]:
        title = r[c_title].strip() if c_title is not None and c_title < len(r) else ""
        link = r[c_link].strip() if c_link is not None and c_link < len(r) else ""
        if not title and not link:
            continue
        published = _norm_date(r[c_date]) if c_date is not None and c_date < len(r) else None
        post_type = r[c_type].strip() if c_type is not None and c_type < len(r) else None
        # Stabilt id på länken (annars titeln) → omkörning uppdaterar samma inlägg.
        item_id = "att-post-" + hashlib.sha1((link or title).encode("utf-8")).hexdigest()[:16]
        payload = {
            "source": "LinkedIn (attesterad)",
            "schema_type": "SocialMediaPosting",
            "content": title[:5000],
            "url": link or None,
            "published_at": published,
            # Staged tills "Inkludera i leverans" bekräftas.
            "included_in_output": False,
            "attested_source": "linkedin_content",
            # OBS: "Posted by" (författare) tas medvetet ALDRIG med (persondata).
            "extra": {"post_type": post_type},
        }
        writes.append(("raw_item", item_id, payload))
    return writes


def _find_sheet(sheets: dict[str, list[list[str]]], target: str) -> list[list[str]] | None:
    for name, rows in sheets.items():
        if name.strip().lower() == target:
            return rows
    return None


def _norm_date(s: str) -> datetime | None:
    s = (s or "").strip()
    for fmt in ("%m/%d/%Y", "%Y-%m-%d", "%m/%d/%y"):
        try:
            return datetime.strptime(s, fmt).replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    return None


# --- Personbiografier (people_bio) → narrative-claims ---------------------------
#
# Bolaget skickar ett dokument om de personer de vill synliggöra. Vi stycke-delar
# texten och skriver ett narrative-claim per logisk bit — claimens `source` bär
# attesterat datum + ev. publik ankare. Replace-läge → ny uppladdning rensar gammal.
# (Inga raw_items behövs: kompilatorn läser narrative-claims direkt.)

PEOPLE_BIO_LABEL = "Personprofil-dokument från bolaget"
PEOPLE_BIO_MAX_CHARS = 400  # claim-bit (max). Längre stycken delas på meningsnivå.
_PARAGRAPH_SPLIT = re.compile(r"\n\s*\n+")
# Mening avslutas med . ! ? eller : följt av blanksteg + stor bokstav (incl. åäö).
_SENTENCE_BOUNDARY = re.compile(r"(?<=[.!?:])\s+(?=[A-ZÅÄÖ])")


def _split_into_chunks(text: str, max_chars: int) -> list[str]:
    """Stycke först, sen mening — så ingen text trunkeras bort. Slå ihop intilliggande
    meningar så länge de ryms i `max_chars`; alltför långa meningar släpps igenom
    som-är (vi vill hellre ha en lång mening än en hackad)."""
    chunks: list[str] = []
    for para in _PARAGRAPH_SPLIT.split(text or ""):
        para = para.strip()
        if not para:
            continue
        if len(para) <= max_chars:
            chunks.append(para)
            continue
        buf = ""
        for sent in _SENTENCE_BOUNDARY.split(para):
            sent = sent.strip()
            if not sent:
                continue
            if buf and len(buf) + 1 + len(sent) > max_chars:
                chunks.append(buf)
                buf = sent
            else:
                buf = f"{buf} {sent}".strip() if buf else sent
        if buf:
            chunks.append(buf)
    return chunks


def _people_bio_build(text: str, ctx: BuildCtx) -> list[Write]:
    chunks = _split_into_chunks(text, PEOPLE_BIO_MAX_CHARS)
    if not chunks:
        return []

    src = ClaimSource(kind="attested", label=PEOPLE_BIO_LABEL, attested_at=ctx.attested_at, url=ctx.url)
    writes: list[Write] = []
    seen: set[str] = set()
    for chunk in chunks:
        # Stabil identitet på innehållet → omkörning med samma text överskriver.
        claim_id = "att-bio-" + hashlib.sha1(chunk.encode("utf-8")).hexdigest()[:14]
        if claim_id in seen:
            continue
        seen.add(claim_id)
        claim = Claim(
            claim_kind="narrative",
            subject_ref="org",
            statement=chunk,
            source=[src],
            confidence=1.0,
            # Staged tills "Inkludera i leverans" bekräftas — speglar demografi-flödet.
            included_in_output=False,
            needs_review=False,
        )
        writes.append(("claim", claim_id, claim.model_dump()))
    return writes


# --- Källtyps-register -----------------------------------------------------------


SOURCE_TYPES: dict[str, SourceType] = {
    "linkedin_follower_demographics": SourceType(
        key="linkedin_follower_demographics",
        label="LinkedIn – följardemografi",
        description="Följarbasens sammansättning (senioritet, funktion, bransch, geografi, "
                    "företagsstorlek). Ögonblicksbild — ersätter tidigare uppladdning.",
        mode="replace",
        build=lambda sheets, ctx: _demographic_build(
            sheets, ctx, key="linkedin_follower_demographics", templates=_FOLLOWER_TEMPLATES
        ),
    ),
    "linkedin_visitor_demographics": SourceType(
        key="linkedin_visitor_demographics",
        label="LinkedIn – besökardemografi",
        description="Vilka som besöker sidan (senioritet, bransch, geografi, företagsstorlek). "
                    "Ögonblicksbild — ersätter tidigare uppladdning.",
        mode="replace",
        build=lambda sheets, ctx: _demographic_build(
            sheets, ctx, key="linkedin_visitor_demographics", templates=_VISITOR_TEMPLATES
        ),
    ),
    "linkedin_content": SourceType(
        key="linkedin_content",
        label="LinkedIn – inlägg",
        description="Bolagets publika inlägg (text, länk, datum) som SocialMediaPosting. "
                    "Ackumuleras; författare tas aldrig med.",
        mode="append",
        build=_content_build,
    ),
    "people_bio": SourceType(
        key="people_bio",
        label="Personprofiler (från bolaget)",
        description="Dokument (PDF eller text) med biografier om de personer bolaget vill "
                    "synliggöra. Ersätter tidigare uppladdning — ny version skriver över.",
        mode="replace",
        build=_people_bio_build,
        parser=read_text,
    ),
}


def ingest_attested(
    client_id: str, source_type: str, filename: str | None, content: bytes, attested_at: str, url: str | None = None
) -> dict:
    """Läs filen, bygg claims/items deterministiskt och persistera. Höjer ValueError
    vid kund som saknas, okänd source_type eller fil utan giltiga rader."""
    client = fs.client_doc(client_id).get()
    if not client.exists:
        raise ValueError(f"client not found: {client_id}")
    company = (client.to_dict() or {}).get("company_name") or client_id

    st = SOURCE_TYPES.get(source_type)
    if st is None:
        raise ValueError(f"unknown source_type: {source_type}")

    parser = st.parser or read_sheets
    try:
        payload = parser(filename, content)
    except Exception as exc:  # noqa: BLE001
        raise ValueError(f"could not read file: {exc}") from exc
    if not payload:
        raise ValueError("could not read file")

    writes = st.build(payload, BuildCtx(company=company, attested_at=attested_at, url=url))
    if not writes:
        raise ValueError("no valid rows in file")

    removed = _delete_existing(client_id, source_type) if st.mode == "replace" else 0
    origin = f"attested:{source_type}"
    for target, doc_id, payload in writes:
        if target == "claim":
            fs.claim_doc(client_id, doc_id).set({**payload, "origin": origin})
        else:
            fs.raw_items_company_col(client_id).document(doc_id).set(payload)

    return {
        "client_id": client_id,
        "source_type": source_type,
        "mode": st.mode,
        "written": len(writes),
        "removed": removed,
        "attested_at": attested_at,
    }


def ingest_attested_csv(client_id: str, source_type: str, csv_text: str, attested_at: str, url: str | None = None) -> dict:
    """Bakåtkompatibel CSV-väg (kanoniskt format) — delegerar till ingest_attested."""
    return ingest_attested(client_id, source_type, "upload.csv", csv_text.encode("utf-8"), attested_at, url)


def attested_status(client_id: str) -> list[dict[str, Any]]:
    """Per källtyp: antal i leverans (included) vs väntande (staged), senaste datum och
    ett par exempel — så kortet kan visa både kvittens och bekräfta-läge."""
    agg: dict[str, dict[str, Any]] = {
        st.key: {"included": 0, "staged": 0, "last": None, "samples": []} for st in SOURCE_TYPES.values()
    }

    for _claim_id, raw in fs.iter_claims(client_id):
        origin = raw.get("origin") or ""
        if not origin.startswith("attested:"):
            continue
        a = agg.get(origin.split(":", 1)[1])
        if a is None:
            continue
        a["included" if raw.get("included_in_output") else "staged"] += 1
        at = (raw.get("source") or [{}])[0].get("attested_at")
        if at and (a["last"] is None or at > a["last"]):
            a["last"] = at
        if len(a["samples"]) < 3 and raw.get("statement"):
            a["samples"].append(raw["statement"])

    for snap in fs.raw_items_company_col(client_id).stream():
        d = snap.to_dict() or {}
        a = agg.get(d.get("attested_source") or "")
        if a is None:
            continue
        a["included" if d.get("included_in_output") else "staged"] += 1
        if len(a["samples"]) < 3 and d.get("content"):
            a["samples"].append((d.get("content") or "")[:120])

    return [
        {
            "key": st.key,
            "label": st.label,
            "description": st.description,
            "mode": st.mode,
            "included": agg[st.key]["included"],
            "staged": agg[st.key]["staged"],
            "last_attested_at": agg[st.key]["last"],
            "samples": agg[st.key]["samples"],
        }
        for st in SOURCE_TYPES.values()
    ]


def include_source(client_id: str, source_type: str) -> int:
    """Flippa staged → included_in_output för en källtyp (bekräfta "Inkludera i leverans").
    Returnerar antal poster som inkluderades. Anroparen kör en omkompilering."""
    if source_type not in SOURCE_TYPES:
        raise ValueError(f"unknown source_type: {source_type}")
    if not fs.client_doc(client_id).get().exists:
        raise ValueError(f"client not found: {client_id}")

    origin = f"attested:{source_type}"
    n = 0
    for claim_id, raw in list(fs.iter_claims(client_id)):
        if (raw.get("origin") or "") == origin and not raw.get("included_in_output"):
            fs.claim_doc(client_id, claim_id).update({"included_in_output": True})
            n += 1
    for snap in list(fs.raw_items_company_col(client_id).stream()):
        d = snap.to_dict() or {}
        if d.get("attested_source") == source_type and not d.get("included_in_output"):
            fs.raw_items_company_col(client_id).document(snap.id).update({"included_in_output": True})
            n += 1
    return n


def clear_source(client_id: str, source_type: str) -> int:
    """Rensa all attesterad data för en källtyp (manuell radering från UI).
    Returnerar antal raderade dokument. Höjer ValueError vid okänd källtyp/kund."""
    if source_type not in SOURCE_TYPES:
        raise ValueError(f"unknown source_type: {source_type}")
    if not fs.client_doc(client_id).get().exists:
        raise ValueError(f"client not found: {client_id}")
    return _delete_existing(client_id, source_type)


def _delete_existing(client_id: str, source_type: str) -> int:
    """Radera tidigare attesterad data för källtypen (replace-läge) — claims + raw_items."""
    removed = 0
    origin = f"attested:{source_type}"
    for claim_id, raw in list(fs.iter_claims(client_id)):
        if (raw.get("origin") or "") == origin:
            fs.claim_doc(client_id, claim_id).delete()
            removed += 1
    for snap in list(fs.raw_items_company_col(client_id).stream()):
        if (snap.to_dict() or {}).get("attested_source") == source_type:
            fs.raw_items_company_col(client_id).document(snap.id).delete()
            removed += 1
    return removed


def _to_int(s: str) -> int | None:
    digits = "".join(ch for ch in (s or "") if ch.isdigit())
    return int(digits) if digits else None
