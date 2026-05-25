"""Read-endpoints för Graph-kunder och deras medarbetare."""
from typing import Any

from fastapi import APIRouter, HTTPException

import firestore_client as fs

router = APIRouter(prefix="/api/clients", tags=["clients"])


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
        "last_compiled": _iso(data.get("last_compiled")),
        "employees": employees,
    }


def _iso(value: Any) -> str | None:
    if not value:
        return None
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return str(value)
