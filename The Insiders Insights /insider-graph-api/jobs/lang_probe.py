"""Cloud Run Job: lang-probe (C2 — sv-vs-en språkexperiment).

Kör `services.lang_probe.run_experiment` för EN kund och persisterar aggregatet till
`polling_results/lang-probe-latest`, så språkbeslutet (C3, docs/leverans-arbetsplan.md
§C3) kan läsas av ops/frontend i efterhand i stället för att bara ligga i jobbloggen.

C2 är ett **ad-hoc-experiment per kund**, inte ett återkommande fan-out — det körs
riktat när vi vill ha färskt sv/en-underlag för en pilotkund. Därför ingen Cloud
Scheduler-trigg (jfr warmth-probes); jobbet triggas manuellt med args-override:

    gcloud run jobs execute lang-probe --region=europe-north1 \
      --args="-m,jobs.lang_probe,--client-id,<id>" --wait

Kräver probe-motor-nycklar — de finns på jobbet via Secret Manager (OPENAI/GEMINI/
PERPLEXITY/ANTHROPIC), inte i den lokala miljön. Speglar `--client-id`-mönstret i
jobs/warmth_probes.run_one.
"""
from __future__ import annotations

import argparse
import logging
from datetime import datetime, timezone
from typing import Any

import firestore_client as fs
from jobs._run_tracker import record_run
from services.lang_probe import run_experiment

log = logging.getLogger("jobs.lang_probe")

# Levande tillstånd: överskrivs per körning (samma mönster som warmth-latest).
RESULT_DOC = "lang-probe-latest"


def run_one(client_id: str, runs: int = 5) -> dict[str, Any]:
    """Kör C2 för en kund, persistera aggregatet, returnera resultatet."""
    with record_run("lang_probe", client_id) as r:
        result = run_experiment(client_id, runs=runs)
        _persist(client_id, result, runs)
        winners = {e: d.get("winner") for e, d in result.get("per_engine", {}).items()}
        r.summary = {"pairs": result.get("pairs", 0), "runs": runs, "winners": winners}
        log.info("lang-probe %s: pairs=%s winners=%s", client_id, result.get("pairs"), winners)
        return result


def _persist(client_id: str, result: dict[str, Any], runs: int) -> None:
    """Skriv aggregatet till polling_results/lang-probe-latest. Rå `rows` utelämnas —
    per_engine-aggregatet (omnämnandegrad + signifikans + vinnare per motor) är det som
    matar C3. Best-effort: persistering får aldrig fälla jobbet."""
    try:
        fs.polling_results_col(client_id).document(RESULT_DOC).set(
            {
                "kind": "lang_probe",
                "computed_at": datetime.now(timezone.utc).isoformat(),
                "company": result.get("company"),
                "pairs": result.get("pairs", 0),
                "runs": runs,
                "per_engine": result.get("per_engine", {}),
            },
            merge=True,
        )
    except Exception:  # noqa: BLE001
        log.exception("lang-probe: kunde inte persistera resultat för %s", client_id)


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    parser = argparse.ArgumentParser(description="C2 sv-vs-en språkexperiment (en kund)")
    parser.add_argument("--client-id", required=True)
    parser.add_argument("--runs", type=int, default=5,
                        help="antal körningar per (fråga × språk × motor), default 5")
    args = parser.parse_args()
    run_one(args.client_id, runs=args.runs)


if __name__ == "__main__":
    main()
