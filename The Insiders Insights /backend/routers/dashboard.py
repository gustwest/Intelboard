"""Dashboard analytics endpoints — aggregated data for charts.

Granularity-aware: when multiple datasets cover the same source and
overlapping time periods, the dashboard picks the finest granularity
to avoid double-counting.
"""
from collections import defaultdict
from datetime import datetime, date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

import models
from db import get_db
from logging_config import log

router = APIRouter(tags=["dashboard"])

# Priority: lower = finer grain = preferred
GRANULARITY_PRIORITY = {
    "daily": 0,
    "weekly": 1,
    "monthly": 2,
    "quarterly": 3,
    "yearly": 4,
    "aggregated": 5,
    "unknown": 6,
}


def _select_best_datasets(datasets: list) -> list:
    """Given datasets for a customer, resolve overlaps.
    
    Strategy: for each source, if multiple datasets overlap in period,
    keep only the finest-grained one for each time range.
    Datasets with unknown granularity are always included (can't dedup them).
    """
    from collections import defaultdict as dd

    # Group by source
    by_source: dict[str, list] = dd(list)
    for d in datasets:
        by_source[d.source_id].append(d)

    selected = []
    for source_id, source_datasets in by_source.items():
        if len(source_datasets) <= 1:
            selected.extend(source_datasets)
            continue

        # Separate into buckets by whether we can resolve overlap
        resolvable = []
        unresolvable = []
        for d in source_datasets:
            if d.granularity in ("unknown",) or (d.period_start is None and d.period_end is None):
                unresolvable.append(d)
            else:
                resolvable.append(d)

        # For resolvable: sort by granularity (finest first), then by period coverage
        resolvable.sort(key=lambda d: (
            GRANULARITY_PRIORITY.get(d.granularity or "unknown", 99),
            -(d.row_count or 0),
        ))

        # Greedy selection: pick finest-grain datasets, skip if fully covered
        covered_ranges: list[tuple] = []  # (start, end) already covered
        for d in resolvable:
            ds = d.period_start or date(2000, 1, 1)
            de = d.period_end or date(2099, 12, 31)

            # Check if this dataset's range is already fully covered by finer datasets
            fully_covered = False
            for cs, ce in covered_ranges:
                if cs <= ds and ce >= de:
                    fully_covered = True
                    break

            if fully_covered:
                # Skip — this is a coarser view of already-included data
                log.info(
                    "dashboard.skip_overlap",
                    dataset_id=d.id,
                    granularity=d.granularity,
                    period=f"{ds} to {de}",
                    reason="covered_by_finer",
                )
                continue

            selected.append(d)
            covered_ranges.append((ds, de))

        # Always include unresolvable (can't determine overlap)
        selected.extend(unresolvable)

    return selected


