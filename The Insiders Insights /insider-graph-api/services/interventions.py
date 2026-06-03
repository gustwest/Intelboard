"""Sluten-loop-mätning av interventioner (Fas 1.4, spec §10 punkt 5).

Det här lagret är vår icke-kopierbara causal-datakälla. När operatören markerar
ett recept som "acted" startar vi en intervention med en *baseline*-snapshot av
trust_gap-dimensionen. Vid varje följande compute_trust_gap jämför vi
nuvarande state mot baseline. När original-gapet är borta → resolved + auto-
verifiera receptet → loopen är stängd, med kausala data på kanal × gap-typ ×
knowledge-source.

En SEO-byrå kan plagiera vår vokabulär. De kan inte plagiera datasetet av
"intervention X stängde gap Y inom Z dagar" — det kräver att hela mätsystemet
körts mot riktiga kunder över tid.

Klassificering är medvetet konservativ:
  * resolved_full     — target_gap_type borta, inga nya dåliga flaggor
  * resolved_partial  — target_gap_type borta, men ny annan flagga (skiftade)
  * regressed         — target_gap_type kvar och magnituden är värre
  * no_change_yet     — target_gap_type kvar, oförändrat (vänta längre)
  * abandoned         — operatören dismissade receptet innan stängning

resolved_full/_partial triggar auto-verifiering av receptet via en sen import
mot services.recipes (cirkulär-skydd; recipes triggar oss via update_status).
"""
from __future__ import annotations

import hashlib
import logging
from datetime import datetime, timezone
from typing import Any, Literal

import firestore_client as fs

log = logging.getLogger(__name__)


InterventionStatus = Literal[
    "open",
    "resolved_full",
    "resolved_partial",
    "regressed",
    "no_change_yet",
    "abandoned",
]

# Resolvade statusar — Fas 1.4 räknar dem som "loopen stängd", recept auto-verifieras.
_RESOLVED_STATUSES: frozenset[str] = frozenset({"resolved_full", "resolved_partial"})

# Magnitud-trösklar för regressionsdetektion. Stridor mot dem = vi väntar.
_REGRESSION_DEMONSTRATED_DROP: float = 0.1
_REGRESSION_VALENCE_DROP: float = 0.1


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def intervention_id(recipe_id: str, acted_at: str) -> str:
    """Deterministisk id: hash av (recipe_id, acted_at). Om operatören acted samma
    recept flera gånger (osannolikt p.g.a. lifecycle-låsen) blir det olika
    intervention-doc — viktigt för spårbarhet."""
    blob = f"{recipe_id}|{acted_at}".encode("utf-8")
    return f"int-{hashlib.sha1(blob).hexdigest()[:12]}"


def _snapshot_dimension(client_id: str, dimension: str) -> dict[str, Any]:
    """Hämta nuvarande dimension-data från trust_gap-doc:et — för baseline + verifiering.

    Tom dict om trust_gap saknas (sällsynt, men då har vi inget att mäta mot).
    """
    snap = fs.trust_gap_doc(client_id).get()
    if not getattr(snap, "exists", False):
        return {}
    tg = snap.to_dict() or {}
    dim = ((tg.get("dimensions") or {}).get(dimension)) or {}
    perceived = dim.get("perceived") or {}
    # Plocka ut flag-typer som rör DENNA dimension (inte alla).
    flag_kinds = [
        f.get("kind") for f in (tg.get("flags") or [])
        if f.get("dimension") == dimension and f.get("kind")
    ]
    visible = perceived.get("status") != "not_visible"
    return {
        "declared": dim.get("declared"),
        "demonstrated": dim.get("demonstrated"),
        "score": dim.get("score"),
        "valence": perceived.get("valence") if visible else None,
        "salience": perceived.get("salience") if visible else None,
        "credibility_gap": dim.get("credibility_gap"),
        "flag_kinds": sorted(flag_kinds),
        "captured_at": _now_iso(),
    }


