"""Pydantic-modeller för API:t."""
from __future__ import annotations

from pydantic import BaseModel, Field


class EmployeeInput(BaseModel):
    name: str
    linkedin_url: str
    title: str | None = None
    node_type: str = "aktiv"
    gender: str | None = None


class OnboardRequest(BaseModel):
    client_id: str = Field(..., description="slug matching the Insiders Insights customer")
    company_name: str
    company_linkedin_url: str | None = None
    org_number: str | None = None
    active_connectors: list[str] | None = None
    employees: list[EmployeeInput] = Field(default_factory=list)


class OnboardResponse(BaseModel):
    client_id: str
    employees_created: int
    employee_ids: list[str]


class CsvOnboardRequest(BaseModel):
    client_id: str
    company_name: str
    company_linkedin_url: str | None = None
    org_number: str | None = None
    csv: str


class CsvPreviewResponse(BaseModel):
    employees: list[EmployeeInput]
    row_count: int
