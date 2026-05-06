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
# Helper: extract values from all datasets for a customer
# ------------------------------------------------------------------
def _extract_all_field_values(db: Session, customer_id: str) -> Dict[str, Dict[str, List[Any]]]:
    """Load field values from ALL datasets for a customer.
    Returns {source_key: {field_key: [values]}}."""
    datasets = (
        db.query(models.Dataset)
        .options(
            joinedload(models.Dataset.source),
            joinedload(models.Dataset.source_version)
            .joinedload(models.SourceVersion.mappings)
            .joinedload(models.SourceFieldMapping.source_field),
        )
        .filter(models.Dataset.customer_id == customer_id)
        .all()
    )

    by_source: Dict[str, Dict[str, List[Any]]] = defaultdict(lambda: defaultdict(list))

    for ds in datasets:
        field_map = {m.source_field_id: m.source_field for m in ds.source_version.mappings}
        rows = db.query(models.DatasetRow).filter_by(dataset_id=ds.id).limit(2000).all()
        src_key = ds.source.key if ds.source else "unknown"
        for row in rows:
            vals = row.values_json or {}
            for fid, val in vals.items():
                sf = field_map.get(fid)
                if sf:
                    by_source[src_key][sf.key].append(val)

    return dict(by_source)


def _find_values(all_data: Dict[str, Dict[str, List[Any]]], field_keys: List[str],
                 source_filter: Optional[str] = None) -> List[Any]:
    """Find values for given field keys across all sources. Optional source_filter (substring match)."""
    result = []
    for src_key, fields in all_data.items():
        if source_filter and source_filter.lower() not in src_key.lower():
            continue
        for fk in field_keys:
            result.extend(fields.get(fk, []))
    return result


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
            counts[str(v).strip()] += 1
    return dict(sorted(counts.items(), key=lambda x: -x[1]))


# ------------------------------------------------------------------
# Section 2: Key Metrics
# ------------------------------------------------------------------
def compute_key_metrics(customer_id: str, db: Session, all_data: Dict) -> Dict[str, Any]:
    """Aggregate top-level KPIs across all LinkedIn datasets."""

    # Collect all field values across all sources
    flat: Dict[str, List[Any]] = defaultdict(list)
    dataset_count = 0
    for src_key, fields in all_data.items():
        dataset_count += 1
        for fk, vals in fields.items():
            flat[fk].extend(vals)

    # Map common LinkedIn field keys to KPI names
    metrics = {
        "followers": round(_safe_sum(
            flat.get("total-followers", []) or flat.get("new-followers", []) or flat.get("follows", [])
        )),
        "impressions": round(_safe_sum(
            flat.get("impressions", []) + flat.get("impressions-total", []) + flat.get("impressions-organic", [])
        )),
        "clicks": round(_safe_sum(
            flat.get("clicks", []) + flat.get("clicks-total", []) + flat.get("clicks-organic", [])
        )),
        "engagements": round(_safe_sum(
            flat.get("total-engagements", []) + flat.get("reactions", []) +
            flat.get("comments", []) + flat.get("shares", []) +
            flat.get("reactions-organic", []) + flat.get("comments-organic", []) +
            flat.get("reposts-organic", [])
        )),
        "posts": len(flat.get("date", [])) if "impressions-organic" in flat else 0,
        "video_views": round(_safe_sum(
            flat.get("video-views", []) + flat.get("video-plays", [])
        )),
    }

    # Visitor metrics from visitors source
    visitor_fields = flat
    total_page_views = _safe_sum(visitor_fields.get("total-page-views-total", []))
    total_unique_visitors = _safe_sum(visitor_fields.get("total-unique-visitors-total", []))
    if total_page_views > 0:
        metrics["page_views"] = round(total_page_views)
    if total_unique_visitors > 0:
        metrics["unique_visitors"] = round(total_unique_visitors)

    # Extract demographics if available
    demographics = {
        "geography": _count_by_value(
            flat.get("location", []) + flat.get("geography", []) +
            flat.get("geo-location", [])
        ),
        "seniority": _count_by_value(
            flat.get("seniority", []) + flat.get("seniority-level", [])
        ),
        "job_function": _count_by_value(
            flat.get("job-function", []) + flat.get("function", []) +
            flat.get("position", []) + flat.get("headline", [])
        ),
        "company": _count_by_value(
            flat.get("company-name-segment", []) + flat.get("company", []) +
            flat.get("company-name", [])
        ),
    }
    # Remove empty demographic sections
    demographics = {k: v for k, v in demographics.items() if v}

    # Get dataset metadata
    datasets = (
        db.query(models.Dataset)
        .filter(models.Dataset.customer_id == customer_id)
        .all()
    )

    return {
        "metrics": metrics,
        "demographics": demographics,
        "dataset_count": len(datasets),
        "total_rows": sum(d.row_count or 0 for d in datasets),
        "sources": list(all_data.keys()),
    }


