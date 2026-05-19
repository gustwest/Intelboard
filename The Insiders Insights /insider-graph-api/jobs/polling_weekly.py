"""Cloud Run Job: polling-weekly.

Veckovis. Ställer kategorifrågor till OpenAI + Gemini, mäter Share of Voice,
Sentiment och Parity Index, skriver till polling_results-collection.

Stub idag — fyller på när LangChain-pipeline är klar.
"""
import logging

import firestore_client as fs

log = logging.getLogger("jobs.polling_weekly")


def run() -> None:
    for client_id, _ in fs.iter_clients():
        log.info("polling for client %s (not yet implemented)", client_id)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    run()
