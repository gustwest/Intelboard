"""compute_trust_gap — materialiserar det levande Förtroendegap-tillståndet (spec §5.5, §8).

Evidensbaserad poäng (declared/demonstrated) som ALDRIG påverkas av perception. Perception
(salience/valens) läses om den finns (skrivs av värme-probarna, #6) och används bara till
gap-analys + flaggor, grindat av salience-golvet och konfidens — asymmetriskt: anseenderisk
(perceived > evidens) kräver högre ribba än möjlighet (perceived < evidens).

Idempotent via inputs_hash (compile_schema-stil): oförändrade inputs → hoppar över skrivning.
"""
from __future__ import annotations

import hashlib
import json
import logging
from datetime import datetime, timezone
from typing import Any

import firestore_client as fs
from schema_org import humanization_config as hc
from schema_org.claims import iter_culture_claims

log = logging.getLogger(__name__)

# polling_results-dok som värme-probarna (#6) skriver. Frånvaro → ingen perception.
WARMTH_PROBE_DOC = hc.WARMTH_PROBE_DOC


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _claim_weight(claim: Any) -> float:
    """Demonstrated-vikt för ett claim: verifierad assurance > självverifierande item >
    bolagets ord (manual ≈ 0). Tar starkaste källan vid flera (dual-source)."""
    best = 0.0
    for src in (claim.source or []):
        if src.assurance_level:
            w = hc.ASSURANCE_BASE_WEIGHT.get(src.assurance_level, 0.0)
        elif src.kind == "item":
            w = hc.ITEM_UNVERIFIED_WEIGHT
        else:
            w = 0.0
        best = max(best, w)
    return best


def _read_perceived(client_id: str) -> dict[str, Any]:
    snap = fs.polling_results_col(client_id).document(WARMTH_PROBE_DOC).get()
    if not getattr(snap, "exists", False):
        return {}
    return (snap.to_dict() or {}).get("dimensions") or {}


def _evidence_ref(claim: Any, weight: float) -> dict[str, Any]:
    src = (claim.source or [None])[0]
    return {
        "warmth_mode": claim.warmth_mode,
        "predicate": claim.predicate,
        "assurance_level": getattr(src, "assurance_level", None) if src else None,
        "source_kind": getattr(src, "kind", None) if src else None,
        "weight": round(weight, 3),
        "label": (getattr(src, "label", None) if src else None) or claim.statement,
    }


def _maybe_flag(dimension: str, credibility_gap: float, confidence: float) -> dict[str, Any] | None:
    """Flagga reses bara över magnitud- OCH konfidens-tröskel. Asymmetri: anseenderisk
    (gap > 0) kräver hög konfidens (+ korroboration i Fas 2); möjlighet (gap < 0) frikostigare."""
    if abs(credibility_gap) < hc.GAP_MAGNITUDE_MIN or confidence < hc.FLAG_CONFIDENCE_MIN:
        return None
    if credibility_gap > 0:
        if confidence < hc.OVER_CLAIM_CONFIDENCE_MIN:
            return None
        return {"kind": "over_claim", "dimension": dimension, "confidence": round(confidence, 3)}
    return {"kind": "opportunity", "dimension": dimension, "confidence": round(confidence, 3)}


def _inputs_hash(claims: list[Any], perceived_all: dict[str, Any]) -> str:
    claim_keys = sorted(
        f"{c.dimension}|{c.warmth_mode}|{c.predicate}|{c.value}|{c.statement}|"
        + ",".join(f"{s.kind}:{s.assurance_level}" for s in (c.source or []))
        for c in claims
    )
    blob = json.dumps({"claims": claim_keys, "perceived": perceived_all}, sort_keys=True, default=str)
    return hashlib.sha1(blob.encode("utf-8")).hexdigest()


def compute(client_id: str) -> dict[str, Any]:
    """Ren beräkning av trust_gap-dokumentet (ingen skrivning)."""
    if not fs.client_doc(client_id).get().exists:
        raise KeyError(f"client not found: {client_id}")

    claims = list(iter_culture_claims(client_id))
    perceived_all = _read_perceived(client_id)

    dimensions: dict[str, Any] = {}
    flags: list[dict[str, Any]] = []
    declared_cov = demonstrated_cov = 0

    for d in hc.DIMENSIONS:
        d_claims = [c for c in claims if c.dimension == d]
        declared = 1.0 if any(c.warmth_mode == "declared" for c in d_claims) else 0.0
        demo_sum = sum(_claim_weight(c) for c in d_claims if c.warmth_mode == "demonstrated")
        demonstrated = min(1.0, demo_sum / hc.TARGET_NORM) if hc.TARGET_NORM else 0.0
        if declared:
            declared_cov += 1
        if demonstrated > 0:
            demonstrated_cov += 1

        # Poängen är ENBART evidens — perception ingår aldrig (§2.4, §8 steg 4).
        score = min(hc.SCORE_W_DECLARED * declared, hc.DECLARED_CAP) + hc.SCORE_W_DEMONSTRATED * demonstrated
        evidence = score

        entry: dict[str, Any] = {
            "declared": declared,
            "demonstrated": round(demonstrated, 3),
            "score": round(score, 3),
            "substance_gap": round(demonstrated - declared, 3),
            "evidence": [_evidence_ref(c, _claim_weight(c)) for c in d_claims],
        }

        perceived = perceived_all.get(d)
        salience = (perceived or {}).get("salience", 0.0)
        if perceived and salience >= hc.SALIENCE_FLOOR:
            entry["perceived"] = perceived
            valence = perceived.get("valence")
            if valence is not None:
                cred = round(valence - evidence, 3)
                entry["credibility_gap"] = cred
                flag = _maybe_flag(d, cred, perceived.get("confidence", 0.0))
                if flag:
                    flags.append(flag)
        else:
            # Låg/ingen salience: "ännu inte synlig" — räkna ej valens/gap på tomhet (§8 steg 5).
            entry["perceived"] = {"status": "not_visible", **(perceived or {})}

        dimensions[d] = entry

    overall = sum(hc.DIMENSION_WEIGHTS[d] * dimensions[d]["score"] for d in hc.DIMENSIONS)
    doc: dict[str, Any] = {
        "computed_at": _now_iso(),
        "overall_score": round(overall, 3),
        "coverage": {"declared": declared_cov, "demonstrated": demonstrated_cov, "of": len(hc.DIMENSIONS)},
        "dimensions": dimensions,
        "flags": flags,
    }
    doc["inputs_hash"] = _inputs_hash(claims, perceived_all)
    return doc


def run(client_id: str) -> dict[str, Any]:
    """Beräkna och skriv trust_gap (överskriv). Hoppar över om inputs oförändrade."""
    doc = compute(client_id)
    existing = fs.trust_gap_doc(client_id).get()
    if getattr(existing, "exists", False) and (existing.to_dict() or {}).get("inputs_hash") == doc["inputs_hash"]:
        log.info("trust_gap oförändrad för %s — hoppar över", client_id)
        return {"client_id": client_id, "skipped": True}
    fs.trust_gap_doc(client_id).set(doc)
    log.info("trust_gap skriven för %s: overall=%.3f", client_id, doc["overall_score"])
    return {
        "client_id": client_id, "written": True,
        "overall_score": doc["overall_score"], "coverage": doc["coverage"],
    }
