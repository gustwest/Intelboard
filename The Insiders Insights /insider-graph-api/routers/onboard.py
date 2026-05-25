"""Onboarding-endpoint — Discovery-agent som API.

POST /api/onboard → skapa kund + medarbetare i Firestore. Medarbetare och
connector-config skickas strukturerat (se schemas.OnboardRequest); UI:t i
insider-graph/kunder bygger payloaden från formulärfält.
"""
from fastapi import APIRouter, HTTPException

from schemas import OnboardRequest, OnboardResponse
from services.discovery import onboard_client

router = APIRouter(prefix="/api/onboard", tags=["onboarding"])


@router.post("", response_model=OnboardResponse)
def onboard(req: OnboardRequest) -> OnboardResponse:
    try:
        return onboard_client(req)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
