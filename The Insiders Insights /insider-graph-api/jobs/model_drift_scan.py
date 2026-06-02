"""Cloud Run Job: model-drift-scan.

Veckovis sanity-check att systemet kör de modeller services/model_registry säger.
Policy: alltid senaste stabla — varje avvikelse är ett bugg-läge, men driften
flaggar bara i inboxen (blockerar inte deploy, så ops kan reagera kontrollerat).

Hittar tre sorters drift:

  1. **behind-latest**   model_registry.<role>.model_id != latest_known. Alltid
     `warning` — registret ska aldrig vara i detta läge under normal drift.
  2. **stale-checked**   latest_known är äldre än 90 dagar — providerns katalog
     kan ha dragit ifrån utan att vi vet.
  3. **unauthorized-hardcode**  Greppar repot efter model-ID-mönster (claude-*,
     gpt-*, gemini-*) och rapporterar träffar som INTE finns i registrets
     `authorized_model_ids()` ELLER ligger i tillåtna whitelist-paths (tester,
     dokumentation, agent.log).

Drift-findings skrivs till firestore-collection `model_drift_findings`
(idempotent: samma drift → samma doc-id). Inboxen plockar upp dem som en egen
kategori. Findings som inte längre dyker upp i scanning raderas i samma pass.

Körs som Cloud Run Job, schemalagt veckovis (måndagar 02:30 — innan compile-passet
kl 05). Failar aldrig deploy. Loggar antal findings i job_runs.summary.
"""
from __future__ import annotations

import hashlib
import logging
import os
import re
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Iterable

from google.cloud import firestore

import firestore_client as fs
from jobs._run_tracker import log_event, record_run
from services import model_registry

log = logging.getLogger("jobs.model_drift_scan")

# Repo-roten är två steg upp från denna fil (insider-graph-api/jobs/). I Cloud Run-
# imagen kopieras bara insider-graph-api/ in, så scan av frontend/backend skippas
# där (file-not-found = no-op). Lokal körning från repo-roten ger full täckning.
_REPO_ROOT = Path(__file__).resolve().parents[2]

# Paths att skanna (relativt repo-roten). Saknad katalog tolereras → no-op.
_SCAN_PATHS = (
    "insider-graph-api",
    "frontend/src",
    "backend",
)

# Filer/kataloger att hoppa över i grep-passet — strängarna ÄR tillåtna här:
# tester använder fixturer, docs förklarar valet, agent-loggar är historiska
# transkript, och venv/node_modules är tredje-parts kod vi inte äger.
_SKIP_PATTERNS = (
    re.compile(r"/tests?/"),
    re.compile(r"\.test\."),
    re.compile(r"/docs?/"),
    re.compile(r"/__pycache__/"),
    re.compile(r"/venv/"),                 # tredje-parts (Python deps)
    re.compile(r"/\.venv/"),               # tredje-parts (Python deps)
    re.compile(r"/node_modules/"),         # tredje-parts (npm deps)
    re.compile(r"/site-packages/"),        # tredje-parts (installerad Python)
    re.compile(r"/\.next/"),               # next-byggcache
    re.compile(r"\.md$"),
    re.compile(r"\.log$"),
    re.compile(r"agent-poll\.mjs$"),       # operativ override, ej kund-yta
    re.compile(r"start-agents\.sh$"),      # operativ override, ej kund-yta
    re.compile(r"services/model_registry\.py$"),  # registret SJÄLVT
    re.compile(r"lib/aiModels\.ts$"),      # frontend-speglingen (uppdateras manuellt)
)

# Mönster för det vi greppar efter. Håll listan smal — falska positiva irriterar
# mer än de hjälper. Lägg till nya familjer när nya leverantörer kopplas in.
_MODEL_ID_PATTERNS = (
    re.compile(r"\bclaude-(?:opus|sonnet|haiku)-[0-9][0-9a-z.\-]*\b"),
    re.compile(r"\bgpt-[0-9][0-9a-z.\-]*\b"),
    re.compile(r"\bgemini-[0-9][0-9a-z.\-]*\b"),
)

