"""Onboarding-endpoints — Discovery-agent som API.

POST /api/onboard/preview-csv → parse + validera utan att skriva
POST /api/onboard            → skapa kund + medarbetare i Firestore
"""
from fastapi import APIRouter, HTTPException

from schemas import (
    CsvOnboardRequest,
    CsvPreviewResponse,
    OnboardRequest,
    OnboardResponse,
)
from services.discovery import onboard_client, parse_csv

router = APIRouter(prefix="/api/onboard", tags=["onboarding"])


@router.post("/preview-csv", response_model=CsvPreviewResponse)
def preview_csv(req: CsvOnboardRequest) -> CsvPreviewResponse:
    employees = parse_csv(req.csv)
    return CsvPreviewResponse(employees=employees, row_count=len(employees))


@router.post("", response_model=OnboardResponse)
def onboard(req: OnboardRequest) -> OnboardResponse:
    try:
        return onboard_client(req)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.post("/from-csv", response_model=OnboardResponse)
def onboard_from_csv(req: CsvOnboardRequest) -> OnboardResponse:
    employees = parse_csv(req.csv)
    if not employees:
        raise HTTPException(status_code=400, detail="no valid rows in CSV")
    onboard_req = OnboardRequest(
        client_id=req.client_id,
        company_name=req.company_name,
        company_linkedin_url=req.company_linkedin_url,
        org_number=req.org_number,
        employees=employees,
    )
    try:
        return onboard_client(onboard_req)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
