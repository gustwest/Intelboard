"""Deterministisk härledning av property-claims ur connector-data.

Strukturerade fält från connectorerna (GLEIF, LinkedIn-företagssida) är
*sourcade by construction* — vet vi att `founded` kom från en connector är claimet
källförsett utan LLM. Den här modulen mappar `raw_item.extra` → property-claims.

Fritext (`content`: about, inlägg) hanteras INTE här — den
kräver narrativ extraktion (se docs/claims-provenance-spec.md §5.2–5.3).

Sociala mätvärden (followers m.m.) mappas aldrig — de utelämnas helt enkelt.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Iterator

import firestore_client as fs
from schemas import Claim, ClaimSource, LinkedInStatus
from services import confidence_scorer

# extra-fält → (schema.org-predikat, visningstext-mall). Källfält som saknas
# i mappen ignoreras; followers/likes finns medvetet inte med.
_COMPANY_FIELD_MAP: dict[str, tuple[str, str]] = {
    "founded": ("foundingDate", "Grundat {value}"),
    "headquarters": ("address", "Säte: {value}"),
    "address": ("address", "Säte: {value}"),
    "industry": ("knowsAbout", "Verksam inom {value}"),
    "industries": ("knowsAbout", "Verksam inom {value}"),
    "lei": ("leiCode", "LEI-kod {value}"),
}


def derive_property_claims(client_id: str) -> Iterator[Claim]:
    """Yielda property-claims för företagsnivå ur godkända företags-raw_items."""
    for snap in fs.raw_items_company_col(client_id).stream():
        raw = snap.to_dict() or {}
        if not raw.get("included_in_output", True):
            continue
        source = ClaimSource(kind="item", item_id=snap.id, employee_id=None)
        extra = raw.get("extra") or {}
        for field, value in extra.items():
            mapping = _COMPANY_FIELD_MAP.get(field)
            if not mapping or value in (None, "", []):
                continue
            predicate, template = mapping
            yield Claim(
                claim_kind="property",
                subject_ref="org",
                predicate=predicate,
                value=value,
                statement=template.format(value=_display(value)),
                source=[source],
                confidence=1.0,
            )
        # Koncernstruktur (GLEIF Level 2): moder/dotter är schema.org-Organization-
        # objekt, inte skalärer → egen härledning utanför _COMPANY_FIELD_MAP.
        yield from _relationship_claims(extra, source)


def derive_skill_claims(client_id: str, now: datetime | None = None) -> Iterator[Claim]:
    """Yielda org-nivå kompetens-claims (knowsAbout) ur platsannonser + LinkedIn (spec §3–§4).

    En öppen annons bevisar kapaciteten fullt ut (1.0). En stängd annons klingar av
    (1.0 → 0.7 → 0.4) och sunsetas efter 24 mån. En kompetens som matchas i BÅDE
    XML-annonserna OCH den verifierade LinkedIn-datan ("Dual-Source Truth") lyfts till
    1.0 och re-verifieras — den klingar inte av. Kompetenser som bara finns i den
    verifierade LinkedIn-datan publiceras som attesterade claims.

    Kompetenserna ligger i `skills_enriched`/`extra["skills"]` (jobfeed-connectorn) så
    de överlever stängningen utan att annonstexten hämtas på nytt.
    """
    linkedin_skills = _active_linkedin_skills(client_id)  # {normaliserad: visningsform}
    linkedin_source = _linkedin_claim_source(client_id) if linkedin_skills else None
    job_skill_norms: set[str] = set()

    for snap in fs.raw_items_company_col(client_id).stream():
        raw = snap.to_dict() or {}
        if raw.get("schema_type") != "JobPosting":
            continue
        if raw.get("strategic") is False:
            continue  # generisk roll (spec §2.2) → bidrar inte till kapabilitetsprofilen
        # LLM-berikade kompetenser (job_enrichment) vinner över den deterministiska
        # baslinjen (skill_extractor); faller tillbaka på baslinjen om ej berikad.
        skills = raw.get("skills_enriched") or (raw.get("extra") or {}).get("skills") or []
        if not skills:
            continue

        closed_at = raw.get("closed_at")
        if closed_at is None and not raw.get("included_in_output", True):
            continue  # exkluderad av annan anledning än stängning

        item_source = ClaimSource(kind="item", item_id=snap.id, employee_id=None)
        for skill in skills:
            if not skill:
                continue
            norm = _norm(skill)
            job_skill_norms.add(norm)
            dual = norm in linkedin_skills
            confidence = confidence_scorer.skill_confidence(closed_at, dual_source=dual, now=now)
            if confidence <= 0.0:
                continue  # sunset (och ej re-verifierad av LinkedIn) → härleds inte
            # Dual-source: citera båda källorna (annonsen + den verifierade LinkedIn-datan).
            sources = [item_source] + ([linkedin_source] if dual and linkedin_source else [])
            yield Claim(
                claim_kind="property",
                subject_ref="org",
                predicate="knowsAbout",
                value=skill,
                statement=f"Kompetens i huset: {skill}",
                source=sources,
                confidence=confidence,
            )

    # Kompetenser som bara finns i den verifierade LinkedIn-datan (ingen matchande
    # annons) publiceras som attesterade claims — LinkedIn-connectorns egna bidrag.
    if linkedin_source:
        for norm, display in sorted(linkedin_skills.items()):
            if norm in job_skill_norms:
                continue
            yield Claim(
                claim_kind="property",
                subject_ref="org",
                predicate="knowsAbout",
                value=display,
                statement=f"Kompetens i huset: {display}",
                source=[linkedin_source],
                confidence=1.0,
            )


def _active_linkedin_skills(client_id: str) -> dict[str, str]:
    """{normaliserad: visningsform} för det aktiva, verifierade LinkedIn-snapshottet.

    Tom dict om inget VERIFIED + is_active-snapshot finns. Filtreras i Python (inte
    Firestore-query) för testbarhet och konsekvens med review-flödet.
    """
    for _sid, snap in fs.iter_linkedin_snapshots(client_id):
        if snap.get("status") == LinkedInStatus.VERIFIED and snap.get("is_active"):
            return {_norm(s): s for s in (snap.get("skills") or []) if s}
    return {}


def _linkedin_claim_source(client_id: str) -> ClaimSource:
    snap = fs.client_doc(client_id).get().to_dict() or {}
    return ClaimSource(
        kind="attested",
        label="LinkedIn-kapacitetsdata, verifierad av Geogiraph",
        url=snap.get("company_linkedin_url"),
    )


def _norm(skill: str) -> str:
    return " ".join(str(skill).lower().split())


def _relationship_claims(extra: dict[str, Any], source: ClaimSource) -> Iterator[Claim]:
    parent = extra.get("parent_organization")
    if isinstance(parent, dict) and parent.get("name"):
        yield Claim(
            claim_kind="property",
            subject_ref="org",
            predicate="parentOrganization",
            value=_org_ref(parent),
            statement=f"Del av {parent['name']}",
            source=[source],
            confidence=1.0,
        )
    for sub in extra.get("subsidiaries") or []:
        if isinstance(sub, dict) and sub.get("name"):
            yield Claim(
                claim_kind="property",
                subject_ref="org",
                predicate="subOrganization",
                value=_org_ref(sub),
                statement=f"Dotterbolag: {sub['name']}",
                source=[source],
                confidence=1.0,
            )


def _org_ref(node: dict[str, Any]) -> dict[str, Any]:
    """Bygg en schema.org-Organization-referens (namn + LEI som leiCode)."""
    ref: dict[str, Any] = {"@type": "Organization", "name": node.get("name")}
    if node.get("lei"):
        ref["leiCode"] = node["lei"]
    return ref


def _display(value: Any) -> str:
    if isinstance(value, (list, tuple)):
        return ", ".join(str(v) for v in value)
    return str(value)
