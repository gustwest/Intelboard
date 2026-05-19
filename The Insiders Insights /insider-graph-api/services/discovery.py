"""Discovery-agent — onboarding av ny Graph-kund.

Skriver kund + medarbetare till Firestore. Hooks för Bright Data baseline-scrape
finns men görs synkront bara för fåtal noder; större batchar ska köras via
jobs/scrape_active.py istället.
"""
from __future__ import annotations

import csv
import io
import logging
import re
from typing import Iterable

from google.cloud import firestore

import firestore_client as fs
from schemas import EmployeeInput, OnboardRequest, OnboardResponse

log = logging.getLogger(__name__)

VALID_NODE_TYPES = {"aktiv", "episodisk", "passiv"}


def slugify(value: str) -> str:
    value = value.lower().strip()
    value = re.sub(r"[åä]", "a", value)
    value = re.sub(r"[ö]", "o", value)
    value = re.sub(r"[^a-z0-9]+", "-", value).strip("-")
    return value[:80] or "node"


def parse_csv(text: str) -> list[EmployeeInput]:
    """Acceptera CSV med headers: name, linkedin_url, title, node_type, gender."""
    reader = csv.DictReader(io.StringIO(text))
    employees: list[EmployeeInput] = []
    for row in reader:
        name = (row.get("name") or "").strip()
        url = (row.get("linkedin_url") or "").strip()
        if not name or not url:
            continue
        employees.append(
            EmployeeInput(
                name=name,
                linkedin_url=url,
                title=(row.get("title") or "").strip() or None,
                node_type=_coerce_node_type(row.get("node_type")),
                gender=(row.get("gender") or "").strip() or None,
            )
        )
    return employees


def _coerce_node_type(value: str | None) -> str:
    v = (value or "").strip().lower()
    return v if v in VALID_NODE_TYPES else "aktiv"


def onboard_client(req: OnboardRequest) -> OnboardResponse:
    client_ref = fs.client_doc(req.client_id)
    if client_ref.get().exists:
        raise ValueError(f"client already exists: {req.client_id}")

    client_ref.set(
        {
            "company_name": req.company_name,
            "org_number": req.org_number,
            "company_linkedin_url": req.company_linkedin_url,
            "active_connectors": list(req.active_connectors or ["linkedin"]),
            "settings": {
                "fetch_about": True,
                "fetch_life": True,
                "fetch_posts": True,
                "fetch_jobs": True,
            },
            "created_at": firestore.SERVER_TIMESTAMP,
        }
    )

    created_ids = _write_employees(req.client_id, req.employees)
    log.info("onboarded %s with %d employees", req.client_id, len(created_ids))
    return OnboardResponse(
        client_id=req.client_id,
        employees_created=len(created_ids),
        employee_ids=created_ids,
    )


def _write_employees(client_id: str, employees: Iterable[EmployeeInput]) -> list[str]:
    created: list[str] = []
    used: set[str] = set()
    for emp in employees:
        slug = slugify(emp.name)
        unique = slug
        suffix = 2
        while unique in used:
            unique = f"{slug}-{suffix}"
            suffix += 1
        used.add(unique)

        fs.employee_doc(client_id, unique).set(
            {
                "name": emp.name,
                "linkedin_url": emp.linkedin_url,
                "title": emp.title,
                "node_type": emp.node_type,
                "gender": emp.gender,
                "email_ingestion_addr": _episodic_email(client_id, unique) if emp.node_type == "episodisk" else None,
                "created_at": firestore.SERVER_TIMESTAMP,
            }
        )
        created.append(unique)
    return created


def _episodic_email(client_id: str, employee_id: str) -> str:
    return f"{client_id}.{employee_id}@inbox.insidergraph.io"
