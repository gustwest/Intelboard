"""Fake Firestore för enhetstester — installeras som `firestore_client`.

Importeras FÖRST i varje testmodul (före schema_org/services) så att modulernas
`import firestore_client as fs` binder till den här fejken i stället för den
riktiga google.cloud-klienten. Data sätts per test med `reset(...)`.
"""
from __future__ import annotations

import sys
import types
from typing import Any


class _Snap:
    def __init__(self, _id: str, data: dict | None):
        self.id = _id
        self._data = data
        self.exists = data is not None

    def to_dict(self) -> dict | None:
        return self._data


class _DocRef:
    def __init__(self, _id: str, data: dict | None, on_set=None, on_update=None, on_delete=None):
        self._id = _id
        self._data = data
        self._on_set = on_set
        self._on_update = on_update
        self._on_delete = on_delete

    def get(self) -> _Snap:
        return _Snap(self._id, self._data)

    def set(self, payload: dict, merge: bool = False) -> None:
        # merge ignoreras i fejken — collections som stödjer set använder en
        # merge-uppdatering ändå (räcker för testernas fält-assertioner).
        if self._on_set:
            self._on_set(self._id, payload)

    def update(self, payload: dict) -> None:
        if self._on_update:
            self._on_update(self._id, payload)

    def delete(self) -> None:
        if self._on_delete:
            self._on_delete(self._id)


class _Col:
    def __init__(self, docs: dict[str, dict] | None, *, deletable: bool = False, writable: bool = False):
        self._docs = docs if docs is not None else {}
        self._deletable = deletable  # → document().delete() muterar dict:en
        self._writable = writable    # → document().set() merge-uppdaterar dict:en

    def stream(self) -> list[_Snap]:
        return [_Snap(i, d) for i, d in self._docs.items()]

    def document(self, _id: str) -> _DocRef:
        on_delete = (lambda i: self._docs.pop(i, None)) if self._deletable else None
        on_set = (lambda i, p: self._docs.setdefault(i, {}).update(p)) if self._writable else None
        return _DocRef(_id, self._docs.get(_id), on_set=on_set, on_delete=on_delete)


STATE: dict[str, Any] = {}


def reset(
    *,
    client: dict | None = None,
    employees: dict[str, dict] | None = None,
    company_items: dict[str, dict] | None = None,
    employee_items: dict[str, dict[str, dict]] | None = None,
    claims: dict[str, dict] | None = None,
    risk_findings: dict[str, dict] | None = None,
    risk_questions: dict[str, dict] | None = None,
    risk_run_summary: dict | None = None,
    monthly_reports: dict[str, dict] | None = None,
    polling_results: dict[str, dict] | None = None,
    esg_questions: dict[str, dict] | None = None,
    esg_findings: dict[str, dict] | None = None,
    esg_run_summary: dict | None = None,
    esg_submissions: dict[str, dict] | None = None,
    esg_reports: dict[str, dict] | None = None,
    linkedin_snapshots: dict[str, dict] | None = None,
    todos: dict[str, dict] | None = None,
    clients: dict[str, dict] | None = None,
    verifications: dict[str, dict] | None = None,
    trust_gap: dict | None = None,
    trust_gap_snapshots: dict[str, dict] | None = None,
    output_quality_logs: dict[str, dict] | None = None,
    recipes: dict[str, dict] | None = None,
    interventions: dict[str, dict] | None = None,
) -> None:
    STATE.clear()
    STATE.update(
        client=client,  # None → klientdokumentet "finns inte" (exists=False)
        clients=clients or {},  # för iter_clients (fan-out-jobb)
        employees=employees or {},
        company_items=company_items or {},
        employee_items=employee_items or {},
        claims=claims or {},
        risk_findings=risk_findings or {},
        risk_questions=risk_questions or {},
        risk_run_summary=risk_run_summary,  # None → "finns inte"
        monthly_reports=monthly_reports or {},
        polling_results=polling_results or {},
        esg_questions=esg_questions or {},
        esg_findings=esg_findings or {},
        esg_run_summary=esg_run_summary,  # None → "finns inte"
        esg_submissions=esg_submissions or {},
        esg_reports=esg_reports or {},
        linkedin_snapshots=linkedin_snapshots or {},
        todos=todos or {},
        verifications=verifications or {},
        trust_gap=trust_gap,  # None → "finns inte" (exists=False)
        trust_gap_snapshots=trust_gap_snapshots or {},
        output_quality_logs=output_quality_logs or {},
        recipes=recipes or {},
        interventions=interventions or {},
        writes={},
    )


