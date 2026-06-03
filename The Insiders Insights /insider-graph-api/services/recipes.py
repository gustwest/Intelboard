"""Receptmotor — Lager C: persistens + lifecycle (Fas 1.3c, spec §10 punkt 5).

Persisterar DetailedRecipe i Firestore och hanterar operatörens lifecycle:
pending → agreed → acted → verified (eller dismissed). Verified sätts av
Fas 1.4-intervention-spårning; de andra transitionerna sker här.

Filosofi (varför idempotent regenerering):
  Trust_gap-motorn kör dagligen (compute-trust-gap-daily). Om vi skapade ett
  nytt recept per körning skulle operatörens UI svämma över. Istället:
  deterministisk recipe_id på (gap_type, dimension); regenerering uppdaterar
  in-place IFF status=pending (skelett kan ha förändrats, LLM kan ha gett
  bättre detaljer). När operatören godkänt receptet (agreed/acted) FRYSER
  vi det — vi skriver inte över deras beslut.

Filosofi (varför aldrig auto-publicering):
  Spec §6 + risk_corrector.py-mönstret: människan är ALLTID i loopen vid
  publicering. Vi GENERERAR recept automatiskt, men aldrig agerar — det är
  operatörens roll. Frontend visar receptet; operatören klickar "agreed",
  publicerar utanför verktyget, och klickar "acted" när det är gjort.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Literal

import firestore_client as fs
from services import gap_recipes as gr
from services import gap_recipes_llm as grl

log = logging.getLogger(__name__)


RecipeStatus = Literal["pending", "agreed", "acted", "verified", "dismissed"]

# Lifecycle-tillstånd. pending sätts vid generering; agreed/acted/dismissed av
# operatören; verified av Fas 1.4-intervention-spårning. Aldrig direkt-hopp
# mellan godtyckliga tillstånd — _ALLOWED_TRANSITIONS bevakar det.
_ALLOWED_TRANSITIONS: dict[RecipeStatus, tuple[RecipeStatus, ...]] = {
    "pending":   ("agreed", "dismissed"),
    "agreed":    ("acted", "dismissed"),
    "acted":     ("verified", "dismissed"),
    "verified":  (),  # terminal — gapet är stängt
    "dismissed": (),  # terminal — operatören avfärdade
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def recipe_id(skeleton: gr.RecipeSkeleton) -> str:
    """Deterministisk id: {gap_type}-{dimension}. Idempotent vid regenerering.

    Vi inkluderar INTE flagg-specifika diskriminator (warmest_engine,
    since_date, etc) i id:t — om en sådan ändras vill vi uppdatera det
    befintliga receptet, inte skapa ett nytt parallellt. Operatörens redan-
    godkända beslut bevaras (status=agreed/acted fryser uppdatering).
    """
    return f"{skeleton.gap_type}-{skeleton.dimension}"


def persist_recipe(
    client_id: str, recipe: gr.DetailedRecipe, *, now: str | None = None,
) -> dict[str, Any]:
    """Skriv eller uppdatera ett DetailedRecipe i Firestore.

    Idempotent: om dokumentet existerar och status fortfarande är `pending`
    uppdateras skelett + details (eventuella förbättringar från ny LLM-körning).
    Om status flyttats vidare (agreed/acted/verified/dismissed) **fryser** vi
    receptet — vi skriver inte över operatörens beslut. Returnerar en summering
    av vad som hände: {"created"/"updated"/"frozen", recipe_id, status}.
    """
    rid = recipe_id(recipe.skeleton)
    doc_ref = fs.recipe_doc(client_id, rid)
    existing = doc_ref.get()
    existing_data = existing.to_dict() if getattr(existing, "exists", False) else None
    iso_now = now or _now_iso()

    payload = recipe.as_dict()
    payload["recipe_id"] = rid
    payload["client_id"] = client_id

    if existing_data is None:
        payload["status"] = "pending"
        payload["created_at"] = iso_now
        payload["updated_at"] = iso_now
        payload["agreed_at"] = None
        payload["acted_at"] = None
        payload["verified_at"] = None
        payload["dismissed_at"] = None
        payload["notes"] = []
        doc_ref.set(payload)
        log.info("recept %s/%s skapat (pending)", client_id, rid)
        return {"action": "created", "recipe_id": rid, "status": "pending"}

    current_status = existing_data.get("status", "pending")
    if current_status != "pending":
        # Frozen — operatören har redan beslutat något. Vi skriver INTE över.
        log.info(
            "recept %s/%s fryst (status=%s) — regenerering hoppar över",
            client_id, rid, current_status,
        )
        return {"action": "frozen", "recipe_id": rid, "status": current_status}

    # status == pending → uppdatera skelett + details (men bevara lifecycle-fälten).
    merged = {**existing_data, **payload}
    merged["updated_at"] = iso_now
    # Lifecycle-fälten bevaras från existing_data (de var None i pending men ska
    # inte återställas om nya payload skulle råka sakna fältet).
    for k in ("created_at", "agreed_at", "acted_at", "verified_at", "dismissed_at", "notes"):
        if k in existing_data:
            merged[k] = existing_data[k]
    doc_ref.set(merged)
    log.info("recept %s/%s uppdaterat (pending)", client_id, rid)
    return {"action": "updated", "recipe_id": rid, "status": "pending"}


def _build_context_for(client_id: str, flag: dict[str, Any]) -> gr.RecipeContext:
    """Bygg RecipeContext från trust_gap + claims för en flagga."""
    client_snap = fs.client_doc(client_id).get()
    company_name = (client_snap.to_dict() or {}).get("company_name") if client_snap.exists else None

    tg_snap = fs.trust_gap_doc(client_id).get()
    tg = tg_snap.to_dict() if getattr(tg_snap, "exists", False) else {}
    dim_data = ((tg or {}).get("dimensions") or {}).get(flag.get("dimension"), {}) or {}
    perceived = dim_data.get("perceived") or {}

    # Topp-N existerande proof points: korta statements från claims. Vi tar bara
    # narrative-claims (rena fakta-claims är property-bevis och passar inte som
    # publiceringsförslag).
    proof_points: list[str] = []
    for _cid, c in fs.iter_claims(client_id):
        if c.get("claim_kind") == "narrative" and c.get("statement"):
            proof_points.append(c["statement"])
        if len(proof_points) >= 10:
            break

    # Flagg-specifika fält (warmest_engine, since_date, valence_drop, severity).
    extra: dict[str, Any] = {}
    for k in ("warmest_engine", "coolest_engine", "since_date", "valence_drop",
              "severity", "confidence", "gap_magnitude", "spread"):
        if k in flag and flag[k] is not None:
            extra[k] = flag[k]

    return gr.RecipeContext(
        client_id=client_id,
        company_name=company_name or client_id,
        declared=float(dim_data.get("declared") or 0.0),
        demonstrated=float(dim_data.get("demonstrated") or 0.0),
        perceived_valence=perceived.get("valence") if perceived.get("status") != "not_visible" else None,
        perceived_salience=perceived.get("salience") if perceived.get("status") != "not_visible" else None,
        available_proof_points=tuple(proof_points),
        extra=extra or None,
    )


def generate_for_client(client_id: str, *, now: str | None = None) -> dict[str, Any]:
    """Läs aktuell trust_gap, bygg recept för alla flaggor, persistera.

    Returnerar summering: {created, updated, frozen, llm_failed, total}.
    """
    if not fs.client_doc(client_id).get().exists:
        raise KeyError(f"client not found: {client_id}")

    tg_snap = fs.trust_gap_doc(client_id).get()
    if not getattr(tg_snap, "exists", False):
        log.info("ingen trust_gap för %s — kör compute_trust_gap först", client_id)
        return {"client_id": client_id, "total": 0, "reason": "no_trust_gap"}

    flags = (tg_snap.to_dict() or {}).get("flags") or []
    summary = {
        "client_id": client_id,
        "total": 0,
        "created": 0,
        "updated": 0,
        "frozen": 0,
        "llm_failed": 0,
    }

    for flag in flags:
        skeleton = gr.build_recipe_skeleton(flag)
        if skeleton is None:
            continue  # stubbade/okända typer — Fas 2/4 sak
        context = _build_context_for(client_id, flag)
        recipe = grl.detailify(skeleton, context)
        if recipe.details is None:
            summary["llm_failed"] += 1
            # Persistera ändå — frontend visar "väntar på detaljifiering".
        result = persist_recipe(client_id, recipe, now=now)
        summary["total"] += 1
        summary[result["action"]] = summary.get(result["action"], 0) + 1

    log.info("recept-generering för %s: %s", client_id, summary)
    return summary


# --- Status-transitions -------------------------------------------------------


class StatusTransitionError(ValueError):
    """Kastas vid ogiltig transition (t.ex. acted→pending eller verified→agreed)."""


def update_status(
    client_id: str, rid: str, new_status: RecipeStatus, *,
    note: str | None = None, now: str | None = None,
) -> dict[str, Any]:
    """Övergå till nytt status-tillstånd. Validerar mot _ALLOWED_TRANSITIONS.

    note: valfri operatör-anteckning som ackumuleras i recipe.notes[].
    Returnerar uppdaterat doc-data.
    """
    doc_ref = fs.recipe_doc(client_id, rid)
    snap = doc_ref.get()
    if not getattr(snap, "exists", False):
        raise KeyError(f"recipe not found: {client_id}/{rid}")
    data = snap.to_dict() or {}
    current = data.get("status", "pending")

    if new_status == current:
        return data  # no-op

    allowed = _ALLOWED_TRANSITIONS.get(current, ())
    if new_status not in allowed:
        raise StatusTransitionError(
            f"Ogiltig transition: {current} → {new_status}. "
            f"Tillåtna från {current}: {list(allowed)}"
        )

    iso_now = now or _now_iso()
    data["status"] = new_status
    data["updated_at"] = iso_now
    # Lifecycle-tidsstämplar (en per terminal/intermediate-status).
    timestamp_field = {
        "agreed": "agreed_at",
        "acted": "acted_at",
        "verified": "verified_at",
        "dismissed": "dismissed_at",
    }.get(new_status)
    if timestamp_field:
        data[timestamp_field] = iso_now

    if note:
        notes = list(data.get("notes") or [])
        notes.append({"at": iso_now, "status": new_status, "text": note})
        data["notes"] = notes

    doc_ref.set(data)
    log.info("recept %s/%s: %s → %s", client_id, rid, current, new_status)
    return data
