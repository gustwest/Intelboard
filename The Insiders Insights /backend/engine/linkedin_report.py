"""LinkedIn Strategic Report Engine.

Computes key metrics, activity index, decision funnel placement,
content anomalies, and campaign recommendations from uploaded datasets.
"""
from collections import defaultdict
from datetime import datetime
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session, joinedload

import models
from engine.workforce_benchmarks import (
    get_workforce_shares, get_seniority_shares,
    FUNNEL_THRESHOLDS, FUNNEL_LABELS, FUNNEL_STRATEGIES,
)
from logging_config import log


# ------------------------------------------------------------------
# Helper: extract numeric values from dataset rows
# ------------------------------------------------------------------
def _extract_field_values(db: Session, customer_id: str, source_key_prefix: str) -> Dict[str, List[Any]]:
    """Load all dataset rows for a customer matching source key prefix.
    Returns {field_key: [values]}."""
    datasets = (
        db.query(models.Dataset)
        .join(models.Source)
        .options(
            joinedload(models.Dataset.source).joinedload(models.Source.fields),
            joinedload(models.Dataset.source_version)
            .joinedload(models.SourceVersion.mappings)
            .joinedload(models.SourceFieldMapping.source_field),
        )
        .filter(
            models.Dataset.customer_id == customer_id,
            models.Source.key.ilike(f"%{source_key_prefix}%"),
        )
        .all()
    )

    field_values: Dict[str, List[Any]] = defaultdict(list)

    for ds in datasets:
        field_map = {m.source_field_id: m.source_field for m in ds.source_version.mappings}
        rows = db.query(models.DatasetRow).filter_by(dataset_id=ds.id).limit(2000).all()
        for row in rows:
            vals = row.values_json or {}
            for fid, val in vals.items():
                sf = field_map.get(fid)
                if sf:
                    field_values[sf.key].append(val)

    return dict(field_values)


def _safe_sum(values: list) -> float:
    total = 0.0
    for v in values:
        try:
            if isinstance(v, str):
                v = v.replace("%", "").replace(",", ".").strip()
                if not v or v.lower() in ("false", "none", "null"):
                    continue
            total += float(v)
        except (ValueError, TypeError):
            continue
    return total


def _safe_avg(values: list) -> Optional[float]:
    nums = []
    for v in values:
        try:
            if isinstance(v, str):
                v = v.replace("%", "").replace(",", ".").strip()
            nums.append(float(v))
        except (ValueError, TypeError):
            continue
    return sum(nums) / len(nums) if nums else None


def _count_by_value(values: list) -> Dict[str, int]:
    """Count occurrences of each unique value."""
    counts: Dict[str, int] = defaultdict(int)
    for v in values:
        if v is not None and str(v).strip():
            counts[str(v).strip()] = counts.get(str(v).strip(), 0) + 1
    return dict(sorted(counts.items(), key=lambda x: -x[1]))


# ------------------------------------------------------------------
# Section 2: Key Metrics
# ------------------------------------------------------------------
def compute_key_metrics(customer_id: str, db: Session) -> Dict[str, Any]:
    """Aggregate top-level KPIs across all LinkedIn datasets."""
    # Try to find follower/content/visitor data from various source keys
    all_data: Dict[str, List[Any]] = defaultdict(list)

    datasets = (
        db.query(models.Dataset)
        .options(
            joinedload(models.Dataset.source).joinedload(models.Source.fields),
            joinedload(models.Dataset.source_version)
            .joinedload(models.SourceVersion.mappings)
            .joinedload(models.SourceFieldMapping.source_field),
        )
        .filter(models.Dataset.customer_id == customer_id)
        .all()
    )

    for ds in datasets:
        field_map = {m.source_field_id: m.source_field for m in ds.source_version.mappings}
        rows = db.query(models.DatasetRow).filter_by(dataset_id=ds.id).limit(2000).all()
        for row in rows:
            vals = row.values_json or {}
            for fid, val in vals.items():
                sf = field_map.get(fid)
                if sf:
                    all_data[sf.key].append(val)

    # Map common LinkedIn field keys to our KPI names
    KEY_MAPPINGS = {
        "followers": ["followers", "total-followers", "new-followers", "follows"],
        "impressions": ["impressions", "total-impressions"],
        "clicks": ["clicks", "total-clicks"],
        "engagements": ["total-engagements", "engagements", "reactions", "comments", "shares"],
        "posts": ["posts", "published-posts"],
        "video_views": ["video-views", "video-plays"],
    }

    metrics = {}
    for kpi_name, field_keys in KEY_MAPPINGS.items():
        total = 0.0
        for fk in field_keys:
            if fk in all_data:
                total += _safe_sum(all_data[fk])
        metrics[kpi_name] = round(total)

    # Extract demographics if available
    demographics = {
        "geography": _count_by_value(all_data.get("location", all_data.get("geography", []))),
        "seniority": _count_by_value(all_data.get("seniority", all_data.get("seniority-level", []))),
        "job_function": _count_by_value(all_data.get("job-function", all_data.get("function", []))),
    }

    return {
        "metrics": metrics,
        "demographics": demographics,
        "dataset_count": len(datasets),
        "total_rows": sum(d.row_count or 0 for d in datasets),
    }