# Filändelser som är värda att läsa. Binär/ovanlig text hoppas över.
_TEXT_SUFFIXES = {".py", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".sh", ".yaml", ".yml"}


# --- offentlig run ---------------------------------------------------------


def run() -> dict[str, int]:
    """Entry point. Skannar registret + filsystemet, persisterar findings, returnerar
    en summering. Säker att köra som no-op om Firestore är otillgängligt (tracker
    fångar det)."""
    with record_run("model_drift_scan", client_id=None) as r:
        findings = list(_collect_findings(today=_today_iso()))
        _persist(findings)
        changes = _detect_and_record_changes()
        summary = {
            "total": len(findings),
            "behind_latest": sum(1 for f in findings if f["kind"] == "behind_latest"),
            "stale_checked": sum(1 for f in findings if f["kind"] == "stale_checked"),
            "unauthorized_hardcode": sum(1 for f in findings if f["kind"] == "unauthorized_hardcode"),
            "model_changes": changes,
        }
        r.summary = summary
        log.info("model_drift_scan finished: %s", summary)
        return summary


# --- change-detection (kalibreringsbrytning) ---------------------------------


def _detect_and_record_changes() -> int:
    """Jämför aktuellt registry mot senast lagrade snapshot per roll. Diff →
    event:model_changed i job_runs (driver brytlinjen i AI-synlighet-tidsserier),
    och snapshot uppdateras så nästa körning startar från denna baseline.

    Första gången en roll dyker upp i registret skrivs bara baseline-snapshot
    utan event — vi vill inte tolka 'första observation' som en kalibreringsbrytning.
    """
    try:
        col = fs.model_registry_snapshots_col()
    except Exception:  # noqa: BLE001
        log.exception("model_drift_scan: kunde inte hämta snapshot-collection")
        return 0

    n_events = 0
    seen_roles: set[str] = set()
    for entry in model_registry.all_entries():
        seen_roles.add(entry.role)
        try:
            snap = col.document(entry.role).get()
        except Exception:  # noqa: BLE001
            log.exception("model_drift_scan: kunde inte läsa snapshot för %s", entry.role)
            continue

        current = {
            "role": entry.role,
            "model_id": entry.model_id,
            "provider": entry.provider,
            "effective_since": entry.effective_since,
        }
        if not snap.exists:
            _write_snapshot(col, entry.role, current)
            continue

        prev = snap.to_dict() or {}
        if prev.get("model_id") == entry.model_id and prev.get("provider") == entry.provider:
            continue  # ingen ändring

        # Diff → emit event och uppdatera snapshot
        log_event(
            "model_changed",
            client_id=None,
            summary={
                "role": entry.role,
                "old_model_id": prev.get("model_id"),
                "new_model_id": entry.model_id,
                "old_provider": prev.get("provider"),
                "new_provider": entry.provider,
                "effective_since": entry.effective_since,
            },
        )
        _write_snapshot(col, entry.role, current)
        n_events += 1

    # Rensa snapshot för borttagna roller (registret är källan; orphan-snapshots
    # förvirrar /api/model-changes).
    try:
        for doc in col.stream():
            if doc.id not in seen_roles:
                col.document(doc.id).delete()
    except Exception:  # noqa: BLE001
        log.exception("model_drift_scan: kunde inte städa orphan-snapshots")

    return n_events


def _write_snapshot(col: Any, role: str, payload: dict) -> None:
    try:
        col.document(role).set(
            {**payload, "captured_at": firestore.SERVER_TIMESTAMP},
            merge=True,
        )
    except Exception:  # noqa: BLE001
        log.exception("model_drift_scan: kunde inte skriva snapshot för %s", role)


# --- finding-detektion -----------------------------------------------------


def _collect_findings(today: str) -> Iterable[dict]:
    """Yieldar finding-dicts (kind/severity/title/details). Pure — ingen IO."""
    yield from _check_registry(today)
    yield from _check_hardcodes()


