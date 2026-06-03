"""Cloud Run Job: cost-rollup-daily.

Läser föregående dygns job_runs, summerar `summary.tokens` per modell + kund +
jobb-typ, översätter till USD via services/cost_estimator, och skriver
`cost_summary/{YYYY-MM-DD}` så endpoint:en och UI:t kan läsa per-dag-aggregaten
billigt.

Trösklar (services/ops_alerts.raise_alert → inboxen):
  - dygnstotal > COST_DAILY_USD                → warning
  - dygnstotal > COST_DAILY_USD * 2            → critical
  - per-kund-dygn > COST_PER_CLIENT_DAILY_USD  → warning per kund
  - månadsprognos (mtd × dagar i månaden / dagar hittills) > COST_MONTHLY_FORECAST_USD → critical

När nästa dygn är under tröskel auto-resolvas motsvarande alert (samma dedup-
nyckel som öppnade den).

Schemaläggs efter att alla dagliga jobben gått (säg 03:00 — efter monthly-report
men före scrape).
"""
from __future__ import annotations

import logging
import os
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any

from google.cloud import firestore

import firestore_client as fs
from jobs._run_tracker import record_run
from services import cost_estimator, ops_alerts

log = logging.getLogger("jobs.cost_rollup")

COST_DAILY_USD = float(os.environ.get("COST_DAILY_USD", "25"))
COST_PER_CLIENT_DAILY_USD = float(os.environ.get("COST_PER_CLIENT_DAILY_USD", "5"))
COST_MONTHLY_FORECAST_USD = float(os.environ.get("COST_MONTHLY_FORECAST_USD", "1500"))


def run(date_iso: str | None = None) -> dict[str, Any]:
    """Rolla upp föregående dygns kostnad (eller specifik dag om angiven).

    Args:
        date_iso: "YYYY-MM-DD" — om None används UTC-datum för igår.
    Returns:
        Den skrivna roll-upen (för manuell verifiering).
    """
    target_date = (
        datetime.strptime(date_iso, "%Y-%m-%d").date() if date_iso
        else (datetime.now(timezone.utc) - timedelta(days=1)).date()
    )
    with record_run("cost_rollup", None) as r:
        rollup = _build_rollup(target_date)
        _persist(target_date, rollup)
        _check_thresholds(target_date, rollup)
        r.summary = {
            "date": str(target_date),
            "total_usd": rollup["total_usd"],
            "clients_with_spend": len(rollup["by_client"]),
            "unknown_models": len(rollup["unknown_models"]),
        }
    log.info("cost rollup %s: $%.2f över %d kund(er)",
             target_date, rollup["total_usd"], len(rollup["by_client"]))
    return rollup


