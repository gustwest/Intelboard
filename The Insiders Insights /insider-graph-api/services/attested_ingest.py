"""Attesterad ingestion: officiell tredjepartsdata (vi hämtar) → attesterade claims.

Förvärvsmodell (docs/claims-provenance-spec.md §4): **vi** laddar ner filen direkt
från den officiella källan och laddar upp den mot kunden i vårt system. Kunden rör
aldrig datan på vägen → vi kan ärligt attestera att den är oförvanskad per ett datum.

Vi tolkar ett **kanoniskt intag-format** (CSV med kolumnerna `dimension,segment,value`),
inte LinkedIns råa export rakt av. Skälet: de råa export-layouterna varierar och ändras;
eftersom vi förbereder filerna normaliserar vi dem till detta format. Native-parsers per
LinkedIn-export-typ kan registreras i PARSERS när vi har riktiga exempelfiler.

Claims byggs **deterministiskt** (ingen LLM) — datan är strukturerad och vi går i god
för den. Varje claim får en `attested`-källa med datum + valfri publik url.
"""
from __future__ import annotations

import csv
import hashlib
import io
import logging
from dataclasses import dataclass

import firestore_client as fs
from schemas import Claim, ClaimSource

log = logging.getLogger(__name__)

DEFAULT_ATTESTED_LABEL = "LinkedIn-data, verifierad av Geogiraph"
TOP_SEGMENTS_PER_DIMENSION = 5   # håll nere bruset: bara de mest signifikanta segmenten
MIN_VALUE = 1

# dimension → mening. {company} = bolaget, {value} = antal, {segment} = kategorin.
_DIMENSION_TEMPLATES: dict[str, str] = {
    "seniority": "{value} av {company}s LinkedIn-följare är på nivån {segment}.",
    "function": "{value} av {company}s LinkedIn-följare arbetar inom {segment}.",
    "industry": "{value} av {company}s LinkedIn-följare verkar inom branschen {segment}.",
    "location": "{value} av {company}s LinkedIn-följare finns i {segment}.",
    "company_size": "{value} av {company}s LinkedIn-följare arbetar på företag med {segment} anställda.",
}


@dataclass
class Row:
    dimension: str
    segment: str
    value: int


def ingest_attested_csv(
    client_id: str,
    source_type: str,
    csv_text: str,
    attested_at: str,
    url: str | None = None,
) -> dict:
    """Tolka, validera och persistera attesterade claims ur en officiell CSV.

    Höjer ValueError vid kund som saknas, okänd source_type eller ogiltig CSV.
    """
    client = fs.client_doc(client_id).get()
    if not client.exists:
        raise ValueError(f"client not found: {client_id}")
    company = (client.to_dict() or {}).get("company_name") or client_id

    parser = PARSERS.get(source_type)
    if parser is None:
        raise ValueError(f"unknown source_type: {source_type}")

    rows = parser(csv_text)
    if not rows:
        raise ValueError("no valid rows in file")

    claims = _build_claims(company, rows, source_type, attested_at, url)
    for claim_id, claim in claims:
        fs.claim_doc(client_id, claim_id).set(claim.model_dump())

    return {"client_id": client_id, "source_type": source_type, "written": len(claims), "attested_at": attested_at}


def parse_canonical(csv_text: str) -> list[Row]:
    """Kanoniskt intag-format: CSV med headers dimension, segment, value."""
    reader = csv.DictReader(io.StringIO(csv_text))
    if not reader.fieldnames or not {"dimension", "segment", "value"} <= set(reader.fieldnames):
        raise ValueError("csv must have columns: dimension, segment, value")

    rows: list[Row] = []
    for raw in reader:
        dimension = (raw.get("dimension") or "").strip().lower()
        segment = (raw.get("segment") or "").strip()
        value_raw = (raw.get("value") or "").strip().replace(" ", "")
        if not dimension or not segment or not value_raw:
            continue
        try:
            value = int(float(value_raw))
        except ValueError:
            continue  # icke-numeriskt värde → hoppa raden (defensivt mot skräp)
        if value >= MIN_VALUE:
            rows.append(Row(dimension=dimension, segment=segment, value=value))
    return rows


# source_type → parser. Native LinkedIn-export-parsers registreras här när vi har
# riktiga exempelfiler att skriva dem mot.
PARSERS = {
    "linkedin_follower_demographics": parse_canonical,
}


def _build_claims(
    company: str, rows: list[Row], source_type: str, attested_at: str, url: str | None
) -> list[tuple[str, Claim]]:
    by_dim: dict[str, list[Row]] = {}
    for r in rows:
        by_dim.setdefault(r.dimension, []).append(r)

    source = ClaimSource(kind="attested", label=DEFAULT_ATTESTED_LABEL, attested_at=attested_at, url=url)
    out: list[tuple[str, Claim]] = []
    for dimension, dim_rows in by_dim.items():
        template = _DIMENSION_TEMPLATES.get(dimension)
        if not template:
            continue  # okänd dimension → ingen mening att rendera
        top = sorted(dim_rows, key=lambda r: r.value, reverse=True)[:TOP_SEGMENTS_PER_DIMENSION]
        for r in top:
            statement = template.format(company=company, value=r.value, segment=r.segment)
            # Deterministiskt id på (source_type, dimension, segment) → re-upload med nytt
            # värde skriver ÖVER samma claim i stället för att skapa en dubblett.
            claim_id = "att-" + hashlib.sha1(
                f"{source_type}|{dimension}|{r.segment.lower()}".encode("utf-8")
            ).hexdigest()[:14]
            out.append((
                claim_id,
                Claim(
                    claim_kind="narrative",
                    subject_ref="org",
                    statement=statement[:200],
                    source=[source],
                    confidence=1.0,         # attesterad + deterministisk → ingen review
                    included_in_output=True,
                    needs_review=False,
                ),
            ))
    return out
