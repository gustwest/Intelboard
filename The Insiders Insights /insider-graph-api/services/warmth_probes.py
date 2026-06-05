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
import os
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


def _probe_runs_per_query() -> int:
    """Antal domar-körningar per probe (Fas 2.2a — statistisk signifikans).

    Probe-FRÅGORNA ställs en gång (temp=0 → motorsvaren är nära-deterministiska),
    men DOMAREN körs N gånger på samma svar. Det är i domarens tolkning den
    praktiska variansen sitter — och vi multiplicerar då inte de dyra probe-
    anropen, bara de billigare domar-anropen (respekterar cost-taket, Fas 1.6).

    Default 3. Env PROBE_RUNS_PER_QUERY=1 stänger av kalibreringen (snabbt/billigt
    läge), högre = mer signal. Clampas till [1, 7]."""
    try:
        n = int(os.getenv("PROBE_RUNS_PER_QUERY", "3"))
    except ValueError:
        return 3
    return max(1, min(7, n))
# Canary-suite (Fas 2.2b): kända, stabila fakta vars svar INTE bör ändras mellan
# körningar. Om en motors canary-svar driftar kraftigt → motorn/förhållandena har
# skiftat → körningen flaggas som potentiellt ojämförbar (skyddar trenden, kompletterar
# jobs/model_drift_scan). ANCHOR_QUESTION behålls som alias (bakåtkompat).
CANARY_QUESTIONS: list[str] = [
    "I vilket land har {company} sitt huvudkontor?",
    "Vilken bransch är {company} verksamt inom?",
    "Är {company} ett privat företag, börsnoterat eller offentligt ägt?",
]
ANCHOR_QUESTION = CANARY_QUESTIONS[0]  # bakåtkompat — tester/legacy refererar denna

# Token-overlap under denna tröskel mellan nuvarande och föregående canary-svar
# → drift misstänks för den motorn. 0.3 = svaret har bytt mer än 70% av sina
# meningsbärande ord (konservativt — fångar verklig drift, inte parafrasering).
_CANARY_DRIFT_OVERLAP_MIN = 0.3

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


# --- Canary-drift-detektion (Fas 2.2b) ---------------------------------------


def _read_prior_canaries(client_id: str) -> dict[str, list[str]]:
    """Föregående körnings canary-svar per motor. Tom dict om ingen tidigare körning
    eller om dokumentet saknar canaries (pre-2.2b-data). Best-effort."""
    try:
        snap = fs.polling_results_col(client_id).document(hc.WARMTH_PROBE_DOC).get()
    except Exception:  # noqa: BLE001
        return {}
    if not getattr(snap, "exists", False):
        return {}
    return ((snap.to_dict() or {}).get("measurement") or {}).get("canaries") or {}


def _token_overlap(a: str, b: str) -> float:
    """Jaccard-överlapp på meningsbärande ordmängder (gemener, kortord bort).
    1.0 = identiska ordmängder, 0.0 = inga gemensamma ord. Robust mot ordföljd
    och små formuleringsskillnader — fångar verklig faktaförändring, inte parafras."""
    def toks(s: str) -> set[str]:
        return {w for w in "".join(c.lower() if c.isalnum() else " " for c in s).split() if len(w) > 2}
    ta, tb = toks(a), toks(b)
    if not ta and not tb:
        return 1.0   # båda tomma → ingen förändring
    if not ta or not tb:
        return 0.0   # en blev tom → maximal förändring
    return len(ta & tb) / len(ta | tb)


def _detect_canary_drift(
    current: dict[str, list[str]], prior: dict[str, list[str]],
) -> list[str]:
    """Returnera motorer vars canary-svar driftat sedan förra körningen.

    En motor flaggas om NÅGON av dess canary-frågor har token-overlap under
    tröskeln mot förra körningens svar. Motorer utan tidigare data (ny motor /
    första körningen) flaggas ALDRIG — vi har inget att jämföra mot."""
    drifted: list[str] = []
    for engine, answers in current.items():
        prior_answers = prior.get(engine)
        if not prior_answers:
            continue  # ingen baslinje → kan inte vara drift
        # Jämför parvis upp till min-längden (canary-suiten kan ha ändrats mellan versioner).
        pairs = list(zip(answers, prior_answers))
        if not pairs:
            continue
        worst_overlap = min(_token_overlap(cur, prev) for cur, prev in pairs)
        if worst_overlap < _CANARY_DRIFT_OVERLAP_MIN:
            drifted.append(engine)
    return sorted(drifted)


