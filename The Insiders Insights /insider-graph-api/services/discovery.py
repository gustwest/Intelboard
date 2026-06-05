"""Discovery-agent — onboarding av ny Graph-kund.

Skriver kund + medarbetare till Firestore. Hooks för Bright Data baseline-scrape
finns men görs synkront bara för fåtal noder; större batchar ska köras via
jobs/scrape_active.py istället.
"""
from __future__ import annotations

import logging
import re
from datetime import datetime, timezone
from typing import Iterable

from google.cloud import firestore

import firestore_client as fs
from schemas import EmployeeInput, OnboardRequest, OnboardResponse

log = logging.getLogger(__name__)


def slugify(value: str) -> str:
    value = value.lower().strip()
    value = re.sub(r"[åä]", "a", value)
    value = re.sub(r"[ö]", "o", value)
    value = re.sub(r"[^a-z0-9]+", "-", value).strip("-")
    return value[:80] or "node"


def onboard_client(req: OnboardRequest) -> OnboardResponse:
    client_ref = fs.client_doc(req.client_id)
    if client_ref.get().exists:
        raise ValueError(f"client already exists: {req.client_id}")

    # premium → profilsidan på kundens domän; annars geogiraph-default (base = None).
    profile_base_url = (req.profile_base_url or "").rstrip("/") or None
    settings: dict = {
        "fetch_about": True,
        "fetch_life": True,
        "fetch_posts": True,
        "fetch_jobs": True,
    }
    if req.website_start_url:
        settings["website"] = {"start_url": req.website_start_url}
    if req.rss_feeds:
        settings["rss_feeds"] = [f.model_dump() for f in req.rss_feeds]
    org_number = _normalize_org_number(req.org_number)
    logo_url = (req.logo_url or "").strip() or None
    now_iso = datetime.now(timezone.utc).isoformat()
    payload: dict = {
        "company_name": req.company_name,
        "lei": req.lei,
        "wikidata_id": (req.wikidata_id or "").strip().upper() or None,
        "org_number": org_number,
        "logo_url": logo_url,
        "company_linkedin_url": req.company_linkedin_url,
        "active_connectors": list(req.active_connectors or ["website"]),
        # Konkurrenter (GEO-riskloop §5.1) — strippa + dedupa; svaga ledtrådar.
        "competitors": [c.strip() for c in (req.competitors or []) if c and c.strip()],
        "tier": req.tier,
        "profile_base_url": profile_base_url,
        "settings": settings,
        "created_at": firestore.SERVER_TIMESTAMP,
    }
    # Provenance — markera ops-input som "manual" vid onboarding så UI:t kan visa
    # "manuellt satt" och auto-enrichment vet att den inte ska skriva över.
    if logo_url:
        payload["logo_url_source"] = "manual"
        payload["logo_url_set_at"] = now_iso
    if org_number:
        payload["org_number_source"] = "manual"
        payload["org_number_set_at"] = now_iso
    client_ref.set(payload)

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
                "gender": emp.gender,
                "opted_out": emp.opted_out,
                "created_at": firestore.SERVER_TIMESTAMP,
            }
        )
        created.append(unique)
    return created


def _normalize_org_number(value: str | None) -> str | None:
    """Svenskt org.nr på kanonisk form NNNNNN-NNNN.

    Ops/kunder skriver omväxlande med eller utan bindestreck — normalisera vid
    skrivning så jämförelse, deduplicering och AI-motorernas matchning fungerar.
    Returnerar None om input inte är 10 siffror (vi gör ingen Luhn-check här).
    """
    if not value:
        return None
    digits = re.sub(r"\D", "", value)
    if len(digits) != 10:
        return value.strip() or None  # bevara avvikelse — synlig för ops vid granskning
    return f"{digits[:6]}-{digits[6:]}"