# --- firestore_client-API (samma signaturer som riktiga firestore_client) ---


def client_doc(client_id: str) -> _DocRef:
    return _DocRef(
        client_id,
        STATE.get("client"),
        on_set=lambda _i, p: STATE.__setitem__("client", p),
        on_update=lambda _i, p: (STATE.get("client") or {}).update(p),
    )


def iter_clients():
    return list(STATE.get("clients", {}).items())


def iter_employees(client_id: str):
    return list(STATE.get("employees", {}).items())


def employee_doc(client_id: str, employee_id: str) -> _DocRef:
    return _DocRef(
        employee_id,
        STATE.get("employees", {}).get(employee_id),
        on_set=lambda i, p: STATE.setdefault("employees", {}).__setitem__(i, p),
    )


def iter_claims(client_id: str):
    return list(STATE.get("claims", {}).items())


def raw_items_company_col(client_id: str) -> _Col:
    return _Col(STATE.get("company_items"), deletable=True, writable=True)


def job_feed_state_doc(client_id: str) -> _DocRef:
    return _DocRef(
        "latest",
        STATE.get("job_feed_state"),
        on_set=lambda _i, p: STATE.__setitem__("job_feed_state", p),
    )


def raw_items_col(client_id: str, employee_id: str) -> _Col:
    return _Col(STATE.get("employee_items", {}).get(employee_id, {}))


def raw_item_doc(client_id: str, employee_id: str | None, item_id: str) -> _DocRef:
    docs = (
        STATE.get("company_items")
        if employee_id is None
        else STATE.get("employee_items", {}).get(employee_id, {})
    )
    return _DocRef(item_id, (docs or {}).get(item_id))


def claim_doc(client_id: str, claim_id: str) -> _DocRef:
    return _DocRef(
        claim_id,
        STATE.get("claims", {}).get(claim_id),
        on_set=lambda i, p: STATE["writes"].__setitem__(i, p),  # extraktion skapar nya
        on_update=lambda i, p: STATE["claims"].setdefault(i, {}).update(p),  # review uppdaterar
        on_delete=lambda i: STATE.get("claims", {}).pop(i, None),  # GDPR-radering
    )


def risk_findings_col(client_id: str) -> _Col:
    return _Col(STATE.get("risk_findings"))


def risk_finding_doc(client_id: str, finding_id: str) -> _DocRef:
    return _DocRef(
        finding_id,
        STATE.get("risk_findings", {}).get(finding_id),
        on_set=lambda i, p: STATE.setdefault("risk_findings", {}).__setitem__(i, p),
        on_update=lambda i, p: STATE["risk_findings"].setdefault(i, {}).update(p),  # skiva 2 agerar
    )


def iter_risk_findings(client_id: str):
    return list(STATE.get("risk_findings", {}).items())


def risk_questions_col(client_id: str) -> _Col:
    return _Col(STATE.get("risk_questions"))


def risk_question_doc(client_id: str, question_id: str) -> _DocRef:
    return _DocRef(
        question_id,
        STATE.get("risk_questions", {}).get(question_id),
        on_set=lambda i, p: STATE.setdefault("risk_questions", {}).__setitem__(i, p),
        on_update=lambda i, p: STATE["risk_questions"].setdefault(i, {}).update(p),
    )


def iter_risk_questions(client_id: str):
    return list(STATE.get("risk_questions", {}).items())


def risk_run_summary_doc(client_id: str) -> _DocRef:
    return _DocRef(
        "latest",
        STATE.get("risk_run_summary"),
        on_set=lambda _i, p: STATE.__setitem__("risk_run_summary", p),
    )


def polling_results_col(client_id: str) -> _Col:
    return _Col(STATE.get("polling_results"), writable=True)


def monthly_reports_col(client_id: str) -> _Col:
    return _Col(STATE.get("monthly_reports"))


def monthly_report_doc(client_id: str, month: str) -> _DocRef:
    return _DocRef(
        month,
        STATE.get("monthly_reports", {}).get(month),
        on_set=lambda i, p: STATE.setdefault("monthly_reports", {}).__setitem__(i, p),
    )