@router.get("/api/customers/{customer_id}/dashboard")
def customer_dashboard(
    customer_id: str,
    date_from: Optional[str] = Query(None, description="YYYY-MM-DD"),
    date_to: Optional[str] = Query(None, description="YYYY-MM-DD"),
    db: Session = Depends(get_db),
):
    """Aggregate metrics across all datasets for a customer.
    
    Returns:
    - summary_stats: top-level KPIs (total impressions, clicks, spend, etc.)
    - time_series: daily/weekly aggregation of key metrics
    - source_breakdown: metrics per source type
    - ai_summaries: all AI summaries for quick overview
    - granularity_info: breakdown of what granularities are being used
    """
    c = db.query(models.Customer).filter(
        (models.Customer.id == customer_id) | (models.Customer.slug == customer_id)
    ).first()
    if not c:
        raise HTTPException(404, "Customer not found")

    # Load all datasets with their sources
    all_datasets = (
        db.query(models.Dataset)
        .options(
            joinedload(models.Dataset.source),
            joinedload(models.Dataset.source_version)
            .joinedload(models.SourceVersion.mappings)
            .joinedload(models.SourceFieldMapping.source_field),
        )
        .filter_by(customer_id=c.id)
        .all()
    )

    # Select non-overlapping datasets (prefer finest granularity)
    datasets = _select_best_datasets(all_datasets)

    # Parse date filters
    d_from = datetime.strptime(date_from, "%Y-%m-%d").date() if date_from else None
    d_to = datetime.strptime(date_to, "%Y-%m-%d").date() if date_to else None

    # Metrics we're interested in
    METRIC_KEYS = {
        "impressions", "clicks", "total-spent", "reactions", "comments", "shares",
        "total-engagements", "follows", "video-views", "video-plays",
        "click-through-rate", "engagement-rate", "average-cpc", "average-cpm",
        "page-views", "unique-visitors",
    }
    DATE_KEYS = {"start-date-in-utc", "date", "day", "created-date"}

    totals = defaultdict(float)
    time_series = defaultdict(lambda: defaultdict(float))
    source_breakdown = defaultdict(lambda: defaultdict(float))
    total_rows = sum(d.row_count for d in datasets)
    ai_summaries = []

    # Track granularity usage
    granularity_counts = defaultdict(int)
    skipped_count = len(all_datasets) - len(datasets)

    for d in all_datasets:
        if d.ai_summary:
            ai_summaries.append({
                "source_name": d.source.name,
                "filename": d.original_filename,
                "summary": d.ai_summary,
                "row_count": d.row_count,
                "granularity": d.granularity or "unknown",
                "period_start": str(d.period_start) if d.period_start else None,
                "period_end": str(d.period_end) if d.period_end else None,
            })

    for d in datasets:
        granularity_counts[d.granularity or "unknown"] += 1

        # Build field map
        fields = [m.source_field for m in d.source_version.mappings]

        # Find date field and metric fields
        date_field_id = None
        metric_field_ids = {}
        for f in fields:
            if f.key in DATE_KEYS:
                date_field_id = f.id
            if f.key in METRIC_KEYS:
                metric_field_ids[f.id] = f.key

        if not metric_field_ids:
            continue

        # Load rows (limit to 2000 for perf)
        rows = (
            db.query(models.DatasetRow)
            .filter_by(dataset_id=d.id)
            .order_by(models.DatasetRow.row_index)
            .limit(2000)
            .all()
        )

        for r in rows:
            vals = r.values_json or {}

            # Parse date
            row_date = None
            if date_field_id and date_field_id in vals:
                try:
                    raw = vals[date_field_id]
                    if isinstance(raw, str) and len(raw) >= 10:
                        row_date = date.fromisoformat(raw[:10])
                except (ValueError, TypeError):
                    pass

            # Apply date filter
            if d_from and row_date and row_date < d_from:
                continue
            if d_to and row_date and row_date > d_to:
                continue

            for fid, key in metric_field_ids.items():
                raw_val = vals.get(fid)
                if raw_val is None:
                    continue
                try:
                    # Handle percentage strings like "2.5%"
                    if isinstance(raw_val, str):
                        raw_val = raw_val.replace("%", "").replace(",", ".").strip()
                        if raw_val == "" or raw_val.lower() in ("false", "none", "null"):
                            continue
                    num_val = float(raw_val)
                except (ValueError, TypeError):
                    continue

                totals[key] += num_val
                source_breakdown[d.source.name][key] += num_val

                if row_date:
                    # Aggregate by month for time series
                    month_key = row_date.strftime("%Y-%m")
                    time_series[month_key][key] += num_val

    # Build sorted time series
    sorted_months = sorted(time_series.keys())
    ts_output = []
    for m in sorted_months:
        entry = {"period": m}
        entry.update(time_series[m])
        ts_output.append(entry)

    # Build source breakdown
    sb_output = []
    for source_name, metrics in source_breakdown.items():
        entry = {"source": source_name}
        entry.update(metrics)
        sb_output.append(entry)

    return {
        "customer_id": c.id,
        "customer_name": c.name,
        "dataset_count": len(all_datasets),
        "datasets_used": len(datasets),
        "datasets_skipped": skipped_count,
        "total_rows": total_rows,
        "date_range": {
            "from": date_from,
            "to": date_to,
        },
        "granularity_info": dict(granularity_counts),
        "summary_stats": dict(totals),
        "time_series": ts_output,
        "source_breakdown": sb_output,
        "ai_summaries": ai_summaries,
    }
