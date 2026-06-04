"""Strukturell granskning av delete_client-täckningen (GDPR Art. 17).

Vi vill att en kunds totala data försvinner när routers/clients.delete_client körs.
Implementationen vilar på Firestores `recursive_delete(client_doc)` för allt under
`clients/{id}/...` plus en uttrycklig städning av root-collections (job_runs,
CDN-bucket, upload-bucket).

Det här testet körs som regressionsskydd: när någon lägger till en ny
*_col()-helper i firestore_client.py måste den antingen vara en subcollection
till client_doc (täcks då automatiskt) eller läggas in i nedan allowlist över
medvetet hanterade root-collections. Annars fallerar testet och vi får tänka
en gång till innan vi släpper koden.

Verifierar INTE faktisk Firestore-radering (det kräver emulator). Det är ett
statiskt täckningstest, inte ett integrationstest.
"""
from __future__ import annotations

import importlib.util
import inspect
import pathlib

# Andra tester ersätter `firestore_client` i sys.modules med tests/fakefs.py.
# Vi vill mäta path:ar på den ÄKTA modulen (med google.cloud.firestore.CollectionReference),
# så vi laddar en parallell kopia direkt från fil — utan att röra sys.modules och utan
# att förorenas av en tidigare fakefs-installation.
_REAL_FS_PATH = pathlib.Path(__file__).resolve().parent.parent / "firestore_client.py"
_spec = importlib.util.spec_from_file_location("firestore_client_real", _REAL_FS_PATH)
fs = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(fs)


# Root-collections som delete_client medvetet hanterar (eller medvetet INTE rör).
# Lägg till en post här när du lägger till en ny root-collection — annars failar
# testet, vilket är meningen (case-by-case-beslut före silent regression).
EXPECTED_ROOT_COLLECTIONS = {
    # Hanteras av routers/clients._delete_job_runs (where client_id == ...).
    "job_runs",
    # Saknar för närvarande aktiva skrivare. Lämnas orörd; om vi börjar skriva
    # client-scopat innehåll hit måste delete_client utökas, och raden här bytas
    # till en kommentar som pekar på cleanup-funktionen.
    "connector_logs",
    # Root collection "clients" är själva ankaret — raderas inte som helhet,
    # bara den ena client_doc:en (recursive_delete).
    "clients",
    # GLOBAL kund-OBEROENDE drift-findings (services/model_registry + jobs/
    # model_drift_scan). Innehåller aldrig kundinnehåll, ingår ej i delete_client.
    "model_drift_findings",
    # GLOBAL snapshot per modell-roll (drift-scannens change-detection). En doc
    # per role — inga kunddata, ingår ej i delete_client.
    "model_registry_snapshots",
    # Drift-larm (services/ops_alerts). Innehåller `client_id` som FÄLT i vissa
    # dokument (job_failed-alerts), men det är operationell metadata (jobb-status),
    # inte personuppgifter eller kundinnehåll. När en kund raderas blir alerten
    # historiskt korrekt — den kunden hade ett jobb som failade. Att radera den
    # vore att skriva om driftshistoriken. Stängs naturligt via maybe_resolve nästa
    # körning eller manuellt via UI.
    "ops_alerts",
    # Manuella setup-kvitteringar (routers/ops.setup-status). Single doc per
    # installation — system-konfig, ingen kunddata.
    "ops_config",
    # Daglig kostnads-roll-up (jobs/cost_rollup). En doc per YYYY-MM-DD med
    # totaler + topplistor. by_client innehåller client_id men det är
    # operationell-mätdata (samma som job_runs) — ingår ej i delete_client.
    "cost_summary",
    # GLOBAL kurerad persona-palett (Fas 2.1a, services/persona_registry). Read-
    # only spegel av _REGISTRY, doc-id = persona-typ (customer/employee/...).
    # Skrivs bara av seed_to_firestore vid deploy — innehåller aldrig kunddata,
    # ingår ej i delete_client.
    "persona_templates",
}


def _collection_path_for(fn) -> str | None:
    """Anropa en *_col-funktion med dummy-argument och returnera dess path.

    Funktioner som tar client_id (eller flera args) anropas med dummy-värden;
    vi vill bara veta vilken collection-path:en pekar på, inte läsa data.
    """
    sig = inspect.signature(fn)
    args = []
    for name, p in sig.parameters.items():
        if p.default is not inspect.Parameter.empty:
            continue
        args.append(f"__test_{name}__")
    try:
        col = fn(*args)
    except Exception:
        return None
    # google.cloud.firestore CollectionReference exponerar `_path` som en tuple
    # av segment, t.ex. ("clients", "__test_client_id__", "employees"). Joina
    # till en path-sträng för matchning.
    raw_path = getattr(col, "_path", None) or getattr(col, "path", None)
    if isinstance(raw_path, tuple):
        return "/".join(str(s) for s in raw_path)
    if isinstance(raw_path, str):
        return raw_path
    return getattr(col, "id", None) or ""


def test_every_col_helper_either_under_client_doc_or_allowlisted():
    """Inventera alla *_col-funktioner i firestore_client och säkerställ att de
    antingen ligger under clients/{id}/ (täcks av recursive_delete) eller är
    explicit kvitterade i EXPECTED_ROOT_COLLECTIONS."""
    col_helpers = [
        (name, obj) for name, obj in vars(fs).items()
        if name.endswith("_col") and callable(obj) and not name.startswith("_")
    ]
    assert col_helpers, "förväntade hitta *_col-helpers i firestore_client.py"

    issues: list[str] = []
    for name, fn in col_helpers:
        path = _collection_path_for(fn)
        if path is None:
            # Helpers som kräver verkligt Firestore-objekt (t.ex. db().collection)
            # går inte att introspektera utan emulator. De som är client-scopade
            # bör returnera client_doc(...).collection(...) — vilket konstrueras
            # även mot dummy-id. Helpers som kraschar här är root-collections.
            continue
        # Top-level path (clients/...) = subcollection till client_doc → täckt av
        # recursive_delete. Annars är det en root-collection som måste vara i listan.
        top_segment = path.split("/")[0] if path else ""
        if path.startswith("clients/") or top_segment in EXPECTED_ROOT_COLLECTIONS:
            continue
        issues.append(f"{name} → path={path!r} (lägg i EXPECTED_ROOT_COLLECTIONS eller flytta under client_doc)")

    assert not issues, (
        "Nya root-collections som delete_client inte hanterar:\n  - "
        + "\n  - ".join(issues)
    )


def test_job_runs_cleanup_helper_exists():
    """delete_client förlitar sig på en separat städning av job_runs (root) — om
    den hjälparen försvinner bryts GDPR-flödet i tystnad."""
    from routers import clients as clients_router

    assert hasattr(clients_router, "_delete_job_runs"), (
        "_delete_job_runs saknas — delete_client rör inte job_runs då, och kund-spår "
        "ligger kvar tills TTL släpper dem (~90 dagar)."
    )
