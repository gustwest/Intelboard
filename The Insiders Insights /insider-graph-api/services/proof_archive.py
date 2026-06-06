"""Bevisarkiv (Spår D3) — granskningsbar vy över verifierade claims.

Ren sammanställning (ingen I/O i kärnan → enhetstestbar utan Firestore). Tar
kundens claims + verifierings-records och bygger arkiv-poster: varje post är ett
claim med stark nog proveniens för att räknas som EVIDENS, sammanvävt med sitt
verifieringsrecord (de fyra kontrollerna §7.2) eller sitt deterministiskt grundade
citat (services/claim_grounding).

Inklusionsregel (revisor-mässig). Ett claim hör till arkivet om det är publicerat
(approved + included_in_output, ej needs_review/rejected/aggregated) OCH har antingen
  (a) en källa med `assurance_level` — manuell Geogiraph-verifiering, fyra kontroller, eller
  (b) en källa med ett verbatim-`quote` — deterministiskt grundat mot källtexten.
Allt annat hålls UTANFÖR: arkivet visar bara det vi faktiskt går i god för (förslag/
needs_review bor i en annan vy). `self_declared` INKLUDERAS men märks tydligt som
företagets egen uppgift — ärlighet genom etikettering, inte gömmande. Det är hela
poängen: en revisor litar på vyn för att vi visar svagheten, inte trots den.
"""
from __future__ import annotations

from typing import Any, Iterable, Iterator

from services.claim_grounding import MIN_QUOTE_CHARS

# Stark→svag. self_declared är lägst men fortfarande en nivå (företagets ord, märkt).
_ASSURANCE_RANK = {"independently_assured": 3, "third_party_reviewed": 2, "self_declared": 1}
TIER_ASSURED = "assured"      # bär assurance_level (fyra kontroller)
TIER_GROUNDED = "grounded"    # bär verbatim-citat (deterministisk grundning)


def _is_published(raw: dict[str, Any]) -> bool:
    """Endast publicerade claims hör till bevisarkivet (samma grind som leveransen)."""
    if raw.get("review_status") in ("rejected", "aggregated"):
        return False
    if raw.get("needs_review"):
        return False
    return bool(raw.get("included_in_output", True))


def _pick_proof_source(sources: list[dict[str, Any]]) -> dict[str, Any] | None:
    """Välj den starkaste källan som ger claimet rätt att stå i arkivet.

    Prioritet: högsta assurance_level → annars en källa med ett tillräckligt långt
    verbatim-citat. None om ingen källa når bevis-ribban (claimet utelämnas)."""
    assured = [s for s in sources if s.get("assurance_level")]
    if assured:
        return max(assured, key=lambda s: _ASSURANCE_RANK.get(s.get("assurance_level"), 0))
    for s in sources:
        if len((s.get("quote") or "").strip()) >= MIN_QUOTE_CHARS:
            return s
    return None


def _claim_statement(raw: dict[str, Any]) -> str:
    """Läsbar text för posten. Narrative → statement; property → 'predikat: värde'."""
    stmt = (raw.get("statement") or "").strip()
    if stmt:
        return stmt
    pred, val = raw.get("predicate"), raw.get("value")
    if pred and val is not None:
        return f"{pred}: {val}"
    return pred or "(utan text)"


def _as_of(source: dict[str, Any], verification: dict[str, Any] | None, raw: dict[str, Any]) -> str:
    """Postens kanoniska datum för sortering/filtrering: underlagets datum först
    (det revisorn bryr sig om), annars attesterings-/verifierings-/valideringsdatum."""
    if verification and verification.get("document_date"):
        return verification["document_date"]
    for key in ("attested_at",):
        if source.get(key):
            return source[key]
    if verification and verification.get("verified_at"):
        return verification["verified_at"]
    return raw.get("validated_at") or ""


def _verification_view(verification: dict[str, Any]) -> dict[str, Any]:
    """Den del av verifieringsrecordet arkivet exponerar (de fyra kontrollerna m.m.)."""
    return {
        "checks": verification.get("checks") or {},
        "verdict": verification.get("verdict"),
        "verification_text": verification.get("verification_text"),
        "evidence_type": verification.get("evidence_type"),
        "instrument_or_issuer": verification.get("instrument_or_issuer"),
        "document_date": verification.get("document_date"),
        "verified_at": verification.get("verified_at"),
        "verified_by": verification.get("verified_by"),
        "expires_at": verification.get("expires_at"),
    }


