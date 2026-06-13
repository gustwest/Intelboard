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
from services.persona_derivation import derive_claim_audience, get_active_personas

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


# --- Humaniseringslager: culture-claims (docs/humanization-trust-gap-spec.md §5.3) ---
# Företagsnivå-extra-fält → (predikat, warmth_mode, dimension, mall). Connector-
# levererade culture-fält; saknas fältet ignoreras det. Auto-deriverade claims bär
# INGEN assurance-nivå — bara den manuella verifieringen (services/verification.py)
# sätter den, så de rör inte demonstrated-poängen förrän de verifierats (§8).
_CULTURE_FIELD_MAP: dict[str, tuple[str, str, str | None, str]] = {
    "ethics_policy_url": ("ethicsPolicy", "declared", "ethics", "Etikpolicy: {value}"),
    "diversity_policy_url": ("diversityPolicy", "declared", "inclusion", "Mångfaldspolicy: {value}"),
    "slogan": ("slogan", "declared", None, "Ledord: {value}"),
    "csr_topics": ("knowsAbout", "declared", "community", "Engagerade i {value}"),
    "collective_agreement": ("memberOf", "demonstrated", "transparency", "Kollektivavtal: {value}"),
    "workplace_label": ("hasCredential", "demonstrated", "wellbeing", "Utmärkelse: {value}"),
}


def derive_culture_claims(client_id: str) -> Iterator[Claim]:
    """Yielda culture-taggade property-claims ur företags-raw_items (connector-fält +
    jobbförmåner). Item-källa (självverifierande); ingen assurance-nivå."""
    # A1: persona-tagga culture-claims via dimension (DIMENSION_PERSONA_RELEVANCE) mot
    # aktiva personor → de når persona-sektionerna OCH den persona-fråge-drivna FAQ:n.
    active = get_active_personas(client_id)
    for snap in fs.raw_items_company_col(client_id).stream():
        raw = snap.to_dict() or {}
        if not raw.get("included_in_output", True):
            continue
        source = ClaimSource(kind="item", item_id=snap.id, employee_id=None)
        extra = raw.get("extra") or {}

        for field, value in extra.items():
            mapping = _CULTURE_FIELD_MAP.get(field)
            if not mapping or value in (None, "", []):
                continue
            predicate, warmth_mode, dimension, template = mapping
            yield Claim(
                claim_kind="property", subject_ref="org", predicate=predicate, value=value,
                statement=template.format(value=_display(value)), source=[source], confidence=1.0,
                facet="culture", warmth_mode=warmth_mode, dimension=dimension,
                audience=derive_claim_audience({"facet": "culture", "dimension": dimension}, active),
            )

        # Jobbförmåner i en levande annons = demonstrerad (item-källa). Förmånerna ligger
        # i benefits_enriched (LLM-berikad, jfr skills_enriched) eller extra["benefits"].
        if raw.get("schema_type") == "JobPosting":
            benefits = raw.get("benefits_enriched") or extra.get("benefits") or []
            if isinstance(benefits, str):
                benefits = [benefits]
            for benefit in benefits:
                if not benefit:
                    continue
                yield Claim(
                    claim_kind="property", subject_ref="org", predicate="jobBenefits",
                    value=benefit, statement=f"Erbjuder: {benefit}", source=[source], confidence=1.0,
                    facet="culture", warmth_mode="demonstrated", dimension="wellbeing",
                    audience=derive_claim_audience({"facet": "culture", "dimension": "wellbeing"}, active),
                )


def culture_claims_from_esg(client_id: str) -> Iterator[Claim]:
    """Återanvänd ESG-inlämningens data som culture-claims — samla EJ in på nytt (§5.3).

    Mångfald (kvinnor i ledning/styrelse) → inclusion; ojusterat lönegap → transparency.
    Källa manual (bolagets självrapport) → self_declared-styrka tills verifierad. Deterministiska
    'culesg-'-id:n → omkörning skriver över. MVP: senaste inlämningen väljs efter phase_reached.
    """
    subs = list(fs.iter_esg_submissions(client_id))
    if not subs:
        return
    _sid, sub = max(subs, key=lambda kv: (kv[1].get("phase_reached") or 0))
    src = ClaimSource(kind="manual", label="uppgift från bolaget")
    active = get_active_personas(client_id)  # A1: persona-tagga ESG-culture-claims via dimension
    core = sub.get("core") or {}
    basic = sub.get("csrd_basic") or {}

    figures: list[tuple[str, str]] = []  # (dimension, statement)
    if core.get("management_female_pct") is not None:
        figures.append(("inclusion", f"Andelen kvinnor i ledningsgruppen är {core['management_female_pct']}%."))
    if core.get("board_female_pct") is not None:
        figures.append(("inclusion", f"Andelen kvinnor i styrelsen är {core['board_female_pct']}%."))
    if basic.get("unadjusted_gender_pay_gap_pct") is not None:
        figures.append(("transparency", f"Ojusterat lönegap (Gender Pay Gap): {basic['unadjusted_gender_pay_gap_pct']}%."))

    for dimension, statement in figures:
        yield Claim(
            claim_kind="narrative", subject_ref="org", statement=statement[:200], source=[src],
            confidence=1.0, included_in_output=True, needs_review=False, review_status="approved",
            facet="culture", warmth_mode="demonstrated", dimension=dimension,
            audience=derive_claim_audience({"facet": "culture", "dimension": dimension}, active),
        )


def iter_culture_claims(client_id: str) -> Iterator[Claim]:
    """Alla culture-taggade claims: persisterade (godkända, ej rejected) + deterministiskt
    deriverade (connector-fält/jobbförmåner + ESG-återanvändning). Konsumeras av
    jobs/compute_trust_gap.py (§8)."""
    for _claim_id, raw in fs.iter_claims(client_id):
        if not raw.get("included_in_output", True):
            continue
        # rejected = bortvald; aggregated = uppslukad av ett narrative-claim
        # (evidens, renderas aldrig). Skippas oavsett included_in_output.
        if raw.get("review_status") in ("rejected", "aggregated"):
            continue
        if raw.get("facet") != "culture":
            continue
        yield Claim(**raw)
    yield from derive_culture_claims(client_id)
    yield from culture_claims_from_esg(client_id)


def derive_property_claims(client_id: str) -> Iterator[Claim]:
    """Yielda property-claims för företagsnivå ur godkända företags-raw_items.

    Persona-taggning (A1, wire:ad 2026-06-12): operationella property-claims taggas
    via predikat (`OPERATIONAL_PERSONA_RELEVANCE`) mot kundens aktiva personor, så de
    når persona-sektionerna i stället för att alltid bli evergreen. Sker här vid
    derivationen (compile-time) → omedelbar effekt utan re-extraktion. Predikat utan
    kartläggning → tom audience (evergreen), oförändrat beteende."""
    active = get_active_personas(client_id)
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
                audience=derive_claim_audience(
                    {"facet": "operational", "predicate": predicate}, active
                ),
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
