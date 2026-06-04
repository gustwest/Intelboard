"""Värme-riktade probes — mäter hur AI-motorerna UPPFATTAR ett bolag per (persona × dimension).

Designregler (§8): neutrala/öppna frågor + en balanserad NEGATIV-probe per dimension (så
valensen inte blir ett artefakt av frågeställningen) + en ankar-/kontrollfråga per körning
(driftdetektering). En domar-modell läser motorns svar och returnerar TVÅ axlar — salience
(hur mycket grundad kunskap) och valence (hur positiv DÅ den uttalar sig) — plus confidence.

**Persona-axel (Fas 2.1c, docs/persona-model.md):** Sedan persona-modellen införts
körs probarna PER aktiv persona × dimension. Probe-templates kommer från
services/persona_registry — där har varje persona handskrivna frågor som
fångar persona-autentisk perspektiv (employee frågar inte om wellbeing som en
customer eller en investor gör).

Cost-modell: aktiv-cap är 5 personor (services/persona_registry.MAX_ACTIVE_PERSONAS_PER_CLIENT).
5 personor × 6 dimensioner × 2 frågor × N motorer = persona-anrop per körning. Fas 1.6:s
cost_budget-enforcement biter om kund överskrider sin tier (Bas/Pro/Enterprise).

VIKTIGT: "ingen information" = LÅG salience, INTE låg valence. Perception påverkar aldrig
poängen (compute_trust_gap §8) — den används bara till gap-analys, grindad av salience/konfidens.

Mätta motorer = första-parts US, publik payload (EU-beslut). Domaren får köras via Vertex EU
(den läser publik text). Resultatet skrivs till polling_results/warmth-latest med BÅDE
toppnivå-aggregat (bakåtkompat för compute_trust_gap) OCH per_persona-axel (driver
persona_mismatch-flaggan i Fas 2.1d).
"""
from __future__ import annotations

import logging
import statistics
from datetime import datetime, timezone
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage

import firestore_client as fs
from config import settings  # noqa: F401  (paritet med polling; reserverat)
from schema_org import humanization_config as hc
from services import llm as llm_factory
from services import persona_derivation
from services import persona_registry

log = logging.getLogger(__name__)

PROMPT_VERSION = "v2-persona"   # v1 = pre-persona-templates; v2 = persona-axel via registry
_SALIENCE_MIN_FOR_VALENCE = 0.1  # motor som inget vet bidrar ej till valens-snittet
# Ankare: känt, stabilt faktum. Driver svaret mellan körningar → motorn/förhållandena
# har skiftat → körningen kan flaggas som ojämförbar (skyddar trenden).
ANCHOR_QUESTION = "I vilket land har {company} sitt huvudkontor?"

_JUDGE_SYSTEM = (
    "Du läser vad en AI-motor svarat om ett bolag på EN dimension. Returnera ENDAST JSON: "
    '{"salience": <0-1>, "valence": <0-1>, "confidence": <0-1>}. '
    "salience = hur mycket KONKRET, grundad kunskap svaret visar (0 = 'ingen information', "
    "1 = detaljerat/specifikt). valence = hur POSITIV bilden är NÄR motorn uttalar sig "
    "(0 = mycket negativ, 0.5 = neutral, 1 = mycket positiv). confidence = din säkerhet. "
    "VIKTIGT: 'jag har ingen information' = LÅG salience, INTE låg valence."
)


def _ask(question: str, llm: Any) -> str:
    msg = [
        SystemMessage(content="Du är en sakkunnig svensk analytiker. Svara koncist och konkret."),
        HumanMessage(content=question),
    ]
    resp = llm.invoke(msg)
    return (resp.content or "").strip() if hasattr(resp, "content") else str(resp).strip()


def _judge_verdict(judge: Any, company: str, dimension: str, answers: list[str]) -> dict[str, float] | None:
    """Domar-modellen → {salience, valence, confidence} för en dimensions svar. None vid fel."""
    payload = {"företag": company, "dimension": dimension, "motorns_svar": answers}
    import json

    data = llm_factory.invoke_json(judge, _JUDGE_SYSTEM, json.dumps(payload, ensure_ascii=False))
    if not data:
        return None
    try:
        return {
            "salience": _clamp(data.get("salience")),
            "valence": _clamp(data.get("valence")),
            "confidence": _clamp(data.get("confidence")),
        }
    except (TypeError, ValueError):
        return None


