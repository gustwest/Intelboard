"""Pydantic-modeller för API:t."""
from __future__ import annotations

from typing import Any, Literal

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


# --- Claims & proveniens (se docs/claims-provenance-spec.md) ---------------


class ClaimSource(BaseModel):
    """Källa bakom ett claim. Ett claim utan minst en källa skrivs aldrig."""

    kind: Literal["item", "manual"] = "item"
    # kind="item": peka på ett raw_item-dokument (→ url, datum).
    item_id: str | None = None
    # employee_id sätts om källan är ett medarbetar-item; None = företagsnivå.
    employee_id: str | None = None
    # kind="manual": neutral etikett, default "uppgift från bolaget", omskrivningsbar.
    label: str | None = None


class Claim(BaseModel):
    """Ett källförsett påstående. `property` fyller en schema.org-egenskap,
    `narrative` blir en mening i prosa. Båda renderas ur samma claims-lager."""

    claim_kind: Literal["property", "narrative"]
    # Logisk subjekt-referens som kompilatorn löser till ett @id:
    # "org" för organisationen, annars ett employee_id.
    subject_ref: str = "org"
    # property: schema.org-egenskap + värde.
    predicate: str | None = None
    value: Any | None = None
    # narrative (och valfri visningstext för property): själva meningen.
    statement: str | None = None
    source: list[ClaimSource] = Field(default_factory=list)
    confidence: float = 1.0
    included_in_output: bool = True
    needs_review: bool = False
    review_status: Literal["approved", "rejected"] | None = None
