"""Cloud Run Job: sunset-skills (spec §3.3, Sunset Phase).

Triggas dagligen (eller veckovis) via Cloud Scheduler. Hard-deletar stängda
platsannons-noder vars `closed_at` passerat 24 månader, så vi aldrig matar
AI-motorerna med utdaterad kapacitet. Fram till dess härleds kompetenserna med
avklingande confidence (schema_org/claims.derive_skill_claims) — denna fas tar
bort själva källnoden permanent.

En kompetens som re-verifierats under tiden (ny öppen annons, eller LinkedIn-data
i Slice 4) lever vidare via *den* källan; vi raderar bara den utgångna noden.

    gcloud run jobs deploy sunset-skills \\
      --image=.../insider-graph-api:latest \\
      --command python --args -m,jobs.sunset_skills \\
      --region europe-north1
"""
import logging
from datetime import datetime, timezone

import firestore_client as fs
from services import confidence_scorer

log = logging.getLogger("jobs.sunset_skills")


def run() -> None:
    for client_id, _client in fs.iter_clients():
        try:
            run_for_client(client_id)
        except Exception:  # en kund får inte fälla hela körningen
            log.exception("sunset_skills failed for client %s", client_id)


def run_for_client(client_id: str, now: datetime | None = None) -> int:
    """Radera utgångna stängda annons-noder. Returnerar antal raderade."""
    now = now or datetime.now(timezone.utc)
    col = fs.raw_items_company_col(client_id)
    deleted = 0
    for snap in col.stream():
        raw = snap.to_dict() or {}
        if raw.get("schema_type") != "JobPosting":
            continue
        closed_at = raw.get("closed_at")
        if not closed_at:
            continue  # aktiv annons — rörs inte
        if confidence_scorer.is_sunset(closed_at, now):
            col.document(snap.id).delete()
            deleted += 1
    if deleted:
        log.info("sunset_skills %s: hard-deleted %d expired job nodes", client_id, deleted)
    return deleted


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    run()
