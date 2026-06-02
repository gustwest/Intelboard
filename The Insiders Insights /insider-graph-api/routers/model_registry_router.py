"""API-yta för modellregistret + drift-findings.

GET /api/model-registry  → spegelbild av services/model_registry (driver
                            frontend-konstanter och AI-synlighet-fliken).
GET /api/model-drift     → öppna drift-findings från senaste model_drift_scan.

Båda är read-only. Att UPPDATERA registret görs i koden (services/model_registry.py)
— det är medvetet att vi inte exponerar en mutations-yta. Drift-jobbet kör veckovis;
om man vill trigga manuellt: kör Cloud Run Job 'model-drift-scan' eller importera
jobs.model_drift_scan.run() i en notebook.
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter

import firestore_client as fs
from services import model_registry

router = APIRouter(prefix="/api", tags=["model-registry"])


@router.get("/model-registry")
def get_model_registry() -> dict[str, Any]:
    """Hela registret + sammanräkning som UI:t kan färga sin status-row med.
    Under strikt 'alltid senaste'-policy ska `behind_latest` alltid vara 0; varje
    träff är ett bugg-läge att åtgärda i registret."""
    entries = model_registry.as_dicts()
    behind = sum(1 for e in entries if e["model_id"] != e["latest_known"])
    return {
        "entries": entries,
        "summary": {
            "total": len(entries),
            "behind_latest": behind,
        },
    }


@router.get("/model-drift")
def get_model_drift() -> dict[str, Any]:
    """Öppna drift-findings (alla `status: open`). Tom lista ⇒ inget att åtgärda."""
    findings: list[dict[str, Any]] = []
    counts = {"behind_latest": 0, "stale_checked": 0, "unauthorized_hardcode": 0}
    try:
        for _id, doc in fs.iter_model_drift():
            if doc.get("status") != "open":
                continue
            findings.append({
                "id": doc.get("id"),
                "kind": doc.get("kind"),
                "severity": doc.get("severity"),
                "role": doc.get("role"),
                "title": doc.get("title"),
                "details": doc.get("details"),
                "path": doc.get("path"),
                "model_id": doc.get("model_id"),
                "last_seen_at": _iso(doc.get("last_seen_at")),
            })
            kind = doc.get("kind")
            if kind in counts:
                counts[kind] += 1
    except Exception:  # Firestore kan vara icke-konfigurerat lokalt — UI:t klarar tomt svar
        pass

    findings.sort(key=lambda f: (_SEVERITY_ORDER.get(f["severity"], 99), f["title"] or ""))
    return {
        "findings": findings,
        "total": len(findings),
        "counts": counts,
    }


_SEVERITY_ORDER = {"warning": 0, "info": 1}


@router.get("/model-changes")
def get_model_changes(role: str | None = None, limit: int = 50) -> dict[str, Any]:
    """Modellbyten över tid — driver kalibrerings-brytlinjen i AI-synlighet/polling-
    grafer. jobs/model_drift_scan loggar `event:model_changed` i job_runs varje gång
    en roll byter model_id eller provider; här fan-out:as de senaste för UI:t.

    Filtrera på roll (t.ex. ?role=probe_claude) för att rita brytlinje i en specifik
    tidsserie. Sortering: senast först.
    """
    from google.cloud import firestore as _fs

    limit = max(1, min(limit, 200))
    changes: list[dict[str, Any]] = []
    try:
        q = (
            fs.job_runs_col()
            .where("job_type", "==", "event:model_changed")
            .order_by("started_at", direction=_fs.Query.DESCENDING)
            .limit(limit * 4)  # läs lite extra så role-filtreringen i Python klipps rätt
        )
        for snap in q.stream():
            d = snap.to_dict() or {}
            s = d.get("summary") or {}
            if role is not None and s.get("role") != role:
                continue
            changes.append({
                "id": snap.id,
                "role": s.get("role"),
                "old_model_id": s.get("old_model_id"),
                "new_model_id": s.get("new_model_id"),
                "old_provider": s.get("old_provider"),
                "new_provider": s.get("new_provider"),
                "effective_since": s.get("effective_since"),
                "recorded_at": _iso(d.get("started_at")),
            })
            if len(changes) >= limit:
                break
    except Exception:
        pass

    return {"changes": changes, "total": len(changes)}


def _iso(ts: Any) -> str | None:
    if ts is None:
        return None
    try:
        return ts.isoformat()
    except AttributeError:
        return str(ts)
