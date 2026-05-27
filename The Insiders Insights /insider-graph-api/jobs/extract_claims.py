"""Cloud Run Job: extract-claims.

Kör narrativ claims-extraktion (fritext → narrative-claims) för en kund och
persisterar resultatet i claims-collectionen. Triggas manuellt eller schemalagt.

Kedjar compile-schema automatiskt efteråt så de nya claimsen projiceras direkt
in i JSON-LD/profilsidan — beroendet går extract → compile, och compile är
idempotent (change-agent hoppar över uppladdning om grafen är oförändrad).
"""
import argparse
import logging

from jobs._run_tracker import record_run
from services.claim_extraction import extract_claims_for_client
from services.culture_extraction import extract_culture_for_client

log = logging.getLogger("jobs.extract_claims")


def run(client_id: str) -> None:
    with record_run("extract_claims", client_id) as r:
        result = extract_claims_for_client(client_id)
        log.info("claim extraction for %s: %s", client_id, result)
        print(result)
        r.summary = {"result": str(result)[:300]}

    # Culture-signaler ur samma webbkorpus → grundade culture-claims (humaniseringslagret).
    # Egen körning i job_runs; hash-guarden hoppar över LLM:en när webben är oförändrad.
    with record_run("extract_culture", client_id) as r:
        culture = extract_culture_for_client(client_id)
        log.info("culture extraction for %s: %s", client_id, culture)
        r.summary = {"result": str(culture)[:300]}

    # Projicera de nya claimsen in i leveransen (JSON-LD/profilsida/llms.txt).
    # Best-effort — får aldrig fälla extraktionen, som redan är registrerad ovan.
    # compile_schema öppnar sin egen record_run så körningen syns separat i job_runs.
    try:
        from jobs import compile_schema

        compile_schema.run(client_id)
    except Exception as exc:  # noqa: BLE001
        log.warning("chained compile_schema failed for %s (non-fatal): %s", client_id, exc)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    parser = argparse.ArgumentParser()
    parser.add_argument("--client-id", required=True)
    args = parser.parse_args()
    run(args.client_id)
