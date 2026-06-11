"""Semantisk dedup av narrative-claims: hitta near-duplicates (parafraser) och kollapsa
dem via det BEFINTLIGA aggregerings-maskineriet (services.claim_aggregation).

Varför ett eget pass och inte i compile: render-vägen (compile_client) ska vara
deterministisk, snabb och nätverksfri. Semantisk likhet kräver en modell — den hör
hemma UPPSTRÖMS (jobb/endpoint), som ett claim-nivå-pass som markerar dubbletter
`review_status="aggregated"`. Compile plockar redan bort aggregerade claims, så sidan
krymper utan att render-koden rör en modell.

Varför LLM och inte textnormalisering: `compiler._normalize` fångar bara exakt/nästan-
exakt text. Den verkliga väggen är parafraser — "Grundades av Josefin, Erik och Benjamin"
vs "Grundat av LinkedIn-veteranerna Erik Bergqvist, Josefin Westergren och Benjamin von
Ahn". Det kräver semantisk förståelse. Ingen embedding-infra finns i repot; en validator-
pass (samma EU-modell som claim_aggregation) räcker och återanvänder services.llm-stacken.

Flöde: ladda kandidat-claims → en LLM-pass grupperar redundanta index → varje kluster
(≥2) skickas till `aggregate_claims(..., apply)` som syntetiserar 1–2 narratives och
markerar originalen aggregerade. `apply=False` = preview (inga skrivningar).
"""
from __future__ import annotations

import logging
from typing import Any

import firestore_client as fs
from services.claim_aggregation import AggregationResult, aggregate_claims
from services.llm import invoke_json, make_validator

log = logging.getLogger(__name__)

MIN_CLUSTER = 2


def find_redundant_clusters(statements: list[str]) -> list[list[int]] | None:
    """En LLM-pass: gruppera 0-baserade index på claims som hävdar SAMMA sak (parafraser).
    None vid otillgänglig/trasig modell. Klustren är disjunkta (ett claim i max ett)."""
    llm = make_validator()
    if llm is None:
        return None
    system = (
        "Du får en numrerad lista av påståenden om ETT bolag. Gruppera de som uttrycker "
        "SAMMA faktiska innehåll — parafraser, omformuleringar eller delmängder av varandra. "
        "Gruppera ENDAST äkta dubbletter, inte påståenden som bara berör samma tema. Ett "
        "påstående får vara i högst en grupp. Hoppa över unika påståenden helt.\n"
        'Returnera ENDAST JSON: {"clusters": [[1, 4], [2, 7, 9]]} med 1-baserade nummer.'
    )
    user = "\n".join(f"{i}. {s}" for i, s in enumerate(statements, 1) if s)
    raw = invoke_json(llm, system, user)
    if not raw or "clusters" not in raw:
        log.warning("semantic_dedup: LLM gav inga användbara kluster")
        return None
    return _parse_clusters(raw.get("clusters"), len(statements))


def _parse_clusters(raw: Any, n: int) -> list[list[int]]:
    """1-baserade LLM-kluster → disjunkta, validerade 0-baserade index-listor (≥2)."""
    seen: set[int] = set()
    out: list[list[int]] = []
    for cluster in raw or []:
        if not isinstance(cluster, list):
            continue
        idx: list[int] = []
        for v in cluster:
            try:
                i = int(v) - 1
            except (TypeError, ValueError):
                continue
            if 0 <= i < n and i not in seen and i not in idx:
                idx.append(i)
        if len(idx) >= MIN_CLUSTER:
            seen.update(idx)
            out.append(sorted(idx))
    return out


def _candidate_claims(client_id: str) -> list[tuple[str, str]]:
    """Org-narrative-claims som faktiskt skulle renderas → kandidater för dedup.
    (id, statement). Exkluderar rejected/aggregated/utdragna och tomma."""
    out: list[tuple[str, str]] = []
    for cid, raw in fs.iter_claims(client_id):
        if raw.get("claim_kind") != "narrative":
            continue
        if raw.get("subject_ref", "org") != "org":
            continue
        if raw.get("review_status") in ("rejected", "aggregated"):
            continue
        if not raw.get("included_in_output", True):
            continue
        stmt = (raw.get("statement") or "").strip()
        if stmt:
            out.append((cid, stmt))
    return out


def dedup_client(client_id: str, apply: bool = False) -> dict[str, Any]:
    """Kör semantisk dedup för en kund. apply=False = preview (inga skrivningar).

    Returnerar en sammanfattning: antal kandidater, funna kluster, och per kluster
    aggregerings-resultatet. llm_unavailable=True om modellen saknas (no-op, inga fel)."""
    candidates = _candidate_claims(client_id)
    if len(candidates) < MIN_CLUSTER:
        return {"candidates": len(candidates), "clusters": 0, "results": [], "applied": apply}

    clusters = find_redundant_clusters([s for _, s in candidates])
    if clusters is None:
        return {"candidates": len(candidates), "clusters": 0, "results": [],
                "llm_unavailable": True, "applied": False}

    results: list[AggregationResult] = []
    for cluster in clusters:
        ids = [candidates[i][0] for i in cluster]
        results.append(aggregate_claims(client_id, ids, dimension_hint="redundans", apply=apply))

    return {
        "candidates": len(candidates),
        "clusters": len(clusters),
        "results": [r.model_dump() for r in results],
        "applied": apply,
    }