# ------------------------------------------------------------------
# Section 3: Activity Index
# ------------------------------------------------------------------
def compute_activity_index(
    customer_id: str, db: Session, customer_icp: Optional[dict] = None
) -> List[Dict[str, Any]]:
    """Compute activity index per job function.
    
    activity_index = visitor_share / workforce_share
    > 1.0 = overrepresented (high interest)
    < 1.0 = underrepresented (low interest)
    """
    # Get visitor data by job function
    visitor_data = _extract_field_values(db, customer_id, "visitor")
    job_functions_raw = visitor_data.get("job-function", visitor_data.get("function", []))
    
    # Also check follower data
    follower_data = _extract_field_values(db, customer_id, "follower")
    follower_functions = follower_data.get("job-function", follower_data.get("function", []))

    # Count visitors per function
    visitor_counts = _count_by_value(job_functions_raw)
    follower_counts = _count_by_value(follower_functions)
    total_visitors = sum(visitor_counts.values()) or 1
    total_followers = sum(follower_counts.values()) or 1

    # Get benchmark shares
    workforce_shares = get_workforce_shares(customer_icp)

    results = []
    all_functions = set(list(visitor_counts.keys()) + list(workforce_shares.keys()))

    for func in sorted(all_functions):
        v_count = visitor_counts.get(func, 0)
        f_count = follower_counts.get(func, 0)
        visitor_share = v_count / total_visitors if total_visitors > 0 else 0
        workforce_share = workforce_shares.get(func, 0.03)  # default 3% if unknown

        index = round(visitor_share / workforce_share, 2) if workforce_share > 0 else 0.0

        results.append({
            "job_function": func,
            "visitors": v_count,
            "followers": f_count,
            "visitor_share": round(visitor_share * 100, 1),
            "workforce_share": round(workforce_share * 100, 1),
            "index": index,
        })

    results.sort(key=lambda x: -x["index"])
    return results


# ------------------------------------------------------------------
# Section 4: Decision Funnel
# ------------------------------------------------------------------
def build_decision_funnel(activity_data: List[Dict]) -> Dict[str, Any]:
    """Place job functions into 5-step decision funnel based on activity index."""
    funnel = {stage: [] for stage in FUNNEL_THRESHOLDS}

    for item in activity_data:
        idx = item["index"]
        for stage, (low, high) in FUNNEL_THRESHOLDS.items():
            if low <= idx < high:
                funnel[stage].append({
                    **item,
                    "insight": _generate_funnel_insight(item, stage),
                })
                break

    return {
        stage: {
            "label": FUNNEL_LABELS[stage],
            "strategy": FUNNEL_STRATEGIES[stage],
            "groups": groups,
            "count": len(groups),
        }
        for stage, groups in funnel.items()
    }


def _generate_funnel_insight(item: Dict, stage: str) -> str:
    """Generate a deterministic insight string for a funnel placement."""
    func = item["job_function"]
    idx = item["index"]

    if stage == "ovetandes":
        return f"{func} har extremt låg närvaro (index {idx}). Gruppen når inte ert innehåll organiskt."
    elif stage == "medvetenhet":
        return f"{func} besöker sällan (index {idx}). Potential för varumärkeskampanjer."
    elif stage == "overvagande":
        return f"{func} visar normal aktivitet (index {idx}). Nurtureflöden rekommenderas."
    elif stage == "konvertering":
        return f"{func} är överrepresenterade (index {idx}). Redo för direkt konvertering."
    else:
        return f"{func} är superfans (index {idx}). Aktivera som ambassadörer!"


