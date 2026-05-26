"""Cloud Run Job: extract-all-claims.

Iterar alla kunder och kör narrativ claims-extraktion (fritext → narrative-claims)
per kund. Wraps services.claim_extraction för att vara cron-triggable utan
per-kund-argument — speglar jobs.compile_all_schemas.

Schemaläggs efter scrape-jobben och FÖRE compile-all, så dagens nya claims hinner
med i JSON-LD:n. Idempotent: claim-id härleds deterministiskt, så omkörning skriver
över i stället för att hopa dubbletter.
"""
import logging

import firestore_client as fs
from services.claim_extraction import extract_claims_for_client

log = logging.getLogger("jobs.extract_all_claims")


def run() -> None:
    written = clients = 0
    for client_id, _ in fs.iter_clients():
        try:
            result = extract_claims_for_client(client_id)
            written += int(result.get("written", 0))
            clients += 1
        except Exception:  # en kund får inte fälla hela fan-outen
            log.exception("claim-extraktion misslyckades för %s", client_id)
    log.info("extract-all-claims: %d claim(s) skrivna över %d kund(er)", written, clients)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    run()
