"""Firestore-helpers.

Collection-layout speglar spec.md sektion 02:

    clients/{client_id}
        employees/{employee_id}
            raw_items/{item_id}
        polling_results/{week_id}
    connector_logs/{log_id}
"""
import hashlib
import os
from functools import lru_cache
from typing import Any, Callable, Iterator

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


def write_claim_preserving_review(
    client_id: str, claim_id: str, build: Callable[[dict[str, Any]], dict[str, Any]]
) -> None:
    """Transaktionell read-modify-write på ett claim-dokument.

    `build(existing)` får det nuvarande dokumentet (tom dict om nytt) och returnerar
    payloaden som ska skrivas. Läsning + skrivning sker i SAMMA transaktion, vilket
    stänger lost-update-racet mot granskningsflödets .update(): utan transaktion kan
    (om)extraktionen läsa "inget beslut", en operatör hinner godkänna däremellan, och
    extraktionen skriver sedan över beslutet. Används av claim_extraction för att hålla
    review_status/needs_review m.m. intakta över ett schemalagt omkörnings-pass.
    """
    ref = claim_doc(client_id, claim_id)
    transaction = db().transaction()

    @firestore.transactional
    def _apply(txn) -> None:
        snap = ref.get(transaction=txn)
        txn.set(ref, build(snap.to_dict() or {}))

    _apply(transaction)


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


def output_quality_logs_col(client_id: str):
    """Shadow-mode-loggar från output-kvalitets-rubric:en (services/output_quality_shadow).

    Skrivs som best-effort vid varje compile_schema-körning. Driver framtida
    connector-score-vyn (steg 5) och promotion-beslut (shadow → active gate)."""
    return client_doc(client_id).collection("output_quality_logs")


def output_quality_log_doc(client_id: str, log_id: str):
    return output_quality_logs_col(client_id).document(log_id)


def iter_output_quality_logs(client_id: str) -> Iterator[tuple[str, dict[str, Any]]]:
    for doc in output_quality_logs_col(client_id).stream():
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


def trust_gap_doc(client_id: str):
    """Levande Förtroendegap-tillstånd (docs/humanization-trust-gap-spec.md §5.5).
    Ett dok per kund, överskrivs av compute_trust_gap."""
    return client_doc(client_id).collection("trust_gap").document("latest")


def trust_gap_snapshots_col(client_id: str):
    return client_doc(client_id).collection("trust_gap_snapshots")


def trust_gap_snapshot_doc(client_id: str, date: str):
    """Daterad, immutabel snapshot (§5.6) — ger trendlinjen."""
    return trust_gap_snapshots_col(client_id).document(date)


def iter_trust_gap_snapshots(client_id: str) -> Iterator[tuple[str, dict[str, Any]]]:
    for doc in trust_gap_snapshots_col(client_id).stream():
        yield doc.id, doc.to_dict() or {}


def recipes_col(client_id: str):
    """Receptmotorns persisterade DetailedRecipe-dokument (Fas 1.3c, spec §10 punkt 5).
    Ett doc per gap-typ+dimension; deterministisk id för idempotens vid re-generering."""
    return client_doc(client_id).collection("recipes")


def recipe_doc(client_id: str, recipe_id: str):
    return recipes_col(client_id).document(recipe_id)


def iter_recipes(client_id: str) -> Iterator[tuple[str, dict[str, Any]]]:
    for doc in recipes_col(client_id).stream():
        yield doc.id, doc.to_dict() or {}


def interventions_col(client_id: str):
    """Sluten-loop-interventioner (Fas 1.4): baseline + uppföljning av acted recept.
    Ett doc per intervention; deterministisk id på (recipe_id, acted_at)."""
    return client_doc(client_id).collection("interventions")


def intervention_doc(client_id: str, intervention_id: str):
    return interventions_col(client_id).document(intervention_id)


def iter_interventions(client_id: str) -> Iterator[tuple[str, dict[str, Any]]]:
    for doc in interventions_col(client_id).stream():
        yield doc.id, doc.to_dict() or {}


