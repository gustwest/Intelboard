"""Cloud Run Job: risk-detect-all.

Veckovis fan-out av GEO-riskloopens skiva 1 (efter polling/warmth-probes). Kör de
GODKÄNDA frågorna mot motorerna för ALLA kunder, klassar svaren mot skademodellen och
persisterar findings. Kunder utan godkända frågor blir en no-op (review-grinden gäller).

Generering (risk-generate) + review är avsiktligt INTE del av denna loop — den körs
manuellt när kundens kontext ändras.

Sharded: läser CLOUD_RUN_TASK_INDEX/COUNT så jobbet kan köras med --tasks N på Cloud
Run Jobs. Varje task tar 1/N av kunderna via stabil hash; samma kund hamnar i samma
shard mellan körningar. Utan env-vars (lokalt) körs alla kunder seriellt som tidigare.
"""
import logging

import firestore_client as fs
from jobs._run_tracker import record_run
from services.risk_detector import run_for_client

log = logging.getLogger("jobs.risk_detect_all")


def run() -> None:
    task_index, task_count = fs.shard_from_env()
    log.info("risk-detect: shard %d/%d", task_index, task_count)
    count = 0
    findings_total = 0
    for client_id in fs.iter_client_ids_shard(task_index, task_count):
        try:
            with record_run("risk_detect", client_id) as r:
                result = run_for_client(client_id)
                if result:
                    r.summary = {
                        "questions_asked": result.questions_asked,
                        "findings": len(result.findings),
                    }
                    findings_total += len(result.findings)
                    count += 1
        except Exception as exc:
            log.exception("risk-detect failed for %s: %s", client_id, exc)
    log.info(
        "risk-detect (shard %d/%d): körde %d kund(er), %d findings totalt",
        task_index, task_count, count, findings_total,
    )


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    run()
