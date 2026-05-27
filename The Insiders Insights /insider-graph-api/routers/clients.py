"""Endpoints för Graph-kunder och deras medarbetare.

Läsning (lista/hämta) + skrivning: opt-out per medarbetare, GDPR-radering av
en medarbetare (employee-doc + raw_items + claims som refererar hen) samt
radering av en hel kund (alla subcollections via recursive_delete).
"""
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

import firestore_client as fs
import ttl_cache
from routers.inbox import _count_client  # samma "väntar på människa"-räkning som inkorgen

router = APIRouter(prefix="/api/clients", tags=["clients"])


class EmployeePatch(BaseModel):
    opted_out: bool | None = None


@router.get("")
def list_clients() -> dict[str, Any]:
    clients = []
    for client_id, data in fs.iter_clients():
        employee_count = 0
        node_types = {"aktiv": 0, "episodisk": 0, "passiv": 0}
        for _, emp in fs.iter_employees(client_id):
            employee_count += 1
            nt = emp.get("node_type") or "aktiv"
            if nt in node_types:
                node_types[nt] += 1
        clients.append(
            {
                "client_id": client_id,
                "company_name": data.get("company_name"),
                "company_linkedin_url": data.get("company_linkedin_url"),
                "active_connectors": data.get("active_connectors", []),
                "employee_count": employee_count,
                "node_types": node_types,
                "tier": data.get("tier", "default"),
                "cdn_url": data.get("cdn_url"),
                "profile_url": data.get("profile_url"),
                "last_compiled": _iso(data.get("last_compiled")),
                "created_at": _iso(data.get("created_at")),
            }
        )
    clients.sort(key=lambda c: c.get("created_at") or "", reverse=True)
    return {"clients": clients}


@router.get("/{client_id}")
def get_client(client_id: str) -> dict[str, Any]:
    snap = fs.client_doc(client_id).get()
    if not snap.exists:
        raise HTTPException(404, f"client not found: {client_id}")
    data = snap.to_dict() or {}

    employees = []
    for emp_id, emp in fs.iter_employees(client_id):
        employees.append(
            {
                "employee_id": emp_id,
                "name": emp.get("name"),
                "title": emp.get("title"),
                "linkedin_url": emp.get("linkedin_url"),
                "node_type": emp.get("node_type"),
                "gender": emp.get("gender"),
                "opted_out": bool(emp.get("opted_out")),
                "email_ingestion_addr": emp.get("email_ingestion_addr"),
            }
        )
    employees.sort(key=lambda e: e.get("name") or "")

    return {
        "client_id": client_id,
        "company_name": data.get("company_name"),
        "company_linkedin_url": data.get("company_linkedin_url"),
        "active_connectors": data.get("active_connectors", []),
        "cdn_url": data.get("cdn_url"),
        "profile_url": data.get("profile_url"),
        "tier": data.get("tier", "default"),
        "profile_base_url": data.get("profile_base_url"),
        "last_compiled": _iso(data.get("last_compiled")),
        "employees": employees,
    }


@router.get("/{client_id}/pipeline")
def get_pipeline(client_id: str) -> dict[str, Any]:
    """Kundens läge i pipelinen, steg för steg, ur befintlig data.

    Driver pipeline-stegen i UI:t (kunddetalj + kundlista). Tillstånd per steg:
    done (klart), attention (kräver en människa) eller todo (ej påbörjat).
    Resultatet cachas kort (tungt anrop som väver ihop flera collections).
    """
    if not fs.client_doc(client_id).get().exists:
        raise HTTPException(404, f"client not found: {client_id}")
    return ttl_cache.cached(f"pipeline:{client_id}", 20, lambda: _build_pipeline(client_id))


def _build_pipeline(client_id: str) -> dict[str, Any]:
    data = fs.client_doc(client_id).get().to_dict() or {}
    connectors = data.get("active_connectors", [])
    counts = _count_client(client_id, data)
    pending = sum(counts.values())
    last_compiled = data.get("last_compiled")
    cdn_url = data.get("cdn_url")
    polling_week = _latest_polling_week(client_id)
    raw_count = _raw_count(client_id)
    run_at = _latest_run_times(client_id)

    # Data-steget: senaste av de datahämtande jobben.
    data_at = _max_iso(run_at.get(j) for j in ("scrape_active", "scrape_website", "scrape_episodic", "xml_sync"))
    has_data = raw_count is None and _has_any_raw(client_id) or bool(raw_count)

    steps = [
        {"key": "onboarded", "label": "Onboardad", "state": "done", "at": _iso(data.get("created_at")), "detail": None},
        {
            "key": "connectors",
            "label": "Connectors",
            "state": "done" if connectors else "todo",
            "detail": f"{len(connectors)} aktiva" if connectors else "Inga valda",
            "at": None,
        },
        {
            "key": "data",
            "label": "Data inkommen",
            "state": "done" if has_data else "todo",
            "detail": f"{raw_count} källposter" if raw_count else None,
            "at": data_at,
        },
        {
            "key": "review",
            "label": "Granskad",
            "state": "attention" if pending else "done",
            "detail": f"{pending} att granska" if pending else "Inget väntar",
            "at": None,
        },
        {
            "key": "compiled",
            "label": "Kompilerad",
            "state": "done" if last_compiled else "todo",
            "detail": None,
            "at": _iso(last_compiled) or run_at.get("compile_schema"),
        },
        {
            "key": "delivered",
            "label": "Levererad",
            "state": "done" if cdn_url else "todo",
            "detail": "CDN live" if cdn_url else None,
            "at": None,
        },
        {
            "key": "polling",
            "label": "AI-synlighet",
            "state": "done" if polling_week else "todo",
            "detail": polling_week or "Ej mätt",
            "at": run_at.get("polling"),
        },
    ]
    next_action = next((s["label"] for s in steps if s["state"] in ("attention", "todo")), None)
    return {"client_id": client_id, "steps": steps, "next_action": next_action, "pending": pending}