def cost_budget_doc(client_id: str):
    """Per-kund-konfig för LLM-token-budgeten (Fas 1.6). Ett doc per kund;
    månadens räknare ligger i cost_usage_doc per YYYY-MM."""
    return client_doc(client_id).collection("cost_budget").document("current")


def cost_usage_doc(client_id: str, month: str):
    """Månadsräknare (YYYY-MM) — input_tokens, output_tokens, calls. Skrivs
    atomiskt med firestore.Increment så samtidiga LLM-anrop inte race:ar."""
    return client_doc(client_id).collection("cost_usage").document(month)


def iter_cost_usage(client_id: str) -> Iterator[tuple[str, dict[str, Any]]]:
    for doc in client_doc(client_id).collection("cost_usage").stream():
        yield doc.id, doc.to_dict() or {}


def persona_templates_col():
    """Global palett av probe-templates per persona (Fas 2.1a, Nivå 2).

    Read-only spegel av services/persona_registry._REGISTRY — frontend renderar
    detta så operatörer kan kvalitetskolla probe-frågorna. Skrivs av
    persona_registry.seed_to_firestore() vid deploy/bootstrap; aldrig från UI.
    Doc-id = persona-id (customer, employee, ...)."""
    return db().collection("persona_templates")


def persona_template_doc(persona_id: str):
    return persona_templates_col().document(persona_id)


def iter_persona_templates() -> Iterator[tuple[str, dict[str, Any]]]:
    for doc in persona_templates_col().stream():
        yield doc.id, doc.to_dict() or {}


def verifications_col(client_id: str):
    """Manuella Geogiraph-verifieringar (docs/humanization-trust-gap-spec.md §5.4)."""
    return client_doc(client_id).collection("verifications")


def verification_doc(client_id: str, verification_id: str):
    return verifications_col(client_id).document(verification_id)


def iter_verifications(client_id: str) -> Iterator[tuple[str, dict[str, Any]]]:
    for doc in verifications_col(client_id).stream():
        yield doc.id, doc.to_dict() or {}


def connector_logs_col():
    return db().collection("connector_logs")


def iter_clients() -> Iterator[tuple[str, dict[str, Any]]]:
    for doc in clients_col().stream():
        yield doc.id, doc.to_dict() or {}


def iter_client_ids() -> Iterator[str]:
    """Streamar bara dokument-IDs (tomt fält-projektion → billigare än full dokumentläsning).
    Används av sharded fan-out där tasken ändå läser kunden på nytt per ID."""
    for doc in clients_col().select([]).stream():
        yield doc.id


def iter_client_ids_shard(task_index: int, task_count: int) -> Iterator[str]:
    """Returnerar de client-IDs som denna task ska köra i en sharded fan-out.

    Stabil hash (sha1) säkrar att samma kund hamnar i samma shard mellan körningar,
    vilket håller jobb-tidsserien per kund konsistent (job_runs.client_id) och låter
    Firestore-cachning vara effektiv. Med task_count<=1 returneras alla IDs."""
    if task_count <= 1:
        yield from iter_client_ids()
        return
    if not (0 <= task_index < task_count):
        raise ValueError(f"task_index {task_index} out of range for task_count {task_count}")
    for client_id in iter_client_ids():
        bucket = int(hashlib.sha1(client_id.encode("utf-8")).hexdigest(), 16) % task_count
        if bucket == task_index:
            yield client_id


def shard_from_env() -> tuple[int, int]:
    """(task_index, task_count) från Cloud Run Jobs env. Fallback till (0, 1) lokalt
    så jobben kan köras enkelt utanför Cloud Run (manuell körning, pytest)."""
    return (
        int(os.environ.get("CLOUD_RUN_TASK_INDEX", "0")),
        int(os.environ.get("CLOUD_RUN_TASK_COUNT", "1")),
    )


def iter_employees(client_id: str) -> Iterator[tuple[str, dict[str, Any]]]:
    for doc in employees_col(client_id).stream():
        yield doc.id, doc.to_dict() or {}