def _build_rollup(target_date) -> dict[str, Any]:
    """Iterera job_runs för target_date och bygg aggregaten.

    Vi filtrerar i Python på started_at-fältet istället för en Firestore-fråga,
    så vi slipper composite-index. Vid stora dataset (500+ runs/dag) bör vi byta
    till en where('started_at', '>=', start) -fråga + composite index.
    """
    start = datetime.combine(target_date, datetime.min.time(), tzinfo=timezone.utc)
    end = start + timedelta(days=1)

    by_model: dict[str, dict[str, int]] = defaultdict(lambda: {"input": 0, "output": 0, "calls": 0})
    by_client: dict[str, dict[str, Any]] = defaultdict(lambda: {"input": 0, "output": 0, "calls": 0, "by_model": defaultdict(lambda: {"input": 0, "output": 0, "calls": 0})})
    by_job_type: dict[str, dict[str, Any]] = defaultdict(lambda: {"input": 0, "output": 0, "calls": 0, "runs": 0, "by_model": defaultdict(lambda: {"input": 0, "output": 0, "calls": 0})})
    unknown: set[str] = set()
    n_runs = 0

    for _rid, run_data in fs.iter_job_runs():
        started = run_data.get("started_at")
        if started is None:
            continue
        if not isinstance(started, datetime):
            continue
        if started < start or started >= end:
            continue
        n_runs += 1

        tokens = ((run_data.get("summary") or {}).get("tokens") or {})
        by_model_in_run = tokens.get("by_model") or {}
        job_type = run_data.get("job_type") or "unknown"
        client_id = run_data.get("client_id")

        by_job_type[job_type]["runs"] += 1
        for mid, u in by_model_in_run.items():
            i, o, c = int(u.get("input") or 0), int(u.get("output") or 0), int(u.get("calls") or 0)
            if not (i or o):
                continue
            by_model[mid]["input"] += i
            by_model[mid]["output"] += o
            by_model[mid]["calls"] += c
            by_job_type[job_type]["input"] += i
            by_job_type[job_type]["output"] += o
            by_job_type[job_type]["calls"] += c
            by_job_type[job_type]["by_model"][mid]["input"] += i
            by_job_type[job_type]["by_model"][mid]["output"] += o
            by_job_type[job_type]["by_model"][mid]["calls"] += c
            if client_id:
                bc = by_client[client_id]
                bc["input"] += i
                bc["output"] += o
                bc["calls"] += c
                bc["by_model"][mid]["input"] += i
                bc["by_model"][mid]["output"] += o
                bc["by_model"][mid]["calls"] += c

    # Översätt till USD och normalisera defaultdicts.
    by_model_usd = {
        mid: {**u, "usd": round(cost_estimator.usd_for(mid, u["input"], u["output"]), 6)}
        for mid, u in by_model.items()
    }
    if any(u["usd"] == 0 and (u["input"] or u["output"]) for u in by_model_usd.values()):
        for mid, u in by_model_usd.items():
            if u["usd"] == 0 and (u["input"] or u["output"]):
                unknown.add(mid)

    by_client_out: dict[str, dict[str, Any]] = {}
    for cid, bc in by_client.items():
        cm = {
            mid: {**u, "usd": round(cost_estimator.usd_for(mid, u["input"], u["output"]), 6)}
            for mid, u in bc["by_model"].items()
        }
        by_client_out[cid] = {
            "input": bc["input"],
            "output": bc["output"],
            "calls": bc["calls"],
            "by_model": cm,
            "usd": round(sum(m["usd"] for m in cm.values()), 6),
        }

    # Per-job-type-USD från jobbtypens egen modellnedbrytning. Korrekt även när
    # samma modell delas av flera jobb-typer (polling och risk_detect kör båda
    # Gemini probarna): varje jobb-typ får sin proportionella andel.
    by_job_type_out: dict[str, dict[str, Any]] = {}
    for jt, u in by_job_type.items():
        jm = {
            mid: {**mu, "usd": round(cost_estimator.usd_for(mid, mu["input"], mu["output"]), 6)}
            for mid, mu in u["by_model"].items()
        }
        by_job_type_out[jt] = {
            "input": u["input"],
            "output": u["output"],
            "calls": u["calls"],
            "runs": u["runs"],
            "by_model": jm,
            "usd": round(sum(m["usd"] for m in jm.values()), 6),
        }

    total_usd = round(sum(u["usd"] for u in by_model_usd.values()), 4)

    return {
        "date": str(target_date),
        "total_usd": total_usd,
        "total_input": sum(u["input"] for u in by_model_usd.values()),
        "total_output": sum(u["output"] for u in by_model_usd.values()),
        "total_calls": sum(u["calls"] for u in by_model_usd.values()),
        "n_runs": n_runs,
        "by_model": by_model_usd,
        "by_client": by_client_out,
        "by_job_type": by_job_type_out,
        "unknown_models": sorted(unknown),
        "computed_at": firestore.SERVER_TIMESTAMP,
    }


def _persist(target_date, rollup: dict[str, Any]) -> None:
    fs.cost_summary_doc(str(target_date)).set(rollup)


