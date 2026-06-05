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
from jobs._run_tracker import record_run
from schema_org import humanization_config as hc
from schema_org.claims import iter_culture_claims
from services import engine_baselines

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


def _eligible_engines(by_engine: dict[str, Any]) -> list[str]:
    """Motorer som uttalat sig (valens satt + salience ≥ golvet) på en dimension."""
    return [
        engine
        for engine, stats in by_engine.items()
        if (stats or {}).get("valence") is not None
        and (stats or {}).get("salience", 0.0) >= hc.SALIENCE_FLOOR
    ]


def _calibrated_valence(valence: float, by_engine: dict[str, Any], engine_bias: dict[str, float]) -> float:
    """Centrera toppnivå-valensen mot panel-snittet (Fas 2.2 per-engine-baselines).

    Drar bort snitt-biasen för de motorer som faktiskt bidrog. När hela panelen
    bidrar är snitt-biasen ≈ 0 (no-op); när bara en rosig motor "ser" bolaget tas
    just den motorns leniency bort så credibility_gap inte blåses upp av en motor."""
    if not engine_bias:
        return round(valence, 3)
    present = [engine_bias[e] for e in _eligible_engines(by_engine) if e in engine_bias]
    if not present:
        return round(valence, 3)
    mean_bias = sum(present) / len(present)
    return round(min(1.0, max(0.0, valence - mean_bias)), 3)


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


def _detect_flags(
    dimension: str,
    entry: dict[str, Any],
    prior_entry: dict[str, Any] | None = None,
    engine_bias: dict[str, float] | None = None,
) -> list[dict[str, Any]]:
    """Detektera alla applicerbara gap-typer för en dimension (spec §10 punkt 4).

    Aktiva typer: over_claim, opportunity, missing_evidence, contradiction,
    factual_drift, persona_mismatch (Fas 2.1d).
    Stubbade: competitive_displacement (Fas 4) — datamodellen känner till den
    men den reses aldrig härifrån.

    En dimension kan producera flera flaggor samtidigt (t.ex. missing_evidence + over_claim).
    """
    flags: list[dict[str, Any]] = []
    declared = entry.get("declared", 0)
    demonstrated = entry.get("demonstrated", 0.0)
    perceived = entry.get("perceived") or {}
    salience = perceived.get("salience", 0.0)
    valence = perceived.get("valence")
    confidence = perceived.get("confidence", 0.0)
    credibility_gap = entry.get("credibility_gap")
    is_visible = perceived.get("status") != "not_visible"

    # Variansgrind (Fas 2.2c): är perceptionsmätningen stabil nog att lita på?
    # valence_variance kommer från probe-kalibreringen (Fas 2.2a). Över taket =
    # för instabilt → vi reser INGA perception-baserade flaggor (vi larmar inte på
    # brus). missing_evidence är perception-oberoende och passerar grinden.
    variance = perceived.get("valence_variance")
    perception_stable = variance is None or variance < hc.PERCEPTION_VARIANCE_CEILING

    # 1. missing_evidence — deklarerat men ej belagt. Perception-oberoende.
    # Severity är "high" om AI redan ser oss (då sticker risken ut), annars "medium".
    if declared and demonstrated == 0:
        flags.append({
            "kind": "missing_evidence",
            "dimension": dimension,
            "severity": "high" if is_visible and salience >= hc.SALIENCE_FLOOR else "medium",
        })

    # Alla perception-baserade detektioner nedan grindas av mätstabiliteten.
    if not perception_stable:
        log.info(
            "dimension %s: perception-flaggor grindade (valence_variance=%.3f ≥ tak %.2f)",
            dimension, variance, hc.PERCEPTION_VARIANCE_CEILING,
        )
        return flags

    # 2 & 3. Perception-baserade flaggor — asymmetrisk grind (anseenderisk ribbas högre).
    if credibility_gap is not None and abs(credibility_gap) >= hc.GAP_MAGNITUDE_MIN \
            and confidence >= hc.FLAG_CONFIDENCE_MIN:
        if credibility_gap > 0 and confidence >= hc.OVER_CLAIM_CONFIDENCE_MIN:
            flags.append({
                "kind": "over_claim",
                "dimension": dimension,
                "confidence": round(confidence, 3),
                "gap_magnitude": round(credibility_gap, 3),
            })
        elif credibility_gap < 0:
            flags.append({
                "kind": "opportunity",
                "dimension": dimension,
                "confidence": round(confidence, 3),
                "gap_magnitude": round(abs(credibility_gap), 3),
            })

    # 4. contradiction — probe-motorerna är oense. Kräver ≥2 motorer ovan salience-golvet.
    # Valenserna centreras mot per-motor-baslinjen (Fas 2.2) så att en motors
    # systematiska leniency inte blåser upp spreaden till ett falskt larm.
    bias = engine_bias or {}
    by_engine = perceived.get("by_engine") or {}
    eligible = [
        (engine, round((stats or {}).get("valence") - bias.get(engine, 0.0), 3))
        for engine, stats in by_engine.items()
        if (stats or {}).get("valence") is not None
        and (stats or {}).get("salience", 0.0) >= hc.SALIENCE_FLOOR
    ]
    if len(eligible) >= 2:
        vals = [v for _, v in eligible]
        spread = max(vals) - min(vals)
        if spread >= hc.CONTRADICTION_SPREAD_MIN:
            warmest = max(eligible, key=lambda x: x[1])
            coolest = min(eligible, key=lambda x: x[1])
            flags.append({
                "kind": "contradiction",
                "dimension": dimension,
                "spread": round(spread, 3),
                "warmest_engine": warmest[0],
                "coolest_engine": coolest[0],
            })

    # 5. persona_mismatch — aktiva personor uppfattar bolaget tydligt olika på samma
    # dimension. Mirror av contradiction-detektionen men över persona-axeln.
    # Driver "AI ser er som varma för X-målgrupp men inte för Y" i ops-cockpiten +
    # recept-routing till persona-specifika kanaler i Fas 2.1e.
    per_persona = perceived.get("per_persona") or {}
    persona_eligible = [
        (pid, (stats or {}).get("valence"))
        for pid, stats in per_persona.items()
        if (stats or {}).get("valence") is not None
        and (stats or {}).get("salience", 0.0) >= hc.SALIENCE_FLOOR
    ]
    if len(persona_eligible) >= 2:
        p_vals = [v for _, v in persona_eligible]
        p_spread = max(p_vals) - min(p_vals)
        if p_spread >= hc.PERSONA_MISMATCH_SPREAD_MIN:
            warmest_p = max(persona_eligible, key=lambda x: x[1])
            coolest_p = min(persona_eligible, key=lambda x: x[1])
            flags.append({
                "kind": "persona_mismatch",
                "dimension": dimension,
                "spread": round(p_spread, 3),
                "warmest_persona": warmest_p[0],
                "coolest_persona": coolest_p[0],
                # warmest/coolest valence-snapshots så receptet i Fas 2.1e kan rendera
                # konkret: "perceived som 0.78 för customer, 0.32 för employee"
                "warmest_valence": round(warmest_p[1], 3),
                "coolest_valence": round(coolest_p[1], 3),
            })

    # 6. factual_drift — AI:s bild har svalnat sedan förra mätningen utan att underlaget
    # gjort det. Kräver föregående snapshot med synlig perception + valens.
    if prior_entry and valence is not None:
        prior_perceived = prior_entry.get("perceived") or {}
        prior_valence = prior_perceived.get("valence")
        prior_demonstrated = prior_entry.get("demonstrated", demonstrated)
        prior_visible = prior_perceived.get("status") != "not_visible"
        if (
            prior_valence is not None
            and prior_visible
            and demonstrated >= prior_demonstrated - hc.DRIFT_DEMONSTRATED_TOLERANCE
            and (prior_valence - valence) >= hc.DRIFT_DROP_MIN
        ):
            flags.append({
                "kind": "factual_drift",
                "dimension": dimension,
                "valence_drop": round(prior_valence - valence, 3),
                "since_date": prior_entry.get("_snapshot_date"),
            })

    return flags