def _clamp(v: Any) -> float:
    return max(0.0, min(1.0, float(v)))


def _aggregate_by_engine(by_engine_for_dim: dict[str, dict | None]) -> dict[str, Any]:
    """Aggregera över motorer för EN dimension (eller en persona × dimension).

    Returnerar samma shape som gamla `_aggregate` per dim — {salience, valence,
    confidence, by_engine, n_samples}. Återanvänds både för persona-nivå och
    toppnivå-aggregat så vi har konsekvent matematik."""
    per = {e: v for e, v in by_engine_for_dim.items() if v}
    sals = [x["salience"] for x in per.values() if x.get("salience") is not None]
    salience = round(statistics.fmean(sals), 3) if sals else 0.0
    vals = [
        x["valence"] for x in per.values()
        if x.get("salience", 0) >= _SALIENCE_MIN_FOR_VALENCE and x.get("valence") is not None
    ]
    valence = round(statistics.fmean(vals), 3) if vals else None
    confs = [x["confidence"] for x in per.values() if x.get("confidence") is not None]
    base_conf = statistics.fmean(confs) if confs else 0.0
    agreement = 1.0 - statistics.pstdev(vals) if len(vals) > 1 else 1.0
    confidence = round(base_conf * salience * max(0.0, agreement), 3)
    return {
        "salience": salience,
        "valence": valence,
        "confidence": confidence,
        "n_samples": len(per),
        "by_engine": dict(per),
    }


def _aggregate_with_personas(
    by_engine_persona: dict[str, dict[str, dict[str, dict | None]]],
) -> dict[str, Any]:
    """Per dimension: bygg per_persona-axel + toppnivå-aggregat (bakåtkompat).

    Input-shape: by_engine_persona[engine][persona_id][dimension] = verdict | None.

    Output per dimension:
      {
        # Toppnivå — bakåtkompat med compute_trust_gap som ännu inte vet om personor.
        # Aggregat över ALLA aktiva personor (alla deras motor-verdicts pooltas ihop).
        "salience": ..., "valence": ..., "confidence": ..., "n_samples": ...,
        "by_engine": {engine: aggregated_verdict_across_personas},
        # NY: per persona, för persona_mismatch-detektion i Fas 2.1d
        "per_persona": {
          persona_id: {salience, valence, confidence, by_engine, n_samples}
        }
      }
    """
    dims: dict[str, Any] = {}
    all_persona_ids: set[str] = set()
    for by_persona in by_engine_persona.values():
        all_persona_ids.update(by_persona.keys())

    for d in hc.DIMENSIONS:
        # 1) Per-persona-aggregat: för varje persona, plocka alla engines verdicts på
        # denna dim och aggregera över engines.
        per_persona: dict[str, Any] = {}
        for pid in all_persona_ids:
            verdicts_by_engine: dict[str, dict | None] = {}
            for ename, by_persona in by_engine_persona.items():
                verdicts_by_engine[ename] = (by_persona.get(pid) or {}).get(d)
            if not any(verdicts_by_engine.values()):
                continue  # ingen motor svarade för denna persona × dim
            per_persona[pid] = _aggregate_by_engine(verdicts_by_engine)

        # 2) Toppnivå-aggregat: pool ALLA (engine, persona)-verdicts för dimensionen.
        # by_engine på toppnivå = för varje engine, snitt över alla personor som svarade.
        pooled_by_engine: dict[str, list[dict]] = {}
        for ename, by_persona in by_engine_persona.items():
            for pid, by_dim in by_persona.items():
                v = by_dim.get(d)
                if v:
                    pooled_by_engine.setdefault(ename, []).append(v)
        engine_aggregates: dict[str, dict] = {}
        for ename, verdicts in pooled_by_engine.items():
            # Snitt över personor per motor — så engine-axeln på toppnivå motsvarar
            # "vad denna motor TYCKER i snitt över alla personor som spårar denna kund".
            sals = [v["salience"] for v in verdicts if v.get("salience") is not None]
            vals = [v["valence"] for v in verdicts
                    if v.get("salience", 0) >= _SALIENCE_MIN_FOR_VALENCE
                    and v.get("valence") is not None]
            confs = [v["confidence"] for v in verdicts if v.get("confidence") is not None]
            engine_aggregates[ename] = {
                "salience": round(statistics.fmean(sals), 3) if sals else 0.0,
                "valence": round(statistics.fmean(vals), 3) if vals else None,
                "confidence": round(statistics.fmean(confs), 3) if confs else 0.0,
            }
        top = _aggregate_by_engine(engine_aggregates)
        top["per_persona"] = per_persona
        dims[d] = top

    return dims


