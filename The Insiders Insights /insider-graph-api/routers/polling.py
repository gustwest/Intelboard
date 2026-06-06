"""Polling-resultat — read-endpoints för dashboards.

Aggregat per motor härleds vid läsning från raw_responses (ej lagrat), så att UI:t
kan visa per-motor-trend för befintlig historik utan schemamigration.
"""
import contextvars
import threading
import time
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any, Iterable

from fastapi import APIRouter, HTTPException
from langchain_core.messages import HumanMessage, SystemMessage

import firestore_client as fs
from services import llm as llm_factory

router = APIRouter(prefix="/api/polling", tags=["polling"])

# Engine-health-cache — undviker en LLM-probe per UI-render. 60s är tillräckligt för
# att fånga "trasig sedan en stund" utan att kosta pengar varje pingbacknämarknad.
_HEALTH_CACHE_SEC = 60.0
# 5s var för snålt — Gemini via Vertex svarar ofta på 3-4s vid cold start och
# Anthropic global routing kan svara på 6-7s. 12s ger en ordentlig marginal utan
# att fördröja UI:t orimligt mycket (engine-health är inte i kritisk väg).
_HEALTH_PROBE_TIMEOUT_SEC = 12.0
_health_cache: dict[str, Any] = {"ts": 0.0, "data": None}
_health_lock = threading.Lock()