def _judge_verdict_calibrated(
    judge: Any, company: str, dimension: str, answers: list[str], runs: int,
) -> dict[str, float] | None:
    """Kör domaren `runs` gånger på samma probe-svar → median-verdict + valens-varians.

    Median (inte snitt) som centralvärde — robust mot enstaka domar-utliggare.
    valence_variance = populationsstandardavvikelse av valens över körningarna; det
    är måttet på hur STABIL mätningen är. Hög varians → domaren tolkar svaret olika
    mellan körningar → trust_gap (Fas 2.2c) sänker confidence på ev. flaggor så vi
    inte reser larm på brus. None om alla körningar föll.
    """
    verdicts: list[dict[str, float]] = []
    for _ in range(max(1, runs)):
        v = _judge_verdict(judge, company, dimension, answers)
        if v is not None:
            verdicts.append(v)
    if not verdicts:
        return None
    sals = [v["salience"] for v in verdicts]
    vals = [v["valence"] for v in verdicts]
    confs = [v["confidence"] for v in verdicts]
    return {
        "salience": round(statistics.median(sals), 3),
        "valence": round(statistics.median(vals), 3),
        "confidence": round(statistics.median(confs), 3),
        # Mätstabilitet: spridning i valens över körningarna. 0 = perfekt stabilt.
        "valence_variance": round(statistics.pstdev(vals), 3) if len(vals) > 1 else 0.0,
        "n_runs": len(verdicts),
    }


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
    # Mätstabilitet (Fas 2.2a): kombinera (a) inom-motor run-varians (domarens
    # tolkningsbrus per motor) och (b) mellan-motor spread. Vi tar MAX genomgående,
    # inte snitt — en enskild instabil motor ska inte maskeras av en stabil. 2.2c
    # grindar flaggor mot detta så vi aldrig reser larm på instabil data.
    run_variances = [
        x["valence_variance"] for x in per.values()
        if x.get("valence_variance") is not None
    ]
    within_engine_var = max(run_variances) if run_variances else 0.0
    between_engine_var = statistics.pstdev(vals) if len(vals) > 1 else 0.0
    return {
        "salience": salience,
        "valence": valence,
        "confidence": confidence,
        "n_samples": len(per),
        "by_engine": dict(per),
        # Total mätosäkerhet — max av brus-källorna (konservativt: vi underskattar
        # aldrig instabiliteten genom att medelvärda bort en av dem).
        "valence_variance": round(max(within_engine_var, between_engine_var), 3),
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
    runs = _probe_runs_per_query()
    log.info(
        "värme-probes för %s: %d motorer × %d personor × %d dim × 2 frågor "
        "(× %d domar-körningar) = %d probe-anrop + %d domar-anrop",
        client_id, len(engines), len(active_personas), len(hc.DIMENSIONS), runs,
        len(engines) * len(active_personas) * len(hc.DIMENSIONS) * 2,
        len(engines) * len(active_personas) * len(hc.DIMENSIONS) * runs,
    )

    # Föregående körnings canary-svar (för drift-jämförelse). Tom dict om första körningen.
    prior_canaries = _read_prior_canaries(client_id)

    # by_engine_persona[engine][persona_id][dim] = verdict | None
    by_engine_persona: dict[str, dict[str, dict[str, dict | None]]] = {}
    canaries: dict[str, list[str]] = {}  # engine → lista av canary-svar (samma ordning som CANARY_QUESTIONS)
    for ename, llm in engines.items():
        # Canary-frågor en gång per motor — persona-oberoende. Driftkontroll.
        engine_canaries: list[str] = []
        for q in CANARY_QUESTIONS:
            try:
                engine_canaries.append(_ask(q.format(company=company), llm))
            except Exception as exc:  # noqa: BLE001
                log.warning("canary-fråga misslyckades för %s: %s", ename, exc)
                engine_canaries.append("")
        canaries[ename] = engine_canaries

        for persona in active_personas:
            for dim, (neutral_q, adversarial_q) in persona.probe_templates.items():
                try:
                    answers = [
                        _ask(neutral_q.format(company=company), llm),
                        _ask(adversarial_q.format(company=company), llm),
                    ]
                    verdict = _judge_verdict_calibrated(judge, company, dim, answers, runs)
                except Exception as exc:  # noqa: BLE001
                    log.warning("probe %s/%s/%s misslyckades: %s", ename, persona.id, dim, exc)
                    verdict = None
                by_engine_persona.setdefault(ename, {}).setdefault(persona.id, {})[dim] = verdict

    drift_engines = _detect_canary_drift(canaries, prior_canaries)
    doc = {
        "dimensions": _aggregate_with_personas(by_engine_persona),
        "measurement": {
            "prompt_version": PROMPT_VERSION,
            "captured_at": datetime.now(timezone.utc).isoformat(),
            "engines": sorted(engines.keys()),
            "personas": active_persona_ids,
            # Canary-suite (Fas 2.2b): nuvarande svar + ev. drift-flagga. anchors
            # behålls som alias (första canary-svaret) för bakåtkompat.
            "canaries": canaries,
            "anchors": {e: (v[0] if v else "") for e, v in canaries.items()},
            "drift_suspected": bool(drift_engines),
            "drift_engines": drift_engines,
        },
    }
    if drift_engines:
        log.warning(
            "canary-drift misstänkt för %s — motorer: %s (körningen kan vara ojämförbar)",
            client_id, drift_engines,
        )
    fs.polling_results_col(client_id).document(hc.WARMTH_PROBE_DOC).set(doc)
    log.info(
        "värme-probes skrivna för %s (%d motorer × %d personor)",
        client_id, len(engines), len(active_personas),
    )

    # Per-engine-baslinjer (Fas 2.2): EWMA-uppdatera motorernas leniency-snitt ur
    # den färska (råa) mätningen. Best-effort — får aldrig fälla probe-skrivningen.
    try:
        from services import engine_baselines

        engine_baselines.update_from_dimensions(client_id, doc["dimensions"])
    except Exception as exc:  # noqa: BLE001
        log.warning("engine-baseline-uppdatering misslyckades (icke-fatal) för %s: %s", client_id, exc)

    return doc
