"""Per-engine perception-baslinjer (Fas 2.2 — per-engine-baselines).

Varje probe-motor har en systematisk leniency: GPT kan ligga 0.05 valens-enheter
rosigare än Gemini på allt. När vi jämför motorer (contradiction) eller räknar
credibility_gap (perceived − evidens) smittar den biasen signalen — en "glad"
motor blåser upp spreads och gap som inte är bolagsspecifika.

Lösning: håll en löpande baslinje per (kund, motor) = motorns EWMA-snitt av valens
över dimensioner (endast salience-kvalificerade verdicts). Bias_e = baseline_e −
panel-snitt (snittet av motorernas baslinjer). I compute_trust_gap centreras biasen
bort innan contradiction-spread och credibility_gap beräknas.

Designprinciper:
- **Mätlagret lagrar RÅTT.** Det här är policy/kalibrering — warmth_probes skriver
  oförändrade mätvärden; baslinjen uppdateras separat (best-effort) efter varje körning.
- **Inga LLM-anrop.** Baslinjen byggs uteslutande ur historiska mätningar.
- **Graceful fallback.** Saknad baslinje eller för få uppdateringar → bias 0.0 →
  exakt nuvarande (okalibrerade) beteende. Bakåtkompatibelt per konstruktion.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from statistics import fmean
from typing import Any

import firestore_client as fs
from schema_org import humanization_config as hc

log = logging.getLogger(__name__)

# Doc-id i polling_results-collectionen (bredvid warmth-latest).
ENGINE_BASELINE_DOC = "engine-baselines"


def _baseline_doc_id(language: str = "sv") -> str:
    """F4b: språk-nyckling. Svenska behåller det ursprungliga doknamnet (bakåtkompat);
    engelska får ett eget dokument så att en motors leniency-baseline byggs SEPARAT per
    språk — annars kalibreras engelsk perception mot svensk baseline (korrupt gap)."""
    return ENGINE_BASELINE_DOC if language == "sv" else f"{ENGINE_BASELINE_DOC}-{language}"

# EWMA-vikt för en ny observation. 0.35 → baslinjen rör sig men domineras inte av
# en enskild brusig körning (≈ effektivt fönster på ~5 körningar).
BASELINE_ALPHA = 0.35
# En motor måste ha valens på minst så här många dimensioner i en körning för att
# körningen ska räknas som en observation (annars är cross-dim-snittet för tunt).
MIN_DIMS_FOR_OBS = 2
# Antal EWMA-uppdateringar innan vi litar på baslinjen nog att applicera bias.
MIN_UPDATES_FOR_BIAS = 2


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def load(client_id: str, language: str = "sv") -> dict[str, Any]:
    """Läs den persisterade baslinje-dokumentet för mätspråket. {} om ingen finns ännu."""
    snap = fs.polling_results_col(client_id).document(_baseline_doc_id(language)).get()
    if not getattr(snap, "exists", False):
        return {}
    return snap.to_dict() or {}


def biases(baselines: dict[str, Any]) -> dict[str, float]:
    """Bias per motor = baseline_e − panel-snitt. Emitteras bara för motorer med
    tillräckligt många uppdateringar; övriga utelämnas (anroparen tolkar som 0.0)."""
    panel = baselines.get("panel_valence_mean")
    engines = baselines.get("engines") or {}
    if panel is None:
        return {}
    out: dict[str, float] = {}
    for engine, stats in engines.items():
        mean = (stats or {}).get("valence_mean")
        if mean is None or int((stats or {}).get("n_updates", 0)) < MIN_UPDATES_FOR_BIAS:
            continue
        out[engine] = round(mean - panel, 4)
    return out


def _observations(dims: dict[str, Any]) -> dict[str, float]:
    """Per motor: cross-dimension-snitt av valens (salience-kvalificerade) för EN körning.
    Endast motorer med ≥ MIN_DIMS_FOR_OBS kvalificerade dimensioner tas med."""
    per_engine_vals: dict[str, list[float]] = {}
    for entry in dims.values():
        by_engine = (entry or {}).get("by_engine") or {}
        for engine, stats in by_engine.items():
            v = (stats or {}).get("valence")
            s = (stats or {}).get("salience", 0.0)
            if v is not None and s >= hc.SALIENCE_FLOOR:
                per_engine_vals.setdefault(engine, []).append(v)
    return {
        engine: fmean(vals)
        for engine, vals in per_engine_vals.items()
        if len(vals) >= MIN_DIMS_FOR_OBS
    }


def update_from_dimensions(client_id: str, dims: dict[str, Any], language: str = "sv") -> dict[str, Any]:
    """EWMA-uppdatera baslinjen från en färsk värme-probe-körnings `dimensions`-map.

    No-op (returnerar befintlig doc) om körningen inte gav någon kvalificerad
    observation. Skrivs till språk-nyckladt baseline-dokument (F4b)."""
    obs = _observations(dims)
    doc = load(client_id, language)
    engines: dict[str, Any] = dict(doc.get("engines") or {})
    if not obs:
        return doc

    for engine, mean_v in obs.items():
        cur = engines.get(engine) or {}
        prev = cur.get("valence_mean")
        n = int(cur.get("n_updates", 0))
        new_mean = mean_v if prev is None else BASELINE_ALPHA * mean_v + (1 - BASELINE_ALPHA) * prev
        engines[engine] = {
            "valence_mean": round(new_mean, 4),
            "n_updates": n + 1,
            "updated_at": _now_iso(),
        }

    means = [e["valence_mean"] for e in engines.values() if e.get("valence_mean") is not None]
    panel = round(fmean(means), 4) if means else None
    new_doc = {"engines": engines, "panel_valence_mean": panel, "updated_at": _now_iso()}
    fs.polling_results_col(client_id).document(_baseline_doc_id(language)).set(new_doc)
    log.info(
        "engine-baselines uppdaterade för %s: %d motorer, panel=%.3f",
        client_id, len(engines), panel if panel is not None else float("nan"),
    )
    return new_doc
