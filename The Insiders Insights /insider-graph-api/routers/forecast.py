"""What-if-yta ovanpå receptmotorn (#1a): hur rör sig beslutssäkerheten INNAN åtgärd.

Idag visar verktyget bara utfall efter åtgärd (closed-loop). Detta endpoint låter
operatören simulera "om vi löser den här risken / publicerar den här korrigeringen →
vart rör sig talet" — en deterministisk projektion av beslutssäkerhets-formeln, inte
en empirisk prognos (SoV-prediktion är medvetet INTE med: dess rörelse skulle vara
mindre än det uppmätta brusbandet, se docs/implementation-plan...).

Återanvänder monthly_report._decision_confidence rakt av via project_confidence, så
projektionen kan aldrig drifta från den riktiga poängen.
"""
from __future__ import annotations

from statistics import median
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

import firestore_client as fs
from services import audience_personas
from services import monthly_report

router = APIRouter(prefix="/api/forecast", tags=["forecast"])


class WhatIfRequest(BaseModel):
    # Findings som hypotetiskt löses (doc-id från detected[].id i månadsrapporten).
    resolve_finding_ids: list[str] = []
    # Simulera att den/de otäckta personan/personorna börjar mätas → taket 74→95.
    simulate_full_coverage: bool = False


def _load_open_findings_and_answers(client_id: str) -> tuple[list[dict], dict[str, int]]:
    """Speglar monthly_report.build_report_model rad 128–138: öppna findings (med doc-id)
    + answers_by_persona från senaste detekteringskörningen."""
    open_f: list[dict] = []
    for fid, d in fs.iter_risk_findings(client_id):
        if d.get("status") not in (None, "open"):
            continue
        d["_id"] = fid
        d["persona"] = audience_personas.normalize(d.get("persona"))
        open_f.append(d)

    summary_snap = fs.risk_run_summary_doc(client_id).get()
    summary = summary_snap.to_dict() if summary_snap.exists else {}
    answers_by_persona = audience_personas.normalize_keys((summary or {}).get("answers_by_persona"))
    return open_f, answers_by_persona


def _coverage_simulation(answers_by_persona: dict[str, int]) -> dict[str, int]:
    """Fyll otäckta kanoniska personas med medianen av de täckta, så takhöjningen
    (74→95) blir synlig i projektionen. Inga täckta personas → tomt (inget att simulera)."""
    covered = {p: int(answers_by_persona.get(p) or 0) for p in audience_personas.CANONICAL}
    present = [n for n in covered.values() if n > 0]
    if not present:
        return {}
    fill = int(round(median(present)))
    return {p: fill for p, n in covered.items() if n == 0}


@router.post("/{client_id}/confidence/whatif")
def whatif_confidence(client_id: str, body: WhatIfRequest) -> dict[str, Any]:
    """Projicera beslutssäkerheten om angivna findings löses och/eller täckning breddas."""
    if not fs.client_doc(client_id).get().exists:
        raise HTTPException(404, f"client not found: {client_id}")

    open_f, answers_by_persona = _load_open_findings_and_answers(client_id)
    simulate = _coverage_simulation(answers_by_persona) if body.simulate_full_coverage else None

    result = monthly_report.project_confidence(
        open_f,
        answers_by_persona,
        resolve_ids=set(body.resolve_finding_ids),
        simulate_persona_answers=simulate,
    )
    return {"client_id": client_id, **result}