def _read_prior_snapshot(client_id: str, today: str | None = None) -> dict[str, Any] | None:
    """Senaste tidigare trust_gap-snapshot för drift-detektion. None om ingen finns.

    Filtrerar bort idag-och-senare snapshots (snapshots namnges efter datum och kan
    skapas av trust_gap_report från dagens egna output → self-reference om vi inte
    filtrerar). Default-today = idag i UTC.

    Returns: {"date": "YYYY-MM-DD", "dimensions": {dim: entry_dict}} eller None.
    """
    cutoff = today or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    prev_id, prev = "", None
    try:
        for sid, data in fs.iter_trust_gap_snapshots(client_id):
            if sid >= cutoff:
                continue
            if sid > prev_id:
                prev_id, prev = sid, data
    except Exception as exc:  # noqa: BLE001 — drift-detektion får aldrig stoppa kompileringen
        log.warning("kunde inte läsa trust_gap_snapshots för %s: %s", client_id, exc)
        return None
    if not prev:
        return None
    tg = prev.get("trust_gap") or {}
    return {"date": prev_id, "dimensions": tg.get("dimensions") or {}}


def _inputs_hash(claims: list[Any], perceived_all: dict[str, Any], prior_date: str | None) -> str:
    claim_keys = sorted(
        f"{c.dimension}|{c.warmth_mode}|{c.predicate}|{c.value}|{c.statement}|"
        + ",".join(f"{s.kind}:{s.assurance_level}" for s in (c.source or []))
        for c in claims
    )
    blob = json.dumps(
        {"claims": claim_keys, "perceived": perceived_all, "prior_date": prior_date},
        sort_keys=True,
        default=str,
    )
    return hashlib.sha1(blob.encode("utf-8")).hexdigest()