def _build_entry(
    claim_id: str, raw: dict[str, Any], verifications_by_id: dict[str, dict[str, Any]]
) -> dict[str, Any] | None:
    """Ett claim → en arkiv-post, eller None om proveniensen inte når bevis-ribban."""
    source = _pick_proof_source(raw.get("source") or [])
    if source is None:
        return None
    assurance = source.get("assurance_level")
    tier = TIER_ASSURED if assurance else TIER_GROUNDED
    verification = None
    vid = source.get("verification_id")
    if vid:
        verification = verifications_by_id.get(vid)
    return {
        "claim_id": claim_id,
        "statement": _claim_statement(raw),
        "claim_kind": raw.get("claim_kind"),
        "facet": raw.get("facet", "operational"),
        "dimension": raw.get("dimension"),
        "audience": raw.get("audience") or [],
        "proof_tier": tier,
        "assurance_level": assurance,
        "source": {
            "kind": source.get("kind"),
            "label": source.get("label"),
            "url": source.get("url"),
            "attested_at": source.get("attested_at"),
            "quote": source.get("quote"),
            "verification_id": vid,
        },
        "verification": _verification_view(verification) if verification else None,
        "as_of": _as_of(source, verification, raw),
        "validated_by": raw.get("validated_by"),
    }


def _passes_filters(
    entry: dict[str, Any],
    *,
    assurance_level: str | None,
    facet: str | None,
    dimension: str | None,
    tier: str | None,
    date_from: str | None,
    date_to: str | None,
) -> bool:
    if assurance_level and entry.get("assurance_level") != assurance_level:
        return False
    if facet and entry.get("facet") != facet:
        return False
    if dimension and entry.get("dimension") != dimension:
        return False
    if tier and entry.get("proof_tier") != tier:
        return False
    # ISO-datum jämförs lexikografiskt (date_from/date_to som "YYYY-MM-DD").
    as_of = entry.get("as_of") or ""
    if date_from and (not as_of or as_of < date_from):
        return False
    if date_to and as_of and as_of[:10] > date_to:
        return False
    return True


def _summarize(entries: list[dict[str, Any]]) -> dict[str, Any]:
    by_tier: dict[str, int] = {}
    by_assurance: dict[str, int] = {}
    by_facet: dict[str, int] = {}
    dates = [e["as_of"] for e in entries if e.get("as_of")]
    for e in entries:
        by_tier[e["proof_tier"]] = by_tier.get(e["proof_tier"], 0) + 1
        lvl = e.get("assurance_level")
        if lvl:
            by_assurance[lvl] = by_assurance.get(lvl, 0) + 1
        f = e.get("facet") or "operational"
        by_facet[f] = by_facet.get(f, 0) + 1
    return {
        "total": len(entries),
        "by_tier": by_tier,
        "by_assurance_level": by_assurance,
        "by_facet": by_facet,
        "as_of_earliest": min(dates) if dates else None,
        "as_of_latest": max(dates) if dates else None,
    }


def build_archive(
    claims: Iterable[tuple[str, dict[str, Any]]],
    verifications_by_id: dict[str, dict[str, Any]],
    *,
    assurance_level: str | None = None,
    facet: str | None = None,
    dimension: str | None = None,
    tier: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
) -> dict[str, Any]:
    """Bygg bevisarkivet (poster + summary) ur claims + verifierings-records.

    `claims` = iterator av (claim_id, raw_dict) (t.ex. fs.iter_claims).
    `verifications_by_id` = {verification_id: record} (t.ex. ur fs.iter_verifications).
    Filtren appliceras EFTER att posten byggts. Poster sorteras nyast först (as_of)."""
    entries: list[dict[str, Any]] = []
    for claim_id, raw in claims:
        if not _is_published(raw):
            continue
        entry = _build_entry(claim_id, raw, verifications_by_id)
        if entry is None:
            continue
        if not _passes_filters(
            entry,
            assurance_level=assurance_level, facet=facet, dimension=dimension,
            tier=tier, date_from=date_from, date_to=date_to,
        ):
            continue
        entries.append(entry)
    entries.sort(key=lambda e: e.get("as_of") or "", reverse=True)
    return {"entries": entries, "summary": _summarize(entries)}