def _aggregate_per_engine(raw_responses: Iterable[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    """Grupera raw_responses per motor → SoV/sentiment + mention-räknare. Tom dict om data saknas."""
    by_engine: dict[str, dict[str, list[Any]]] = defaultdict(lambda: {"answers": [], "mentions": [], "sentiments": []})
    for r in raw_responses or []:
        model = r.get("model") or "okänd"
        by_engine[model]["answers"].append(r)
        if r.get("mentioned"):
            by_engine[model]["mentions"].append(r)
            if r.get("sentiment") is not None:
                by_engine[model]["sentiments"].append(r["sentiment"])
    out: dict[str, dict[str, Any]] = {}
    for model, buckets in by_engine.items():
        total = len(buckets["answers"])
        mentions = len(buckets["mentions"])
        sents = buckets["sentiments"]
        out[model] = {
            "share_of_voice": (mentions / total) if total else 0.0,
            "sentiment_score": (sum(sents) / len(sents)) if sents else None,
            "answer_count": total,
            "mention_count": mentions,
        }
    return out


# OBS: deklarera engine-health FÖRE /{client_id} så att FastAPI inte tolkar
# "engine-health" som ett client_id. Implementation ligger nedan.
@router.get("/engine-health")
def engine_health(force: bool = False) -> dict[str, Any]:
    """Status för probe-motorerna (live + planerade). Driver "Motor-status"-raden i
    sticky-baren på AI-synlighet. Cachas 60s så frontend kan polla ofta utan kostnad.

    `force=true` kringgår cachen — användbart när användaren vill verifiera ett fix."""
    now = time.time()
    with _health_lock:
        cached = _health_cache["data"]
        if not force and cached is not None and now - _health_cache["ts"] < _HEALTH_CACHE_SEC:
            return cached

        engines = llm_factory.make_probe_engines()
        results: list[dict[str, Any]] = []
        for spec in llm_factory.PROBE_ENGINE_REGISTRY:
            base = {
                "id": spec["id"], "label": spec["label"], "vendor": spec["vendor"],
                "status": spec["status"], "note": spec.get("note"),
            }
            if spec["status"] == "planned":
                results.append({**base, "ok": None, "latency_ms": None, "error": None})
                continue
            llm = engines.get(spec["id"])
            if llm is None:
                results.append({**base, "ok": False, "latency_ms": None, "error": "API-nyckel saknas eller modul-init misslyckades"})
                continue
            probed = _probe_engine(llm)
            results.append({**base, **probed})

        payload = {
            "engines": results,
            "checked_at": datetime.now(timezone.utc).isoformat(),
            "cache_ttl_sec": int(_HEALTH_CACHE_SEC),
        }
        _health_cache["data"] = payload
        _health_cache["ts"] = now
        return payload


def _probe_engine(llm: Any) -> dict[str, Any]:
    """Snabb mini-prob mot en LLM. Returnerar {ok, latency_ms, error}.

    Använder daemon-tråd-pattern (samma som polling) så att en hängd klient inte
    blockerar health-endpointen."""
    state: dict[str, Any] = {"ok": False, "error": None}

    def target() -> None:
        try:
            msg = [
                SystemMessage(content="Returnera bara ordet 'OK'."),
                HumanMessage(content="hej"),
            ]
            resp = llm.invoke(msg)
            text = (resp.content if hasattr(resp, "content") else str(resp)) or ""
            if text.strip():
                state["ok"] = True
            else:
                state["error"] = "Tom respons"
        except BaseException as exc:
            state["error"] = str(exc)[:240]

    t0 = time.time()
    # Propagera anropande context (ContextVars) in i probe-tråden — håller
    # token_meter/cost_budget-bindningen levande om endpointen någonsin körs inom
    # en measure()-kontext. Health-checken körs idag utanför record_run så detta
    # är en no-op-bindning, men billigt och konsekvent med polling/risk_detector.
    ctx = contextvars.copy_context()
    t = threading.Thread(target=ctx.run, args=(target,), daemon=True, name="engine-probe")
    t.start()
    t.join(_HEALTH_PROBE_TIMEOUT_SEC)
    latency_ms = int((time.time() - t0) * 1000)
    if t.is_alive():
        return {"ok": False, "latency_ms": latency_ms, "error": f"Timeout efter {_HEALTH_PROBE_TIMEOUT_SEC}s"}
    return {"ok": state["ok"], "latency_ms": latency_ms, "error": state["error"]}


@router.get("/{client_id}")
def list_results(client_id: str, limit: int = 12) -> dict[str, Any]:
    if not fs.client_doc(client_id).get().exists:
        raise HTTPException(404, f"client not found: {client_id}")

    weeks = []
    for snap in fs.polling_results_col(client_id).stream():
        data = snap.to_dict() or {}
        weeks.append(
            {
                "week_id": snap.id,
                "share_of_voice": data.get("share_of_voice"),
                "sov_se": data.get("sov_se"),
                "sov_ci95": data.get("sov_ci95"),
                "runs_per_query": data.get("runs_per_query"),
                "sentiment_score": data.get("sentiment_score"),
                "parity_index": data.get("parity_index"),
                "category_results": data.get("category_results"),
                "category_competitors": data.get("category_competitors") or {},
                "total_answers": data.get("total_answers"),
                "answers_with_mention": data.get("answers_with_mention"),
                "models_used": data.get("models_used"),
                "per_engine": _aggregate_per_engine(data.get("raw_responses") or []),
            }
        )
    weeks.sort(key=lambda w: w["week_id"], reverse=True)
    return {"client_id": client_id, "weeks": weeks[:limit]}


@router.get("/{client_id}/questions")
def get_polling_questions(client_id: str) -> dict[str, Any]:
    """De resolved polling-frågorna för en kund — custom (från client.polling_questions)
    ELLER default-templates med industry/topic/service_area-substitutions ifyllda.
    Driver Polling-frågor-panelen i AI-synlighet för transparens."""
    snap = fs.client_doc(client_id).get()
    if not snap.exists:
        raise HTTPException(404, f"client not found: {client_id}")
    client = snap.to_dict() or {}
    from services.polling import resolve_polling_questions
    resolved = resolve_polling_questions(client)
    return {"client_id": client_id, **resolved}


@router.get("/{client_id}/{week_id}/raw")
def get_raw_responses(client_id: str, week_id: str) -> dict[str, Any]:
    snap = fs.polling_results_col(client_id).document(week_id).get()
    if not snap.exists:
        raise HTTPException(404, "polling result not found")
    data = snap.to_dict() or {}
    return {
        "client_id": client_id,
        "week_id": week_id,
        "raw_responses": data.get("raw_responses", []),
    }
