"""Cloud Run Job: risk-detect-all.

Veckovis fan-out av GEO-riskloopens skiva 1 (efter polling/warmth-probes). Kör de
GODKÄNDA frågorna mot motorerna för ALLA kunder, klassar svaren mot skademodellen och
persisterar findings. Kunder utan godkända frågor blir en no-op (review-grinden gäller).

Generering (risk-generate) + review är avsiktligt INTE del av denna loop — den körs
manuellt när kundens kontext ändras.
"""
import logging

import firestore_client as fs
from jobs._run_tracker import record_run
from services.risk_detector import run_for_client

log = logging.getLogger("jobs.risk_detect_all")


def run() -> None:
    count = 0
    findings_total = 0
    for client_id, _ in fs.iter_clients():
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
    log.info("risk-detect: körde %d kund(er), %d findings totalt", count, findings_total)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    run()