def run_for_client(
    client_id: str, engines: dict[str, Any] | None = None, judge: Any | None = None
) -> dict[str, Any] | None:
    """Kör värme-probarna per (aktiv persona × dimension × motor), döm svaren,
    skriv polling_results/warmth-latest med per_persona-axel + bakåtkompat-aggregat.

    No-op (None) om kund saknas eller inga motorer/domare finns (engines/judge
    injicerbara för test). Aktiva personor hämtas från clients/{id}.personas;
    default = customer/employee/investor om kunden inte konfigurerat något.
    """
    snap = fs.client_doc(client_id).get()
    if not snap.exists:
        log.warning("warmth-probes: klient %s saknas", client_id)
        return None
    company = (snap.to_dict() or {}).get("company_name") or client_id

    engines = engines if engines is not None else llm_factory.make_probe_engines()
    if not engines:
        log.warning("inga probe-motorer konfigurerade — värme-probes hoppas över för %s", client_id)
        return None
    judge = judge if judge is not None else llm_factory.make_validator()
    if judge is None:
        log.warning("ingen domar-modell — värme-probes hoppas över för %s", client_id)
        return None

    active_persona_ids = persona_derivation.get_active_personas(client_id)
    active_personas = [persona_registry.get(pid) for pid in active_persona_ids]
    log.info(
        "värme-probes för %s: %d motorer × %d personor × %d dim × 2 frågor = %d anrop",
        client_id, len(engines), len(active_personas), len(hc.DIMENSIONS),
        len(engines) * len(active_personas) * len(hc.DIMENSIONS) * 2,
    )

    # by_engine_persona[engine][persona_id][dim] = verdict | None
    by_engine_persona: dict[str, dict[str, dict[str, dict | None]]] = {}
    anchors: dict[str, str] = {}
    for ename, llm in engines.items():
        # Ankarfråga en gång per motor — persona-oberoende. Driftkontroll.
        try:
            anchors[ename] = _ask(ANCHOR_QUESTION.format(company=company), llm)
        except Exception as exc:  # noqa: BLE001
            log.warning("ankarfråga misslyckades för %s: %s", ename, exc)

        for persona in active_personas:
            for dim, (neutral_q, adversarial_q) in persona.probe_templates.items():
                try:
                    answers = [
                        _ask(neutral_q.format(company=company), llm),
                        _ask(adversarial_q.format(company=company), llm),
                    ]
                    verdict = _judge_verdict(judge, company, dim, answers)
                except Exception as exc:  # noqa: BLE001
                    log.warning("probe %s/%s/%s misslyckades: %s", ename, persona.id, dim, exc)
                    verdict = None
                by_engine_persona.setdefault(ename, {}).setdefault(persona.id, {})[dim] = verdict

    doc = {
        "dimensions": _aggregate_with_personas(by_engine_persona),
        "measurement": {
            "prompt_version": PROMPT_VERSION,
            "captured_at": datetime.now(timezone.utc).isoformat(),
            "engines": sorted(engines.keys()),
            "personas": active_persona_ids,
            "anchors": anchors,  # driftkontroll — jämförs mellan körningar
        },
    }
    fs.polling_results_col(client_id).document(hc.WARMTH_PROBE_DOC).set(doc)
    log.info(
        "värme-probes skrivna för %s (%d motorer × %d personor)",
        client_id, len(engines), len(active_personas),
    )
    return doc