def compute(client_id: str) -> dict[str, Any]:
    """Ren beräkning av trust_gap-dokumentet (ingen skrivning)."""
    if not fs.client_doc(client_id).get().exists:
        raise KeyError(f"client not found: {client_id}")

    claims = list(iter_culture_claims(client_id))
    perceived_all = _read_perceived(client_id)
    engine_bias = engine_baselines.biases(engine_baselines.load(client_id))
    prior = _read_prior_snapshot(client_id)
    prior_dims = (prior or {}).get("dimensions") or {}
    prior_date = (prior or {}).get("date")

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
                # credibility_gap mot per-motor-kalibrerad valens (Fas 2.2). Rå valens
                # bevaras i perceived; calibrated lyfts in synligt när den skiljer sig.
                cal = _calibrated_valence(valence, perceived.get("by_engine") or {}, engine_bias)
                if cal != round(valence, 3):
                    perceived["valence_calibrated"] = cal
                entry["credibility_gap"] = round(cal - evidence, 3)
        else:
            # Låg/ingen salience: "ännu inte synlig" — räkna ej valens/gap på tomhet (§8 steg 5).
            entry["perceived"] = {"status": "not_visible", **(perceived or {})}

        prior_entry = prior_dims.get(d)
        if prior_entry and prior_date:
            prior_entry = {**prior_entry, "_snapshot_date": prior_date}
        flags.extend(_detect_flags(d, entry, prior_entry, engine_bias))

        dimensions[d] = entry

    overall = sum(hc.DIMENSION_WEIGHTS[d] * dimensions[d]["score"] for d in hc.DIMENSIONS)
    doc: dict[str, Any] = {
        "computed_at": _now_iso(),
        "overall_score": round(overall, 3),
        "coverage": {"declared": declared_cov, "demonstrated": demonstrated_cov, "of": len(hc.DIMENSIONS)},
        "dimensions": dimensions,
        "flags": flags,
    }
    doc["inputs_hash"] = _inputs_hash(claims, perceived_all, prior_date)
    return doc


def run(client_id: str) -> dict[str, Any]:
    """Beräkna och skriv trust_gap (överskriv). Hoppar över om inputs oförändrade."""
    with record_run("compute_trust_gap", client_id) as r:
        doc = compute(client_id)
        existing = fs.trust_gap_doc(client_id).get()
        if getattr(existing, "exists", False) and (existing.to_dict() or {}).get("inputs_hash") == doc["inputs_hash"]:
            log.info("trust_gap oförändrad för %s — hoppar över", client_id)
            r.summary = {"skipped": True}
            return {"client_id": client_id, "skipped": True}
        fs.trust_gap_doc(client_id).set(doc)
        log.info("trust_gap skriven för %s: overall=%.3f", client_id, doc["overall_score"])

        # Sluten-loop-mätning (Fas 1.4): verifiera öppna interventioner mot ny
        # trust_gap. Sen-import — interventions importerar tillbaka recipes och
        # vi vill inte ha trust_gap-jobbet i den cirkeln på modulnivå.
        intervention_summary: dict[str, Any] = {}
        try:
            from services import interventions
            intervention_summary = interventions.verify_open(client_id)
        except Exception as exc:  # noqa: BLE001 — verifiering får aldrig stoppa skriv-pathen
            log.warning("intervention-verifiering misslyckades för %s: %s", client_id, exc)

        r.summary = {
            "overall_score": doc["overall_score"],
            "interventions": intervention_summary,
        }
        return {
            "client_id": client_id, "written": True,
            "overall_score": doc["overall_score"], "coverage": doc["coverage"],
            "interventions": intervention_summary,
        }


def run_all() -> None:
    """Fan-out över alla kunder (schemalagt golv; change-agenten i compile_schema täcker
    annars per kund)."""
    count = 0
    for client_id, _ in fs.iter_clients():
        try:
            run(client_id)
            count += 1
        except Exception as exc:  # noqa: BLE001
            log.exception("compute_trust_gap misslyckades för %s: %s", client_id, exc)
    log.info("compute_trust_gap kördes för %d kunder", count)


if __name__ == "__main__":
    import argparse

    logging.basicConfig(level=logging.INFO)
    parser = argparse.ArgumentParser()
    parser.add_argument("--client-id", default=None, help="enskild kund (default: alla)")
    args = parser.parse_args()
    if args.client_id:
        run(args.client_id)
    else:
        run_all()
