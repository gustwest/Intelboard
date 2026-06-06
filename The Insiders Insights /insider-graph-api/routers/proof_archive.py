"""Bevisarkiv (Spår D3) — revisor-mässig vy över verifierade claims.

Tunn HTTP-yta ovanpå services/proof_archive (ren sammanställning). Visar BARA
publicerade claims med bevis-grad proveniens (assurance_level eller verbatim-citat),
sammanvävt med verifieringsrecordets fyra kontroller. Förslag/needs_review hålls
utanför. Pitchens "tidsstämplad bevisprovenans, klickbar till källcitatet" bor här.

    GET /api/proof-archive/{client_id}          → poster + summary (filtrerbart)
    GET /api/proof-archive/{client_id}/export   → samma data + deterministisk hash
                                                   (signerad-JSON light: hash + timestamp)
"""
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException, Query

import firestore_client as fs
from services import proof_archive

router = APIRouter(prefix="/api/proof-archive", tags=["proof-archive"])


def _load(client_id: str, **filters: Any) -> dict[str, Any]:
    if not fs.client_doc(client_id).get().exists:
        raise HTTPException(404, f"client not found: {client_id}")
    verifications_by_id = {vid: data for vid, data in fs.iter_verifications(client_id)}
    return proof_archive.build_archive(fs.iter_claims(client_id), verifications_by_id, **filters)


@router.get("/{client_id}")
def get_proof_archive(
    client_id: str,
    assurance_level: str | None = Query(None),
    facet: str | None = Query(None),
    dimension: str | None = Query(None),
    tier: str | None = Query(None, description="assured | grounded"),
    date_from: str | None = Query(None, description="ISO YYYY-MM-DD; postens as_of >="),
    date_to: str | None = Query(None, description="ISO YYYY-MM-DD; postens as_of <="),
) -> dict[str, Any]:
    archive = _load(
        client_id,
        assurance_level=assurance_level, facet=facet, dimension=dimension,
        tier=tier, date_from=date_from, date_to=date_to,
    )
    return {"client_id": client_id, **archive}


@router.get("/{client_id}/export")
def export_proof_archive(client_id: str) -> dict[str, Any]:
    """Hela arkivet + en deterministisk innehållshash (revisor-export). Ingen PKI —
    hash + tidsstämpel räcker som manipulationsdetektor; full signering är eget spår."""
    archive = _load(client_id)
    canonical = json.dumps(archive["entries"], sort_keys=True, ensure_ascii=False)
    content_hash = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
    return {
        "client_id": client_id,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "content_hash": f"sha256:{content_hash}",
        **archive,
    }