# --- Körningsspår (job_runs) --------------------------------------------------
# En global tidsserie-collection: ett dokument per jobbkörning (per arbetsenhet,
# dvs per kund där jobbet är kund-scopat, annars globalt). Driver körningshistorik
# i UI:t och "senast körd"-stämplar. Skrivs av jobs/_run_tracker.record_run.


def job_runs_col():
    return db().collection("job_runs")


def job_run_doc(run_id: str):
    return job_runs_col().document(run_id)


def iter_job_runs() -> Iterator[tuple[str, dict[str, Any]]]:
    for doc in job_runs_col().stream():
        yield doc.id, doc.to_dict() or {}


# --- Modelldrift-findings (services/model_registry + jobs/model_drift_scan) ---
# Global toppnivå-collection (inte kund-scopad). Ett dokument per finding-id,
# upskriks idempotent vid varje drift-scan-körning. Driver inboxens model-drift-
# kategori och /api/model-drift. Stale findings raderas vid scan-passet om de
# inte längre matchar koden.


def model_drift_col():
    return db().collection("model_drift_findings")


def model_drift_doc(finding_id: str):
    return model_drift_col().document(finding_id)


def iter_model_drift() -> Iterator[tuple[str, dict[str, Any]]]:
    for doc in model_drift_col().stream():
        yield doc.id, doc.to_dict() or {}


# --- Modell-registry-snapshots (för change-detection) -------------------------
# Ett doc per ROLE — innehåller senast sedda (model_id, provider, effective_since).
# jobs/model_drift_scan jämför aktuellt registry mot denna snapshot och loggar
# event:model_changed i job_runs vid diff. Tidsserierna i AI-synlighet använder
# eventen för att rita brytlinje vid modellbyte (kalibreringsskydd).


def model_registry_snapshots_col():
    return db().collection("model_registry_snapshots")


def model_registry_snapshot_doc(role: str):
    return model_registry_snapshots_col().document(role)


def iter_model_registry_snapshots() -> Iterator[tuple[str, dict[str, Any]]]:
    for doc in model_registry_snapshots_col().stream():
        yield doc.id, doc.to_dict() or {}


# --- Ops-alerts (services/ops_alerts + routers/ops) ---------------------------
# Global toppnivå-collection. Deterministisk doc-id (sha1(kind|source)) ger dedup:
# samma (kind, source) skriver alltid mot samma dokument, så återkommande failures
# ackumuleras i en alert i stället för att spamma inboxen. Drift som auto-resolveras
# (t.ex. lyckad körning efter failed) stänger samma doc.


def ops_alerts_col():
    return db().collection("ops_alerts")


def ops_alert_doc(alert_id: str):
    return ops_alerts_col().document(alert_id)


def iter_ops_alerts() -> Iterator[tuple[str, dict[str, Any]]]:
    for doc in ops_alerts_col().stream():
        yield doc.id, doc.to_dict() or {}


# --- Ops-konfiguration (manuella setup-kvitteringar) -------------------------
# Singel doc med booleanska "har vi gjort detta?"-flaggor. Driver banner-statusen
# på alerts-sidan så ops ser om Cloud Console-kopplingen för budgetar är klar.


def ops_setup_doc():
    return db().collection("ops_config").document("setup-status")


# --- Kostnads-roll-up (jobs/cost_rollup → routers/ops) -----------------------
# En doc per dag (id = YYYY-MM-DD). Skapas/överskrivs idempotent av
# cost_rollup. Tröskel-alerts läser senaste docs för att beräkna prognos
# och per-kund-spend.


def cost_summary_col():
    return db().collection("cost_summary")


def cost_summary_doc(date_iso: str):
    return cost_summary_col().document(date_iso)


def iter_cost_summary() -> Iterator[tuple[str, dict[str, Any]]]:
    for doc in cost_summary_col().stream():
        yield doc.id, doc.to_dict() or {}
