"""Endpoints för Graph-kunder och deras medarbetare.

Läsning (lista/hämta) + skrivning: opt-out per medarbetare, GDPR-radering av
en medarbetare (employee-doc + raw_items + claims som refererar hen) samt
radering av en hel kund (alla subcollections via recursive_delete).
"""
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

import firestore_client as fs

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
        "org_number": data.get("org_number"),
        "active_connectors": data.get("active_connectors", []),
        "cdn_url": data.get("cdn_url"),
        "profile_url": data.get("profile_url"),
        "tier": data.get("tier", "default"),
        "profile_base_url": data.get("profile_base_url"),
        "last_compiled": _iso(data.get("last_compiled")),
        "employees": employees,
    }


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