def _has_any_raw(client_id: str) -> bool:
    """Har någon data hämtats in (bolagsnivå eller per medarbetare)?"""
    for _ in fs.raw_items_company_col(client_id).limit(1).stream():
        return True
    for emp_id, _ in fs.iter_employees(client_id):
        for _ in fs.raw_items_col(client_id, emp_id).limit(1).stream():
            return True
    return False


def _raw_count(client_id: str) -> int | None:
    """Antal insamlade källposter (bolag + medarbetare) via count-aggregering.
    None om aggregeringen inte stöds → anroparen faller tillbaka till presence."""
    try:
        total = fs.raw_items_company_col(client_id).count().get()[0][0].value
        for emp_id, _ in fs.iter_employees(client_id):
            total += fs.raw_items_col(client_id, emp_id).count().get()[0][0].value
        return int(total)
    except Exception:  # noqa: BLE001
        return None


def _latest_run_times(client_id: str) -> dict[str, str | None]:
    """job_type → senaste körningens start (iso) för kunden, ur job_runs."""
    latest: dict[str, Any] = {}
    try:
        for snap in fs.job_runs_col().where("client_id", "==", client_id).stream():
            d = snap.to_dict() or {}
            jt, st = d.get("job_type"), d.get("started_at")
            if not jt or st is None:
                continue
            if jt not in latest or st > latest[jt]:
                latest[jt] = st
    except Exception:  # noqa: BLE001
        return {}
    return {k: _iso(v) for k, v in latest.items()}


def _max_iso(values) -> str | None:
    present = [v for v in values if v]
    return max(present) if present else None


def _latest_polling_week(client_id: str) -> str | None:
    """Senaste vecko-id i polling_results (hoppar över warmth-probe-dokumentet)."""
    weeks = [doc.id for doc in fs.polling_results_col(client_id).stream() if "warmth" not in doc.id]
    return max(weeks) if weeks else None


@router.patch("/{client_id}/employees/{employee_id}")
def patch_employee(client_id: str, employee_id: str, payload: EmployeePatch) -> dict[str, Any]:
    """Uppdatera en medarbetare. Idag: opt-out-toggle.

    opt-out stoppar bara framtida hämtning (scrape-jobben hoppar över hen) —
    redan insamlad data ligger kvar tills den raderas explicit.
    """
    ref = fs.employee_doc(client_id, employee_id)
    if not ref.get().exists:
        raise HTTPException(404, f"employee not found: {employee_id}")
    update: dict[str, Any] = {}
    if payload.opted_out is not None:
        update["opted_out"] = payload.opted_out
    if update:
        ref.update(update)
    return {"status": "ok", "employee_id": employee_id, **update}


@router.delete("/{client_id}/employees/{employee_id}")
def delete_employee(client_id: str, employee_id: str) -> dict[str, Any]:
    """Radera all data om en medarbetare (GDPR).

    1. employee-dokument + raw_items-subcollection (recursive_delete)
    2. claims där personen är subjekt (subject_ref == employee_id) → raderas
    3. claims som citerar personen som källa → källan dras bort; blir claimet
       källlöst raderas det (spec: ett claim utan källa skrivs aldrig).
    """
    ref = fs.employee_doc(client_id, employee_id)
    if not ref.get().exists:
        raise HTTPException(404, f"employee not found: {employee_id}")

    claims_removed, sources_pruned = _purge_employee_from_claims(client_id, employee_id)
    fs.db().recursive_delete(ref)
    return {
        "status": "deleted",
        "employee_id": employee_id,
        "claims_removed": claims_removed,
        "claim_sources_pruned": sources_pruned,
    }


@router.delete("/{client_id}")
def delete_client(client_id: str) -> dict[str, Any]:
    """Radera en hel kund: alla kopplingar, connectors och data.

    recursive_delete tar client-dokumentet plus samtliga subcollections
    (employees + raw_items, raw_items_company, claims, polling_results).
    """
    ref = fs.client_doc(client_id)
    if not ref.get().exists:
        raise HTTPException(404, f"client not found: {client_id}")
    fs.db().recursive_delete(ref)
    return {"status": "deleted", "client_id": client_id}


def _purge_employee_from_claims(client_id: str, employee_id: str) -> tuple[int, int]:
    """Ta bort spår av en medarbetare ur klientens claims. Returnerar
    (antal raderade claims, antal claims där en källa drogs bort)."""
    claims_removed = 0
    sources_pruned = 0
    for claim_id, data in fs.iter_claims(client_id):
        if data.get("subject_ref") == employee_id:
            fs.claim_doc(client_id, claim_id).delete()
            claims_removed += 1
            continue
        sources = data.get("source") or []
        kept = [s for s in sources if s.get("employee_id") != employee_id]
        if len(kept) == len(sources):
            continue
        if not kept:
            fs.claim_doc(client_id, claim_id).delete()
            claims_removed += 1
        else:
            fs.claim_doc(client_id, claim_id).update({"source": kept})
            sources_pruned += 1
    return claims_removed, sources_pruned


def _iso(value: Any) -> str | None:
    if not value:
        return None
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return str(value)
