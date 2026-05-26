"""Firestore-helpers.

Collection-layout speglar spec.md sektion 02:

    clients/{client_id}
        employees/{employee_id}
            raw_items/{item_id}
        polling_results/{week_id}
    connector_logs/{log_id}
"""
from functools import lru_cache
from typing import Any, Iterator

from google.cloud import firestore

from config import settings


@lru_cache(maxsize=1)
def db() -> firestore.Client:
    return firestore.Client(project=settings.firestore_project_id or None)


def clients_col():
    return db().collection("clients")


def client_doc(client_id: str):
    return clients_col().document(client_id)


def employees_col(client_id: str):
    return client_doc(client_id).collection("employees")


def employee_doc(client_id: str, employee_id: str):
    return employees_col(client_id).document(employee_id)


def raw_items_col(client_id: str, employee_id: str):
    return employee_doc(client_id, employee_id).collection("raw_items")


def raw_items_company_col(client_id: str):
    return client_doc(client_id).collection("raw_items_company")


def raw_item_doc(client_id: str, employee_id: str | None, item_id: str):
    """Slå upp ett enskilt källitem. employee_id=None → företagsnivå."""
    if employee_id is None:
        return raw_items_company_col(client_id).document(item_id)
    return raw_items_col(client_id, employee_id).document(item_id)


def claims_col(client_id: str):
    return client_doc(client_id).collection("claims")


def claim_doc(client_id: str, claim_id: str):
    return claims_col(client_id).document(claim_id)


def iter_claims(client_id: str) -> Iterator[tuple[str, dict[str, Any]]]:
    for doc in claims_col(client_id).stream():
        yield doc.id, doc.to_dict() or {}


def polling_results_col(client_id: str):
    return client_doc(client_id).collection("polling_results")


def risk_findings_col(client_id: str):
    return client_doc(client_id).collection("risk_findings")


def risk_finding_doc(client_id: str, finding_id: str):
    return risk_findings_col(client_id).document(finding_id)


def iter_risk_findings(client_id: str) -> Iterator[tuple[str, dict[str, Any]]]:
    for doc in risk_findings_col(client_id).stream():
        yield doc.id, doc.to_dict() or {}


def risk_questions_col(client_id: str):
    return client_doc(client_id).collection("risk_questions")


def risk_question_doc(client_id: str, question_id: str):
    return risk_questions_col(client_id).document(question_id)


def iter_risk_questions(client_id: str) -> Iterator[tuple[str, dict[str, Any]]]:
    for doc in risk_questions_col(client_id).stream():
        yield doc.id, doc.to_dict() or {}


def risk_run_summary_doc(client_id: str):
    """Senaste detekteringskörningens totaler (denominator för Risk Exposure-andelen)."""
    return client_doc(client_id).collection("risk_runs").document("latest")


def monthly_reports_col(client_id: str):
    return client_doc(client_id).collection("monthly_reports")


def monthly_report_doc(client_id: str, month: str):
    """Månadsrapporten landar här fysiskt (id = YYYY-MM)."""
    return monthly_reports_col(client_id).document(month)


def iter_monthly_reports(client_id: str) -> Iterator[tuple[str, dict[str, Any]]]:
    for doc in monthly_reports_col(client_id).stream():
        yield doc.id, doc.to_dict() or {}


# --- ESG & CSRD Perception Audit (riskloopens ESG-spår) -----------------------
# Speglar risk_questions/risk_findings/risk_runs/monthly_reports men i egna
# collections så ESG-loopen kan köras och granskas parallellt med GEO-riskloopen.


def esg_questions_col(client_id: str):
    return client_doc(client_id).collection("esg_questions")


def esg_question_doc(client_id: str, question_id: str):
    return esg_questions_col(client_id).document(question_id)


def iter_esg_questions(client_id: str) -> Iterator[tuple[str, dict[str, Any]]]:
    for doc in esg_questions_col(client_id).stream():
        yield doc.id, doc.to_dict() or {}


def esg_findings_col(client_id: str):
    return client_doc(client_id).collection("esg_findings")


def esg_finding_doc(client_id: str, finding_id: str):
    return esg_findings_col(client_id).document(finding_id)


def iter_esg_findings(client_id: str) -> Iterator[tuple[str, dict[str, Any]]]:
    for doc in esg_findings_col(client_id).stream():
        yield doc.id, doc.to_dict() or {}


def esg_run_summary_doc(client_id: str):
    """Senaste ESG-skanningens totaler (denominator för AI ESG Risk Score)."""
    return client_doc(client_id).collection("esg_runs").document("latest")


def esg_submissions_col(client_id: str):
    return client_doc(client_id).collection("esg_submissions")


def esg_submission_doc(client_id: str, submission_id: str):
    return esg_submissions_col(client_id).document(submission_id)


def iter_esg_submissions(client_id: str) -> Iterator[tuple[str, dict[str, Any]]]:
    for doc in esg_submissions_col(client_id).stream():
        yield doc.id, doc.to_dict() or {}


def esg_reports_col(client_id: str):
    return client_doc(client_id).collection("esg_reports")


def esg_report_doc(client_id: str, month: str):
    return esg_reports_col(client_id).document(month)


def iter_esg_reports(client_id: str) -> Iterator[tuple[str, dict[str, Any]]]:
    for doc in esg_reports_col(client_id).stream():
        yield doc.id, doc.to_dict() or {}


def job_feed_state_doc(client_id: str):
    """Senast sedda annons-id för jobfeed-connectorn (spec §1.2 / §3).

    jobs/xml_sync.py jämför dagens id-mängd mot den som ligger här för att
    upptäcka stängda jobb. Form: {"jobs": {job_id: {item_id, name}}, "synced_at": ...}.
    """
    return client_doc(client_id).collection("job_feed_state").document("latest")


def linkedin_snapshots_col(client_id: str):
    """Kvartalsvisa LinkedIn-kapacitetssnapshots (spec §4). Ett aktivt VERIFIED i taget."""
    return client_doc(client_id).collection("linkedin_snapshots")


def linkedin_snapshot_doc(client_id: str, snapshot_id: str):
    return linkedin_snapshots_col(client_id).document(snapshot_id)


def iter_linkedin_snapshots(client_id: str) -> Iterator[tuple[str, dict[str, Any]]]:
    for doc in linkedin_snapshots_col(client_id).stream():
        yield doc.id, doc.to_dict() or {}


def todos_col(client_id: str):
    """Kund-dashboardens To-Do-aktiviteter (t.ex. kvartalsvis LinkedIn-uppladdning)."""
    return client_doc(client_id).collection("todos")


def todo_doc(client_id: str, todo_id: str):
    return todos_col(client_id).document(todo_id)


def iter_todos(client_id: str) -> Iterator[tuple[str, dict[str, Any]]]:
    for doc in todos_col(client_id).stream():
        yield doc.id, doc.to_dict() or {}


def connector_logs_col():
    return db().collection("connector_logs")


def iter_clients() -> Iterator[tuple[str, dict[str, Any]]]:
    for doc in clients_col().stream():
        yield doc.id, doc.to_dict() or {}


def iter_employees(client_id: str) -> Iterator[tuple[str, dict[str, Any]]]:
    for doc in employees_col(client_id).stream():
        yield doc.id, doc.to_dict() or {}