def iter_monthly_reports(client_id: str):
    return list(STATE.get("monthly_reports", {}).items())


def esg_questions_col(client_id: str) -> _Col:
    return _Col(STATE.get("esg_questions"))


def esg_question_doc(client_id: str, question_id: str) -> _DocRef:
    return _DocRef(
        question_id,
        STATE.get("esg_questions", {}).get(question_id),
        on_set=lambda i, p: STATE.setdefault("esg_questions", {}).__setitem__(i, p),
        on_update=lambda i, p: STATE["esg_questions"].setdefault(i, {}).update(p),
    )


def iter_esg_questions(client_id: str):
    return list(STATE.get("esg_questions", {}).items())


def esg_findings_col(client_id: str) -> _Col:
    return _Col(STATE.get("esg_findings"))


def esg_finding_doc(client_id: str, finding_id: str) -> _DocRef:
    return _DocRef(
        finding_id,
        STATE.get("esg_findings", {}).get(finding_id),
        on_set=lambda i, p: STATE.setdefault("esg_findings", {}).__setitem__(i, p),
        on_update=lambda i, p: STATE["esg_findings"].setdefault(i, {}).update(p),
    )


def iter_esg_findings(client_id: str):
    return list(STATE.get("esg_findings", {}).items())


def esg_run_summary_doc(client_id: str) -> _DocRef:
    return _DocRef(
        "latest",
        STATE.get("esg_run_summary"),
        on_set=lambda _i, p: STATE.__setitem__("esg_run_summary", p),
    )


def esg_submissions_col(client_id: str) -> _Col:
    return _Col(STATE.get("esg_submissions"))


def esg_submission_doc(client_id: str, submission_id: str) -> _DocRef:
    return _DocRef(
        submission_id,
        STATE.get("esg_submissions", {}).get(submission_id),
        on_set=lambda i, p: STATE.setdefault("esg_submissions", {}).__setitem__(i, p),
    )


def iter_esg_submissions(client_id: str):
    return list(STATE.get("esg_submissions", {}).items())


def esg_reports_col(client_id: str) -> _Col:
    return _Col(STATE.get("esg_reports"))


def esg_report_doc(client_id: str, month: str) -> _DocRef:
    return _DocRef(
        month,
        STATE.get("esg_reports", {}).get(month),
        on_set=lambda i, p: STATE.setdefault("esg_reports", {}).__setitem__(i, p),
    )


def iter_esg_reports(client_id: str):
    return list(STATE.get("esg_reports", {}).items())


def linkedin_snapshots_col(client_id: str) -> _Col:
    return _Col(STATE.get("linkedin_snapshots"), writable=True)


def linkedin_snapshot_doc(client_id: str, snapshot_id: str) -> _DocRef:
    return _DocRef(
        snapshot_id,
        STATE.get("linkedin_snapshots", {}).get(snapshot_id),
        on_set=lambda i, p: STATE.setdefault("linkedin_snapshots", {}).__setitem__(i, p),
        on_update=lambda i, p: STATE["linkedin_snapshots"].setdefault(i, {}).update(p),
    )


def iter_linkedin_snapshots(client_id: str):
    return list(STATE.get("linkedin_snapshots", {}).items())


def todos_col(client_id: str) -> _Col:
    return _Col(STATE.get("todos"), writable=True)


def todo_doc(client_id: str, todo_id: str) -> _DocRef:
    return _DocRef(
        todo_id,
        STATE.get("todos", {}).get(todo_id),
        on_set=lambda i, p: STATE.setdefault("todos", {}).__setitem__(i, p),
        on_update=lambda i, p: STATE["todos"].setdefault(i, {}).update(p),
    )


def iter_todos(client_id: str):
    return list(STATE.get("todos", {}).items())


def trust_gap_doc(client_id: str) -> _DocRef:
    return _DocRef(
        "latest",
        STATE.get("trust_gap"),
        on_set=lambda _i, p: STATE.__setitem__("trust_gap", p),
        on_update=lambda _i, p: (STATE.get("trust_gap") or {}).update(p),
    )


def trust_gap_snapshots_col(client_id: str) -> _Col:
    return _Col(STATE.get("trust_gap_snapshots"), writable=True)