# ------------------------------------------------------------------
# Section 5: Content Clusters & Anomalies
# ------------------------------------------------------------------
def detect_content_anomalies(customer_id: str, db: Session) -> Dict[str, Any]:
    """Analyze content performance and detect anomalies."""
    content_data = _extract_field_values(db, customer_id, "content")
    if not content_data:
        content_data = _extract_field_values(db, customer_id, "update")

    # Try to build per-post metrics
    impressions = content_data.get("impressions", [])
    engagements = content_data.get("total-engagements", content_data.get("engagements", []))
    post_types = content_data.get("post-type", content_data.get("content-type", []))

    # Cluster by post type
    clusters: Dict[str, Dict] = defaultdict(lambda: {"count": 0, "impressions": [], "engagements": []})

    max_len = max(len(impressions), len(engagements), len(post_types), 1)
    for i in range(min(max_len, len(impressions))):
        ptype = post_types[i] if i < len(post_types) else "Okänd"
        imp = impressions[i] if i < len(impressions) else 0
        eng = engagements[i] if i < len(engagements) else 0

        cluster = clusters[str(ptype)]
        cluster["count"] += 1
        try:
            cluster["impressions"].append(float(str(imp).replace(",", ".")))
        except (ValueError, TypeError):
            pass
        try:
            cluster["engagements"].append(float(str(eng).replace(",", ".")))
        except (ValueError, TypeError):
            pass

    # Build cluster summary
    cluster_summary = []
    for ptype, data in sorted(clusters.items(), key=lambda x: -x[1]["count"]):
        avg_imp = sum(data["impressions"]) / len(data["impressions"]) if data["impressions"] else 0
        avg_eng = sum(data["engagements"]) / len(data["engagements"]) if data["engagements"] else 0
        cluster_summary.append({
            "topic": ptype,
            "post_count": data["count"],
            "avg_impressions": round(avg_imp),
            "avg_engagements": round(avg_eng),
            "engagement_rate": round(avg_eng / avg_imp * 100, 2) if avg_imp > 0 else 0,
        })

    # Detect anomalies (posts with >2σ engagement)
    anomalies = []
    if impressions:
        all_imp = []
        for v in impressions:
            try:
                all_imp.append(float(str(v).replace(",", ".")))
            except (ValueError, TypeError):
                continue
        if len(all_imp) > 5:
            import statistics
            mean_imp = statistics.mean(all_imp)
            std_imp = statistics.stdev(all_imp) if len(all_imp) > 1 else 0
            threshold = mean_imp + 2 * std_imp

            for i, val in enumerate(all_imp):
                if val > threshold:
                    anomalies.append({
                        "index": i,
                        "impressions": round(val),
                        "type": post_types[i] if i < len(post_types) else "Okänd",
                        "deviation": round((val - mean_imp) / std_imp, 1) if std_imp > 0 else 0,
                        "note": "Extremt högt engagemang — undersök vad som drev detta inlägg.",
                    })

    return {
        "clusters": cluster_summary,
        "anomalies": anomalies,
        "total_posts": max_len if impressions else 0,
    }


# ------------------------------------------------------------------
# Section 6: Campaign Recommendations
# ------------------------------------------------------------------
def generate_campaign_recommendations(customer_id: str, db: Session) -> Dict[str, Any]:
    """Generate campaign optimization recommendations from Campaign Manager data."""
    campaign_data = _extract_field_values(db, customer_id, "campaign")

    ctr_values = campaign_data.get("click-through-rate", campaign_data.get("ctr", []))
    cpc_values = campaign_data.get("average-cpc", campaign_data.get("cpc", []))
    spend_values = campaign_data.get("total-spent", campaign_data.get("spend", []))

    avg_ctr = _safe_avg(ctr_values)
    avg_cpc = _safe_avg(cpc_values)
    total_spend = _safe_sum(spend_values)

    recommendations = [
        {
            "title": "Styr var annonsen syns",
            "description": "Inaktivera LinkedIn Audience Network och Audience Expansion för att säkerställa att annonserna visas enbart i LinkedIn-flödet.",
            "priority": "high",
            "applicable": True,
        },
        {
            "title": "Optimera insatsen",
            "description": f"{'Nuvarande CTR: ' + str(round(avg_ctr, 2)) + '%. ' if avg_ctr else ''}Använd manuell klickbudgivning (Manual CPC) istället för auto-bid vid låg CTR (<0.5%).",
            "priority": "high" if (avg_ctr and avg_ctr < 0.5) else "medium",
            "applicable": avg_ctr is not None,
        },
        {
            "title": "Maximera målgruppsstyrningen",
            "description": "Kombinera yrkestitlar, kompetenser och utbildning i targeting. Undvik enbart intressebaserad targeting.",
            "priority": "medium",
            "applicable": True,
        },
    ]

    return {
        "avg_ctr": round(avg_ctr, 2) if avg_ctr else None,
        "avg_cpc": round(avg_cpc, 2) if avg_cpc else None,
        "total_spend": round(total_spend, 2),
        "recommendations": recommendations,
        "has_campaign_data": bool(campaign_data),
    }


# ------------------------------------------------------------------
# Full Report Generator
# ------------------------------------------------------------------
def generate_full_report(customer_id: str, db: Session) -> Dict[str, Any]:
    """Generate the complete LinkedIn strategic report."""
    customer = db.query(models.Customer).filter(
        (models.Customer.id == customer_id) | (models.Customer.slug == customer_id)
    ).first()

    if not customer:
        return {"error": "Customer not found"}

    customer_icp = customer.icp_json or {}

    log.info("linkedin_report.generating", customer=customer.name)

    key_metrics = compute_key_metrics(customer.id, db)
    activity_index = compute_activity_index(customer.id, db, customer_icp)
    decision_funnel = build_decision_funnel(activity_index)
    content = detect_content_anomalies(customer.id, db)
    campaign = generate_campaign_recommendations(customer.id, db)

    return {
        "customer_id": customer.id,
        "customer_name": customer.name,
        "generated_at": datetime.utcnow().isoformat(),
        "sections": {
            "key_metrics": key_metrics,
            "activity_index": activity_index,
            "decision_funnel": decision_funnel,
            "content_clusters": content,
            "campaign_recommendations": campaign,
        },
    }
