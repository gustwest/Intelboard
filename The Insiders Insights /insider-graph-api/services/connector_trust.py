"""Per-connector auto-godkänn-tröskel (AR1 d): källtillit som krymper granskningskön.

Ett claim med confidence >= connectorns tröskel auto-inkluderas i stället för att
hamna i needs_review. Default 0.7 (samma som förr); en connector som konsekvent
håller hög output-kvalitet kan sänkas så färre poster behöver granskas manuellt —
minskar inflödet vid roten i stället för att bara klicka snabbare (D4).

Hård golvgräns 0.5 så inget lågsäkert skräp auto-godkänns även om någon sätter 0.
Global config (ett värde per connector, gäller alla kunder) i
ops_config/connector-trust. Connector-id matchar output_quality_shadow._resolve_connector.
"""
from __future__ import annotations

import firestore_client as fs
import ttl_cache

DEFAULT_THRESHOLD = 0.7
FLOOR = 0.5
_DOC_ID = "connector-trust"
_CACHE_KEY = "connector_trust_thresholds"
_CACHE_TTL = 30.0


def _doc():
    return fs.db().collection("ops_config").document(_DOC_ID)


def get_thresholds() -> dict[str, float]:
    """Connector-id → tröskel (rå). TTL-cachad — läses i extraktionens het-väg."""

    def _load() -> dict[str, float]:
        snap = _doc().get()
        raw = (snap.to_dict() or {}).get("thresholds") if snap.exists else None
        out: dict[str, float] = {}
        for k, v in (raw or {}).items():
            try:
                out[str(k)] = float(v)
            except (TypeError, ValueError):
                continue
        return out

    return ttl_cache.cached(_CACHE_KEY, _CACHE_TTL, _load)


def set_thresholds(thresholds: dict[str, float] | None) -> dict[str, float]:
    """Skriv hela kartan (klampad till [FLOOR, 1.0]). None-värde tar bort en override."""
    clean: dict[str, float] = {}
    for k, v in (thresholds or {}).items():
        if v is None:
            continue
        clean[str(k)] = max(FLOOR, min(1.0, float(v)))
    _doc().set({"thresholds": clean})
    ttl_cache.invalidate(_CACHE_KEY)
    return clean


def threshold_for(connector: str | None, thresholds: dict[str, float] | None = None) -> float:
    """Tröskel för en connector, klampad till [FLOOR, 1.0]. Default om ingen override."""
    table = thresholds if thresholds is not None else get_thresholds()
    val = table.get(connector or "", DEFAULT_THRESHOLD)
    return max(FLOOR, min(1.0, val))