def create_for_acted_recipe(
    client_id: str, recipe_id: str, *, now: str | None = None,
) -> dict[str, Any] | None:
    """Skapa intervention när ett recept just markerats som acted.

    Anropas från services/recipes.update_status. Snapshot:ar trust_gap-tillståndet
    för dimensionen + plockar recept-metadata. Idempotent: om en intervention för
    samma (recipe_id, acted_at) redan finns hoppar vi över.
    """
    recipe_snap = fs.recipe_doc(client_id, recipe_id).get()
    if not getattr(recipe_snap, "exists", False):
        log.warning("kan inte skapa intervention: recept %s/%s saknas", client_id, recipe_id)
        return None
    recipe = recipe_snap.to_dict() or {}
    if recipe.get("status") != "acted":
        # Skyddsbälte — anroparen är fel.
        log.warning(
            "intervention skapas bara för status=acted; %s/%s är %s",
            client_id, recipe_id, recipe.get("status"),
        )
        return None

    skeleton = recipe.get("skeleton") or {}
    details = recipe.get("details") or {}
    dimension = skeleton.get("dimension")
    gap_type = skeleton.get("gap_type")
    acted_at = recipe.get("acted_at") or now or _now_iso()

    if not dimension or not gap_type:
        log.warning("recept %s/%s saknar dimension/gap_type — ingen intervention", client_id, recipe_id)
        return None

    iid = intervention_id(recipe_id, acted_at)
    iso_now = now or _now_iso()
    existing = fs.intervention_doc(client_id, iid).get()
    if getattr(existing, "exists", False):
        log.info("intervention %s/%s finns redan (idempotent)", client_id, iid)
        return existing.to_dict()

    baseline = _snapshot_dimension(client_id, dimension)
    payload: dict[str, Any] = {
        "intervention_id": iid,
        "client_id": client_id,
        "recipe_id": recipe_id,
        "gap_type": gap_type,
        "dimension": dimension,
        "knowledge_source_target": skeleton.get("knowledge_source_target"),
        "prioritized_channel": details.get("prioritized_channel"),
        "expected_impact_metric": skeleton.get("expected_impact_metric"),
        "baseline": baseline,
        "current": dict(baseline),  # initial = baseline; uppdateras vid verify_open
        "status": "open",
        "closure": None,
        "acted_at": acted_at,
        "created_at": iso_now,
        "updated_at": iso_now,
    }
    fs.intervention_doc(client_id, iid).set(payload)
    log.info("intervention skapad %s/%s (recipe=%s, dimension=%s, gap=%s)",
             client_id, iid, recipe_id, dimension, gap_type)
    return payload


def _classify(
    baseline_flag_kinds: list[str], current_flag_kinds: list[str], target_gap_type: str,
    baseline_demonstrated: float | None, current_demonstrated: float | None,
    baseline_valence: float | None, current_valence: float | None,
) -> InterventionStatus:
    """Avgör nytt status från baseline + current. Pure function, lätt att testa."""
    base = set(baseline_flag_kinds)
    curr = set(current_flag_kinds)
    target_still_present = target_gap_type in curr
    new_bad_flags = curr - base - {target_gap_type}

    if not target_still_present:
        # Gapet är borta — loopen stängd.
        return "resolved_partial" if new_bad_flags else "resolved_full"

    # Target finns kvar — kolla om något har försämrats.
    if baseline_demonstrated is not None and current_demonstrated is not None:
        if current_demonstrated < baseline_demonstrated - _REGRESSION_DEMONSTRATED_DROP:
            return "regressed"
    if baseline_valence is not None and current_valence is not None:
        # Regression i valens beror på gap-typ: opportunity vill ha STIGNING; over_claim
        # vill ha SÄNKNING. Bägge faller är "fel håll" jämfört med baseline.
        if target_gap_type in ("opportunity", "factual_drift"):
            if current_valence < baseline_valence - _REGRESSION_VALENCE_DROP:
                return "regressed"
        elif target_gap_type == "over_claim":
            if current_valence > baseline_valence + _REGRESSION_VALENCE_DROP:
                return "regressed"
    return "no_change_yet"


