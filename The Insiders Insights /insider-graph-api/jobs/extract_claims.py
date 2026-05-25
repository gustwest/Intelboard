"""Cloud Run Job: extract-claims.

Kör narrativ claims-extraktion (fritext → narrative-claims) för en kund och
persisterar resultatet i claims-collectionen. Triggas manuellt eller schemalagt;
kompilera schema (compile-schema) efteråt för att få ut claims i JSON-LD.
"""
import argparse
import logging

from services.claim_extraction import extract_claims_for_client

log = logging.getLogger("jobs.extract_claims")


def run(client_id: str) -> None:
    result = extract_claims_for_client(client_id)
    log.info("claim extraction for %s: %s", client_id, result)
    print(result)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    parser = argparse.ArgumentParser()
    parser.add_argument("--client-id", required=True)
    args = parser.parse_args()
    run(args.client_id)