# ------------------------------------------------------------------
# Section 3: Activity Index — works with available data
# ------------------------------------------------------------------
def compute_activity_index(
    customer_id: str, db: Session, customer_icp: Optional[dict],
    all_data: Dict
) -> Dict[str, Any]:
    """Compute activity index. Uses job-function demographics if available,
    otherwise falls back to visitor page-section analysis."""

    # Try to find job-function data from any source
    job_functions = _find_values(all_data, ["job-function", "function"])
    
    if job_functions:
        return _activity_index_from_job_functions(job_functions, all_data, customer_icp)
    
    # Fallback: analyze visitor data by page section (overview vs jobs vs life)
    visitor_data = {}
    for src_key, fields in all_data.items():
        if "visitor" in src_key.lower():
            visitor_data = fields
            break
    
    if visitor_data:
        return _activity_index_from_page_sections(visitor_data)

    # No visitor data at all
    return {
        "type": "no_data",
        "message": "Ingen besöksdata eller demografisk data hittades. Ladda upp LinkedIn Visitor Demographics-rapport för aktivitetsindex.",
        "groups": [],
    }


def _activity_index_from_job_functions(
    job_functions: list, all_data: Dict, customer_icp: Optional[dict]
) -> Dict[str, Any]:
    """Standard activity index from job function demographics."""
    follower_functions = _find_values(all_data, ["job-function", "function"], "follower")
    
    visitor_counts = _count_by_value(job_functions)
    follower_counts = _count_by_value(follower_functions)
    total_visitors = sum(visitor_counts.values()) or 1
    total_followers = sum(follower_counts.values()) or 1

    workforce_shares = get_workforce_shares(customer_icp)

    results = []
    all_funcs = set(list(visitor_counts.keys()) + list(workforce_shares.keys()))

    for func in sorted(all_funcs):
        v_count = visitor_counts.get(func, 0)
        f_count = follower_counts.get(func, 0)
        visitor_share = v_count / total_visitors if total_visitors > 0 else 0
        workforce_share = workforce_shares.get(func, 0.03)
        index = round(visitor_share / workforce_share, 2) if workforce_share > 0 else 0.0

        results.append({
            "job_function": func, "visitors": v_count, "followers": f_count,
            "visitor_share": round(visitor_share * 100, 1),
            "workforce_share": round(workforce_share * 100, 1),
            "index": index,
        })

    results.sort(key=lambda x: -x["index"])
    return {"type": "job_function", "groups": results}


