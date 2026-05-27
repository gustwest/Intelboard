"""Cloud Run Job: polling-weekly.

Tisdag morgon. Ställer kategorifrågor till GPT-4o + Gemini, beräknar
Share of Voice, Sentiment och Parity Index, skriver till polling_results.
"""
import logging

import firestore_client as fs
from jobs._run_tracker import record_run
from services.polling import run_for_client

log = logging.getLogger("jobs.polling_weekly")


def run() -> None:
    count = 0
    for client_id, _ in fs.iter_clients():
        try:
            with record_run("polling", client_id) as r:
                result = run_for_client(client_id)
                if result:
                    log.info(
                        "polled %s: SoV=%.2f sentiment=%s parity=%s",
                        client_id,
                        result.share_of_voice,
                        result.sentiment_score,
                        result.parity_index,
                    )
                    r.summary = {
                        "share_of_voice": result.share_of_voice,
                        "sentiment_score": result.sentiment_score,
                        "parity_index": result.parity_index,
                    }
                    count += 1
        except Exception as exc:
            log.exception("polling failed for %s: %s", client_id, exc)
    log.info("polled %d clients", count)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    run()