def trust_gap_snapshot_doc(client_id: str, date: str) -> _DocRef:
    return _DocRef(
        date,
        STATE.get("trust_gap_snapshots", {}).get(date),
        on_set=lambda i, p: STATE.setdefault("trust_gap_snapshots", {}).__setitem__(i, p),
    )


def iter_trust_gap_snapshots(client_id: str):
    return list(STATE.get("trust_gap_snapshots", {}).items())


def recipes_col(client_id: str) -> _Col:
    return _Col(STATE.get("recipes"), writable=True)


def recipe_doc(client_id: str, recipe_id: str) -> _DocRef:
    return _DocRef(
        recipe_id,
        STATE.get("recipes", {}).get(recipe_id),
        on_set=lambda i, p: STATE.setdefault("recipes", {}).__setitem__(i, p),
    )


def iter_recipes(client_id: str):
    return list(STATE.get("recipes", {}).items())


def interventions_col(client_id: str) -> _Col:
    return _Col(STATE.get("interventions"), writable=True)


def intervention_doc(client_id: str, intervention_id: str) -> _DocRef:
    return _DocRef(
        intervention_id,
        STATE.get("interventions", {}).get(intervention_id),
        on_set=lambda i, p: STATE.setdefault("interventions", {}).__setitem__(i, p),
    )


def iter_interventions(client_id: str):
    return list(STATE.get("interventions", {}).items())


def _oq_logs_bucket(client_id: str) -> dict:
    """output_quality_logs är per-kund i produktion. Modelleras därför som dict-of-dict.

    Bakåtkompatibelt: om `STATE["output_quality_logs"]` är en flat dict (existerande
    tester) behandlas det som "den enda klientens" loggar — den används för alla
    client_id-anrop. Cross-client-tester sätter STATE["output_quality_logs_by_client"]
    explicit."""
    by_client = STATE.get("output_quality_logs_by_client")
    if by_client is not None:
        return by_client.setdefault(client_id, {})
    # Fallback: delad bucket (kompatibilitet med befintliga single-client-tester)
    return STATE.setdefault("output_quality_logs", {})


def output_quality_logs_col(client_id: str) -> _Col:
    return _Col(_oq_logs_bucket(client_id), writable=True)


def output_quality_log_doc(client_id: str, log_id: str) -> _DocRef:
    bucket = _oq_logs_bucket(client_id)
    return _DocRef(
        log_id,
        bucket.get(log_id),
        on_set=lambda i, p: bucket.__setitem__(i, p),
    )


def iter_output_quality_logs(client_id: str):
    return list(_oq_logs_bucket(client_id).items())


def verifications_col(client_id: str) -> _Col:
    return _Col(STATE.get("verifications"), writable=True)


def verification_doc(client_id: str, verification_id: str) -> _DocRef:
    return _DocRef(
        verification_id,
        STATE.get("verifications", {}).get(verification_id),
        on_set=lambda i, p: STATE.setdefault("verifications", {}).__setitem__(i, p),
        on_update=lambda i, p: STATE["verifications"].setdefault(i, {}).update(p),
    )


def iter_verifications(client_id: str):
    return list(STATE.get("verifications", {}).items())


def writes() -> dict[str, dict]:
    return STATE.get("writes", {})


# --- Modell-registry-helpers (matchar firestore_client.py) ------------------
# Drift-scannens change-detection + drift-findings. Tester patchar typiskt
# dessa direkt; stubbarna här finns för att `mock.patch("…fs.model_registry_*")`
# ska kunna binda attributet utan AttributeError.


def model_drift_col() -> _Col:
    return _Col(STATE.setdefault("model_drift", {}), deletable=True, writable=True)


def model_drift_doc(finding_id: str) -> _DocRef:
    return _DocRef(finding_id, STATE.setdefault("model_drift", {}).get(finding_id))


def iter_model_drift():
    return list(STATE.get("model_drift", {}).items())


def model_registry_snapshots_col() -> _Col:
    return _Col(STATE.setdefault("model_registry_snapshots", {}), deletable=True, writable=True)


def model_registry_snapshot_doc(role: str) -> _DocRef:
    return _DocRef(role, STATE.setdefault("model_registry_snapshots", {}).get(role))


def iter_model_registry_snapshots():
    return list(STATE.get("model_registry_snapshots", {}).items())


# Installera som firestore_client (vinner eftersom fakefs importeras först).
reset()
sys.modules["firestore_client"] = sys.modules[__name__]