def verify_open(client_id: str, *, now: str | None = None) -> dict[str, Any]:
    """Gå igenom öppna interventioner, mät deras nuvarande state, uppdatera status.

    Anropas efter compute_trust_gap har skrivit ny trust_gap. Resolvade
    interventioner triggar auto-verifiering av motsvarande recept (sen-import
    mot services.recipes för att undvika cirkulär import på modulnivå).

    Returnerar: {client_id, total_open, resolved_full, resolved_partial,
                 regressed, no_change_yet}
    """
    summary = {
        "client_id": client_id,
        "total_open": 0,
        "resolved_full": 0,
        "resolved_partial": 0,
        "regressed": 0,
        "no_change_yet": 0,
    }
    iso_now = now or _now_iso()

    for iid, data in fs.iter_interventions(client_id):
        if data.get("status") != "open":
            continue
        summary["total_open"] += 1

        dimension = data.get("dimension")
        gap_type = data.get("gap_type")
        if not dimension or not gap_type:
            continue

        current = _snapshot_dimension(client_id, dimension)
        current["measured_at"] = iso_now
        baseline = data.get("baseline") or {}

        new_status = _classify(
            baseline_flag_kinds=baseline.get("flag_kinds") or [],
            current_flag_kinds=current.get("flag_kinds") or [],
            target_gap_type=gap_type,
            baseline_demonstrated=baseline.get("demonstrated"),
            current_demonstrated=current.get("demonstrated"),
            baseline_valence=baseline.get("valence"),
            current_valence=current.get("valence"),
        )

        data["current"] = current
        data["status"] = new_status
        data["updated_at"] = iso_now
        summary[new_status] = summary.get(new_status, 0) + 1

        if new_status in _RESOLVED_STATUSES:
            data["closure"] = _build_closure(baseline, current, iso_now, data.get("acted_at"))
            fs.intervention_doc(client_id, iid).set(data)
            _try_verify_recipe(client_id, data.get("recipe_id"))
        else:
            fs.intervention_doc(client_id, iid).set(data)

    log.info("verify_open %s: %s", client_id, summary)
    return summary


def mark_abandoned(client_id: str, recipe_id: str, *, now: str | None = None) -> int:
    """När operatören dismissar ett recept med öppna interventioner — markera dem abandoned.

    Returnerar antalet uppdaterade interventioner.
    """
    iso_now = now or _now_iso()
    count = 0
    for iid, data in fs.iter_interventions(client_id):
        if data.get("recipe_id") != recipe_id:
            continue
        if data.get("status") != "open":
            continue
        data["status"] = "abandoned"
        data["updated_at"] = iso_now
        fs.intervention_doc(client_id, iid).set(data)
        count += 1
    if count:
        log.info("markerade %d intervention(er) som abandoned för %s/%s", count, client_id, recipe_id)
    return count


def _build_closure(
    baseline: dict[str, Any], current: dict[str, Any], closed_at: str,
    acted_at: str | None,
) -> dict[str, Any]:
    """Sammanfatta vad som faktiskt hände — bevarad för analytics."""
    base_flags = set(baseline.get("flag_kinds") or [])
    curr_flags = set(current.get("flag_kinds") or [])
    days_to_close = None
    if acted_at:
        try:
            t_acted = datetime.fromisoformat(acted_at)
            t_closed = datetime.fromisoformat(closed_at)
            days_to_close = (t_closed - t_acted).days
        except ValueError:
            days_to_close = None
    return {
        "valence_delta": _safe_delta(baseline.get("valence"), current.get("valence")),
        "demonstrated_delta": _safe_delta(baseline.get("demonstrated"), current.get("demonstrated")),
        "flag_kinds_removed": sorted(base_flags - curr_flags),
        "flag_kinds_added": sorted(curr_flags - base_flags),
        "closed_at": closed_at,
        "days_to_close": days_to_close,
    }


def _safe_delta(base: float | None, curr: float | None) -> float | None:
    if base is None or curr is None:
        return None
    return round(curr - base, 3)


def _try_verify_recipe(client_id: str, recipe_id: str | None) -> None:
    """Auto-verifiera receptet när interventionen stängts. Sen-import mot
    services.recipes så vi undviker modulnivå-cirkulär import (recipes
    triggar oss; vi triggar tillbaka)."""
    if not recipe_id:
        return
    from services import recipes  # sen-import — bryt cirkeln
    try:
        recipes.update_status(client_id, recipe_id, "verified",
                              note="Auto-verifierad: intervention stängde gapet")
    except recipes.StatusTransitionError as exc:
        # Receptet kanske redan dismissats av operatören mellan acted och verify.
        log.info("kunde inte auto-verifiera %s/%s: %s", client_id, recipe_id, exc)
    except KeyError as exc:
        log.warning("recept %s/%s saknas vid auto-verify: %s", client_id, recipe_id, exc)
