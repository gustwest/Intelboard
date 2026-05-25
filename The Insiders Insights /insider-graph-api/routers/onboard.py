"""Onboarding-endpoint — Discovery-agent som API.

POST /api/onboard → skapa kund + medarbetare i Firestore. Medarbetare och
connector-config skickas strukturerat (se schemas.OnboardRequest); UI:t i
insider-graph/kunder bygger payloaden från formulärfält.
"""
from fastapi import APIRouter, BackgroundTasks, HTTPException

from schemas import OnboardRequest, OnboardResponse
from services.discovery import onboard_client
from services.ingest import ingest_new_client

router = APIRouter(prefix="/api/onboard", tags=["onboarding"])


@router.post("", response_model=OnboardResponse)
def onboard(req: OnboardRequest, background: BackgroundTasks) -> OnboardResponse:
    try:
        resp = onboard_client(req)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    # Kör ivalda connectors + compile direkt (i bakgrunden) så att den nya kundens
    # graf befolkas från första stund i stället för vid nästa cron-tick.
    background.add_task(ingest_new_client, resp.client_id)
    return resp