def _check_registry(today: str) -> Iterable[dict]:
    for entry in model_registry.behind_latest():
        yield {
            "kind": "behind_latest",
            "severity": "warning",
            "role": entry.role,
            "title": f"{entry.role}: kör {entry.model_id}, latest är {entry.latest_known}",
            "details": (
                f"Provider: {entry.provider}. Policyn är 'alltid senaste stabla' — uppdatera "
                f"services/model_registry så model_id = latest_known ({entry.latest_known})."
            ),
        }

    for entry in model_registry.stale_entries(today_iso=today, max_age_days=90):
        yield {
            "kind": "stale_checked",
            "severity": "info",
            "role": entry.role,
            "title": f"{entry.role}: latest_known ej verifierad sedan {entry.checked_at}",
            "details": (
                f"checked_at är >90 dagar gammalt — providerns katalog kan ha hunnit ifrån. "
                f"Verifiera mot {entry.provider} och uppdatera checked_at i registret."
            ),
        }


def _check_hardcodes() -> Iterable[dict]:
    authorized = model_registry.authorized_model_ids()
    for path, ids in _grep_repo():
        for model_id in ids:
            if model_id in authorized:
                continue
            yield {
                "kind": "unauthorized_hardcode",
                "severity": "warning",
                "role": None,
                "title": f"Okänd modell {model_id!r} hårdkodad i {_rel(path)}",
                "details": (
                    f"Modell-ID:t finns inte i services/model_registry.authorized_model_ids(). "
                    f"Antingen: (a) lägg till en ny ModelEntry i registret, eller (b) byt till "
                    f"model_registry.get_id('<roll>') om en befintlig roll passar."
                ),
                "path": _rel(path),
                "model_id": model_id,
            }


# --- repo-scan -------------------------------------------------------------


def _grep_repo() -> Iterable[tuple[Path, set[str]]]:
    for base in _SCAN_PATHS:
        root = _REPO_ROOT / base
        if not root.exists():
            continue
        for path in root.rglob("*"):
            if not path.is_file() or path.suffix not in _TEXT_SUFFIXES:
                continue
            rel = str(path)
            if any(p.search(rel) for p in _SKIP_PATTERNS):
                continue
            ids = _extract_ids(path)
            if ids:
                yield path, ids


def _extract_ids(path: Path) -> set[str]:
    try:
        text = path.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return set()
    found: set[str] = set()
    for pat in _MODEL_ID_PATTERNS:
        found.update(pat.findall(text))
    return found


def _rel(path: Path) -> str:
    try:
        return str(path.relative_to(_REPO_ROOT))
    except ValueError:
        return str(path)


# --- persistens ------------------------------------------------------------


def _finding_id(finding: dict) -> str:
    """Idempotent doc-id: samma drift → samma id, så vi inte ackumulerar dubbletter."""
    key = "|".join([
        finding["kind"],
        finding.get("role") or "",
        finding.get("path") or "",
        finding.get("model_id") or "",
    ])
    return hashlib.sha1(key.encode("utf-8")).hexdigest()[:24]


def _persist(findings: list[dict]) -> None:
    """Skriver finding-docs och raderar de som inte längre dyker upp."""
    try:
        col = fs.model_drift_col()
    except Exception:  # noqa: BLE001
        log.exception("model_drift_scan: kunde inte hämta firestore-collection")
        return

    now = datetime.now(timezone.utc)
    current_ids: set[str] = set()
    for finding in findings:
        fid = _finding_id(finding)
        current_ids.add(fid)
        try:
            col.document(fid).set(
                {
                    **finding,
                    "id": fid,
                    "status": "open",      # samma "open"→"resolved"-konvention som inboxen
                    "last_seen_at": now,
                },
                merge=True,
            )
        except Exception:  # noqa: BLE001
            log.exception("model_drift_scan: misslyckades skriva finding %s", fid)

    # Sopa: doc som inte längre matchar → ta bort. Vill inte ha "spöken".
    try:
        for snap in col.stream():
            if snap.id not in current_ids:
                col.document(snap.id).delete()
    except Exception:  # noqa: BLE001
        log.exception("model_drift_scan: kunde inte städa gamla findings")


def _today_iso() -> str:
    return date.today().isoformat()


if __name__ == "__main__":  # tillåt manuell körning: python -m jobs.model_drift_scan
    logging.basicConfig(level=logging.INFO)
    run()