def _check_thresholds(target_date, rollup: dict[str, Any]) -> None:
    """Öppna/uppdatera ops_alerts för tröskelöverskridanden — och auto-resolva
    när läget gått tillbaka under tröskeln."""
    total = float(rollup.get("total_usd") or 0)
    date_str = str(target_date)

    # 1. Dygnstotal
    if total >= COST_DAILY_USD * 2:
        ops_alerts.raise_alert(
            kind="cost_threshold",
            source="daily_total",
            title=f"Dygnstotal kritisk: ${total:.2f} ({date_str})",
            detail=f"Tröskel: ${COST_DAILY_USD*2:.2f} (2× warning). Topp-modeller och topp-kunder finns i kostnadsfliken.",
            severity=ops_alerts.SEVERITY_CRITICAL,
            last_message=f"date={date_str} total_usd={total:.2f}",
        )
    elif total >= COST_DAILY_USD:
        ops_alerts.raise_alert(
            kind="cost_threshold",
            source="daily_total",
            title=f"Dygnstotal över tröskel: ${total:.2f} ({date_str})",
            detail=f"Tröskel: ${COST_DAILY_USD:.2f}. Kolla kostnadsfliken för drilldown.",
            severity=ops_alerts.SEVERITY_WARNING,
            last_message=f"date={date_str} total_usd={total:.2f}",
        )
    else:
        ops_alerts.maybe_resolve(kind="cost_threshold", source="daily_total", resolved_by="auto:rollup")

    # 2. Per-kund-tröskel
    for cid, bc in (rollup.get("by_client") or {}).items():
        cusd = float(bc.get("usd") or 0)
        src = f"client:{cid}"
        if cusd >= COST_PER_CLIENT_DAILY_USD:
            ops_alerts.raise_alert(
                kind="cost_threshold",
                source=src,
                title=f"Kund {cid} drog ${cusd:.2f} ({date_str})",
                detail=f"Tröskel per kund/dygn: ${COST_PER_CLIENT_DAILY_USD:.2f}. Granska godkända risk-frågor och pausa vid behov.",
                severity=ops_alerts.SEVERITY_WARNING,
                client_id=cid,
                last_message=f"date={date_str} usd={cusd:.2f}",
            )
        else:
            ops_alerts.maybe_resolve(kind="cost_threshold", source=src, resolved_by="auto:rollup")

    # 3. Månadsprognos — bara om vi har rollup på minst dag 5 (innan dess är prognosen brusig)
    try:
        mtd, days_in_month, days_so_far = _month_to_date_usd(target_date)
        if days_so_far >= 5 and days_in_month > 0:
            forecast = mtd / days_so_far * days_in_month
            if forecast >= COST_MONTHLY_FORECAST_USD:
                ops_alerts.raise_alert(
                    kind="cost_threshold",
                    source=f"monthly_forecast:{target_date.strftime('%Y-%m')}",
                    title=f"Prognos {target_date.strftime('%Y-%m')}: ${forecast:.0f} (tröskel ${COST_MONTHLY_FORECAST_USD:.0f})",
                    detail=f"Hittills ${mtd:.2f} på {days_so_far} dagar → prognos ${forecast:.2f} för månaden ({days_in_month} dagar). Justera trösklar i COST_MONTHLY_FORECAST_USD eller agera på topp-kunder.",
                    severity=ops_alerts.SEVERITY_CRITICAL,
                    last_message=f"mtd={mtd:.2f} days_so_far={days_so_far} forecast={forecast:.2f}",
                )
            else:
                ops_alerts.maybe_resolve(
                    kind="cost_threshold",
                    source=f"monthly_forecast:{target_date.strftime('%Y-%m')}",
                    resolved_by="auto:rollup",
                )
    except Exception as exc:  # noqa: BLE001 — prognos får aldrig fälla rollupen
        log.warning("forecast check failed: %s", exc)


def _month_to_date_usd(target_date) -> tuple[float, int, int]:
    """(mtd, days_in_month, days_so_far) för month-to-date USD."""
    from calendar import monthrange

    year, month = target_date.year, target_date.month
    days_in_month = monthrange(year, month)[1]
    days_so_far = target_date.day

    mtd = 0.0
    for d in range(1, days_so_far + 1):
        doc = fs.cost_summary_doc(f"{year}-{month:02d}-{d:02d}").get()
        if doc.exists:
            mtd += float((doc.to_dict() or {}).get("total_usd") or 0)
    return mtd, days_in_month, days_so_far


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    run()
