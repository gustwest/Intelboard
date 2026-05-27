"""Värme-riktade probes — mäter hur AI-motorerna UPPFATTAR ett bolag per dimension (spec §8).

Designregler (§8): neutrala/öppna frågor + en balanserad NEGATIV-probe per dimension (så
valensen inte blir ett artefakt av frågeställningen) + en ankar-/kontrollfråga per körning
(driftdetektering). En domar-modell läser motorns svar och returnerar TVÅ axlar — salience
(hur mycket grundad kunskap) och valence (hur positiv DÅ den uttalar sig) — plus confidence.

VIKTIGT: "ingen information" = LÅG salience, INTE låg valence. Perception påverkar aldrig
poängen (compute_trust_gap §8) — den används bara till gap-analys, grindad av salience/konfidens.

Mätta motorer = första-parts US, publik payload (EU-beslut). Domaren får köras via Vertex EU
(den läser publik text). Resultatet skrivs till polling_results/warmth-latest.
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

log = logging.getLogger(__name__)

PROMPT_VERSION = "v1"
_SALIENCE_MIN_FOR_VALENCE = 0.1  # motor som inget vet bidrar ej till valens-snittet

# Neutrala/öppna + balanserad negativ-probe per dimension. {company} fylls i.
WARMTH_PROBES: dict[str, list[str]] = {
    "inclusion": [
        "Vad är känt om hur {company} arbetar med mångfald och inkludering?",
        "Vilken kritik finns mot {company} när det gäller mångfald och inkludering?",
    ],
    "wellbeing": [
        "Vad är känt om hur {company} behandlar sina anställda och deras välmående?",
        "Vilken kritik finns mot {company} som arbetsgivare?",
    ],
    "transparency": [
        "Vad är känt om {company}s öppenhet kring villkor, löner och kollektivavtal?",
        "Finns det kritik mot {company} kring transparens eller villkor?",
    ],
    "ethics": [
        "Vad är känt om {company}s etik, styrning och uppförande?",
        "Vilken kritik finns mot {company} kring etik eller styrning?",
    ],
    "development": [
        "Vad är känt om hur {company} stöttar anställdas lärande och utveckling?",
        "Finns det kritik mot {company}s utvecklingsmöjligheter?",
    ],
    "community": [
        "Vad är känt om {company}s samhällsengagemang?",
        "Finns det kritik mot {company}s roll i samhället?",
    ],
}
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


def _aggregate(by_engine: dict[str, dict[str, dict | None]]) -> dict[str, Any]:
    """Per dimension: salience = motorsnitt; valence = snitt över motorer som FAKTISKT vet
    något; confidence = domarkonfidens × salience × motor-samstämmighet."""
    dims: dict[str, Any] = {}
    for d in hc.DIMENSIONS:
        per = {e: v[d] for e, v in by_engine.items() if v.get(d)}
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
        dims[d] = {
            "salience": salience,
            "valence": valence,
            "confidence": confidence,
            "n_samples": len(per),
            "by_engine": {e: per[e] for e in per},
        }
    return dims


def run_for_client(
    client_id: str, engines: dict[str, Any] | None = None, judge: Any | None = None
) -> dict[str, Any] | None:
    """Kör värme-probarna mot motorerna, döm svaren, skriv polling_results/warmth-latest.
    No-op (None) om kund saknas eller inga motorer/domare finns (engines/judge injicerbara för test)."""
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

    by_engine: dict[str, dict[str, dict | None]] = {}
    anchors: dict[str, str] = {}
    for ename, llm in engines.items():
        try:
            anchors[ename] = _ask(ANCHOR_QUESTION.format(company=company), llm)
        except Exception as exc:  # noqa: BLE001
            log.warning("ankarfråga misslyckades för %s: %s", ename, exc)
        for dim, questions in WARMTH_PROBES.items():
            try:
                answers = [_ask(q.format(company=company), llm) for q in questions]
                by_engine.setdefault(ename, {})[dim] = _judge_verdict(judge, company, dim, answers)
            except Exception as exc:  # noqa: BLE001
                log.warning("probe %s/%s misslyckades: %s", ename, dim, exc)
                by_engine.setdefault(ename, {})[dim] = None

    doc = {
        "dimensions": _aggregate(by_engine),
        "measurement": {
            "prompt_version": PROMPT_VERSION,
            "captured_at": datetime.now(timezone.utc).isoformat(),
            "engines": sorted(engines.keys()),
            "anchors": anchors,  # driftkontroll — jämförs mellan körningar
        },
    }
    fs.polling_results_col(client_id).document(hc.WARMTH_PROBE_DOC).set(doc)
    log.info("värme-probes skrivna för %s (%d motorer)", client_id, len(engines))
    return doc