def _activity_index_from_page_sections(visitor_data: Dict) -> Dict[str, Any]:
    """Fallback: analyze which page sections attract the most visitors."""
    sections = [
        {"section": "Översikt", "views_key": "overview-page-views-total",
         "visitors_key": "overview-unique-visitors-total",
         "description": "Företagets huvudsida — första intrycket för potentiella kandidater"},
        {"section": "Jobb", "views_key": "jobs-page-views-total",
         "visitors_key": "jobs-unique-visitors-total",
         "description": "Jobbannonssidan — indikerar aktiv jobbsökning"},
        {"section": "Livet", "views_key": "life-page-views-total",
         "visitors_key": "life-unique-visitors-total",
         "description": "Life-sidan — intresse för företagskultur och employer brand"},
    ]

    results = []
    total_views = _safe_sum(visitor_data.get("total-page-views-total", []))
    total_visitors = _safe_sum(visitor_data.get("total-unique-visitors-total", []))

    for sec in sections:
        views = _safe_sum(visitor_data.get(sec["views_key"], []))
        visitors = _safe_sum(visitor_data.get(sec["visitors_key"], []))
        share = (views / total_views * 100) if total_views > 0 else 0

        # Engagement intensity: views per visitor
        intensity = round(views / visitors, 1) if visitors > 0 else 0

        results.append({
            "section": sec["section"],
            "page_views": round(views),
            "unique_visitors": round(visitors),
            "share_of_total": round(share, 1),
            "views_per_visitor": intensity,
            "description": sec["description"],
        })

    # Desktop vs Mobile split
    desktop_views = _safe_sum(visitor_data.get("total-page-views-desktop", []))
    mobile_views = _safe_sum(visitor_data.get("total-page-views-mobile", []))
    device_split = {
        "desktop": round(desktop_views),
        "mobile": round(mobile_views),
        "desktop_share": round(desktop_views / total_views * 100, 1) if total_views > 0 else 0,
        "mobile_share": round(mobile_views / total_views * 100, 1) if total_views > 0 else 0,
    }

    return {
        "type": "page_sections",
        "message": "Demografisk besöksdata (yrkesfunktion) saknas. Visar besöksanalys per sidsektion istället.",
        "total_page_views": round(total_views),
        "total_unique_visitors": round(total_visitors),
        "sections": results,
        "device_split": device_split,
        "groups": [],  # Empty for funnel compatibility
    }


# ------------------------------------------------------------------
# Section 4: Decision Funnel
# ------------------------------------------------------------------
def build_decision_funnel(activity_data: Dict) -> Dict[str, Any]:
    """Place job functions into 5-step decision funnel based on activity index."""
    groups = activity_data.get("groups", [])
    
    if not groups:
        return {
            stage: {
                "label": FUNNEL_LABELS[stage],
                "strategy": FUNNEL_STRATEGIES[stage],
                "groups": [],
                "count": 0,
            }
            for stage in FUNNEL_THRESHOLDS
        }

    funnel = {stage: [] for stage in FUNNEL_THRESHOLDS}

    for item in groups:
        idx = item.get("index", 0)
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
            "groups": grps,
            "count": len(grps),
        }
        for stage, grps in funnel.items()
    }


