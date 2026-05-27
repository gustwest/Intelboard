"""Cloud Run Job: quarterly-linkedin-todo (spec §4.1).

Triggas dagligen via Cloud Scheduler (lättviktigt idempotent jobb). För varje kund
som det inte laddats upp LinkedIn-kapacitetsdata för på ~90 dagar skapas en intern
To-Do + en notifiering till ops-teamet (vi samlar in datan själva, inte kunden). En
öppen To-Do skapas aldrig i dubbel.

Vi använder Cloud Scheduler + Cloud Run Jobs (inte Celery Beat som i spec-utkastet) —
det är plattformens mönster för bakgrundsjobb här.

    gcloud run jobs deploy quarterly-linkedin-todo \\
      --image=.../insider-graph-api:latest \\
      --command python --args -m,jobs.quarterly_todo \\
      --region europe-north1
"""
import logging
import uuid
from datetime import datetime, timezone

from google.cloud import firestore

import firestore_client as fs
from jobs._run_tracker import record_run

log = logging.getLogger("jobs.quarterly_todo")

QUARTER_DAYS = 90
TODO_TYPE = "linkedin_quarterly"
CONNECTOR_ID = "linkedin_capacity"  # påminnelsen gäller bara kunder med connectorn på
# Internt: vi samlar in och laddar upp kundens LinkedIn-kapacitetsdata själva.
TODO_MESSAGE = "Dags att samla in och ladda upp kvartalsvis LinkedIn-kapacitetsdata"


def run() -> None:
    for client_id, client in fs.iter_clients():
        try:
            run_for_client(client_id, client)
        except Exception:  # en kund får inte fälla hela körningen
            log.exception("quarterly_todo failed for client %s", client_id)


def run_for_client(client_id: str, client: dict | None = None, now: datetime | None = None) -> bool:
    """Skapa en kvartals-To-Do om det är dags. Returnerar True om en skapades."""
    now = now or datetime.now(timezone.utc)

    if CONNECTOR_ID not in (client or {}).get("active_connectors", []):
        return False  # connectorn ej påslagen för kunden

    with record_run("quarterly_todo", client_id) as r:
        if _has_open_quarterly_todo(client_id):
            r.summary = {"created": False}
            return False  # redan påmind, väntar på uppladdning
        if not _is_due(client_id, now):
            r.summary = {"created": False}
            return False

        todo_id = "todo-" + uuid.uuid4().hex[:12]
        fs.todo_doc(client_id, todo_id).set(
            {
                "type": TODO_TYPE,
                "status": "open",
                "message": TODO_MESSAGE,
                "created_at": firestore.SERVER_TIMESTAMP,
            }
        )
        _notify(client_id, client or {})
        log.info("quarterly_todo %s: created To-Do %s", client_id, todo_id)
        r.summary = {"created": True}
        return True


def _has_open_quarterly_todo(client_id: str) -> bool:
    return any(
        t.get("type") == TODO_TYPE and t.get("status") == "open"
        for _tid, t in fs.iter_todos(client_id)
    )


def _is_due(client_id: str, now: datetime) -> bool:
    """Dags om det aldrig laddats upp, eller om senaste uppladdningen är > 90 dagar."""
    latest = None
    for _sid, s in fs.iter_linkedin_snapshots(client_id):
        ts = _as_dt(s.get("uploaded_at"))
        if ts and (latest is None or ts > latest):
            latest = ts
    if latest is None:
        return True
    return (now - latest).days >= QUARTER_DAYS


def _as_dt(value) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None


# Module-level seam (patchas i tester).
def _notify(client_id: str, client: dict) -> None:
    from services import notifications

    notifications.send_quarterly_reminder(client_id, client, TODO_MESSAGE)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    run()
