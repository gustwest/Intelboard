"""Persona-registry REST-yta (Fas 2.1g, Nivå 2 — read-only).

Exponerar den kurerade paletten + probe-templates så frontend kan rendera
palett-väljaren och template-kvalitetskoll-vyn. READ-ONLY by design — templates
editeras i services/persona_registry.py (mätintegritet, se persona-model.md).
Aktiva personor per kund läses/skrivs via PUT /api/clients/{id}/config (personas-fältet).
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter

from services import persona_registry

router = APIRouter(prefix="/api/personas", tags=["personas"])


@router.get("/registry")
def get_registry() -> dict[str, Any]:
    """Hela paletten med probe-templates (Nivå 2 read-only).

    Driver palett-väljaren (10 togglabara personor + beskrivning) och template-
    kvalitetskoll-vyn i AI-synlighet. max_active säger frontend hur många som
    får aktiveras samtidigt.
    """
    return {
        "personas": persona_registry.as_dicts(),
        "defaults": list(persona_registry.default_persona_ids()),
        "max_active": persona_registry.MAX_ACTIVE_PERSONAS_PER_CLIENT,
    }