def _generate_funnel_insight(item: Dict, stage: str) -> str:
    func = item.get("job_function", "Okänd")
    idx = item.get("index", 0)
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
def detect_content_anomalies(customer_id: str, db: Session, all_data: Dict) -> Dict[str, Any]:
    """Analyze content performance and detect anomalies."""
    # Find content-related data
    impressions = []
    engagements = []
    engagement_rates = []
    dates = []

    for src_key, fields in all_data.items():
        if "content" in src_key.lower() or "update" in src_key.lower():
            imp_org = fields.get("impressions-organic", [])
            imp_total = fields.get("impressions-total", fields.get("impressions", []))
            eng_rate = fields.get("engagement-rate-organic", fields.get("engagement-rate-total", []))
            clicks = fields.get("clicks-organic", fields.get("clicks-total", []))
            reactions = fields.get("reactions-organic", fields.get("reactions-total", []))
            comments = fields.get("comments-organic", fields.get("comments-total", []))
            reposts = fields.get("reposts-organic", fields.get("reposts-total", []))
            d = fields.get("date", [])

            impressions = imp_org or imp_total
            engagement_rates = eng_rate
            dates = d

            # Build per-row engagement totals
            for i in range(len(impressions)):
                eng = 0
                for vals in [clicks, reactions, comments, reposts]:
                    if i < len(vals):
                        try:
                            eng += float(str(vals[i]).replace(",", ".").replace("%", ""))
                        except (ValueError, TypeError):
                            pass
                engagements.append(eng)
            break

    if not impressions:
        return {"clusters": [], "anomalies": [], "total_posts": 0,
                "message": "Ingen innehållsdata hittades. Ladda upp LinkedIn Content-rapport."}

    # Build time-based analysis (monthly clusters)
    monthly: Dict[str, Dict] = defaultdict(lambda: {"count": 0, "impressions": [], "engagements": [], "eng_rates": []})

    for i in range(len(impressions)):
        try:
            imp = float(str(impressions[i]).replace(",", "."))
        except (ValueError, TypeError):
            continue

        eng = engagements[i] if i < len(engagements) else 0
        eng_rate_val = 0
        if i < len(engagement_rates):
            try:
                eng_rate_val = float(str(engagement_rates[i]).replace(",", ".").replace("%", ""))
            except (ValueError, TypeError):
                pass

        # Group by month
        month_key = "Okänd"
        if i < len(dates) and dates[i]:
            try:
                d_str = str(dates[i])[:7]  # YYYY-MM
                month_key = d_str
            except (ValueError, TypeError):
                pass

        monthly[month_key]["count"] += 1
        monthly[month_key]["impressions"].append(imp)
        monthly[month_key]["engagements"].append(eng)
        monthly[month_key]["eng_rates"].append(eng_rate_val)

    # Build cluster summary
    cluster_summary = []
    for month, data in sorted(monthly.items()):
        avg_imp = sum(data["impressions"]) / len(data["impressions"]) if data["impressions"] else 0
        avg_eng = sum(data["engagements"]) / len(data["engagements"]) if data["engagements"] else 0
        avg_rate = sum(data["eng_rates"]) / len(data["eng_rates"]) if data["eng_rates"] else 0
        cluster_summary.append({
            "topic": month,
            "post_count": data["count"],
            "avg_impressions": round(avg_imp),
            "avg_engagements": round(avg_eng),
            "engagement_rate": round(avg_rate, 2) if avg_rate > 0 else (
                round(avg_eng / avg_imp * 100, 2) if avg_imp > 0 else 0
            ),
        })

    # Detect anomalies (posts with >2σ impressions)
    anomalies = []
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
                    "date": str(dates[i])[:10] if i < len(dates) and dates[i] else "Okänd",
                    "deviation": round((val - mean_imp) / std_imp, 1) if std_imp > 0 else 0,
                    "note": "Extremt höga visningar — undersök vad som drev detta inlägg.",
                })

    return {
        "clusters": cluster_summary,
        "anomalies": anomalies,
        "total_posts": len(impressions),
    }


# ------------------------------------------------------------------
# Section 6: Campaign Recommendations
# ------------------------------------------------------------------
def generate_campaign_recommendations(customer_id: str, db: Session, all_data: Dict) -> Dict[str, Any]:
    """Generate campaign optimization recommendations from Campaign Manager data."""
    ctr_values = _find_values(all_data, ["click-through-rate", "ctr"], "campaign")
    cpc_values = _find_values(all_data, ["average-cpc", "cpc"], "campaign")
    spend_values = _find_values(all_data, ["total-spent", "spend"], "campaign")
    eng_rate_values = _find_values(all_data, ["engagement-rate"], "campaign")

    avg_ctr = _safe_avg(ctr_values)
    avg_cpc = _safe_avg(cpc_values)
    total_spend = _safe_sum(spend_values)
    avg_eng_rate = _safe_avg(eng_rate_values)

    recommendations = [
        {
            "title": "Styr var annonsen syns",
            "description": "Inaktivera LinkedIn Audience Network och Audience Expansion för att säkerställa att annonserna visas enbart i LinkedIn-flödet.",
            "priority": "high",
            "applicable": True,
        },
        {
            "title": "Optimera klickbudgivningen",
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
        "avg_engagement_rate": round(avg_eng_rate, 2) if avg_eng_rate else None,
        "total_spend": round(total_spend, 2),
        "recommendations": recommendations,
        "has_campaign_data": bool(ctr_values or spend_values),
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

    # Load all data once — shared across sections
    all_data = _extract_all_field_values(db, customer.id)

    key_metrics = compute_key_metrics(customer.id, db, all_data)
    activity_index = compute_activity_index(customer.id, db, customer_icp, all_data)
    decision_funnel = build_decision_funnel(activity_index)
    content = detect_content_anomalies(customer.id, db, all_data)
    campaign = generate_campaign_recommendations(customer.id, db, all_data)

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
