"""Customer CRUD endpoints — optimized with SQL COUNT."""
from collections import Counter, defaultdict
from typing import Any, Dict, List, Optional

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload, subqueryload

import models
import schemas
from db import get_db
from helpers import slugify

router = APIRouter(prefix="/api/customers", tags=["customers"])


# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------
def _customer_to_out(c: models.Customer, dataset_count: int = 0, module_count: int = 0) -> Dict[str, Any]:
    return {
        "id": c.id,
        "slug": c.slug,
        "name": c.name,
        "logo_emoji": c.logo_emoji or "🏢",
        "tags": c.tags_json or [],
        "icp": c.icp_json or {},
        "dataset_count": dataset_count,
        "module_count": module_count,
        "created_at": c.created_at.isoformat() if c.created_at else None,
    }


# ------------------------------------------------------------------
# Routes
# ------------------------------------------------------------------
@router.get("")
def list_customers(db: Session = Depends(get_db)):
    """List all customers with dataset/module counts via SQL aggregation (no N+1)."""
    # Subquery for dataset counts
    ds_counts = (
        db.query(models.Dataset.customer_id, func.count(models.Dataset.id).label("cnt"))
        .group_by(models.Dataset.customer_id)
        .subquery()
    )
    # Subquery for module counts
    mod_counts = (
        db.query(models.Module.customer_id, func.count(models.Module.id).label("cnt"))
        .group_by(models.Module.customer_id)
        .subquery()
    )
    rows = (
        db.query(models.Customer, ds_counts.c.cnt, mod_counts.c.cnt)
        .outerjoin(ds_counts, models.Customer.id == ds_counts.c.customer_id)
        .outerjoin(mod_counts, models.Customer.id == mod_counts.c.customer_id)
        .order_by(models.Customer.created_at.desc())
        .all()
    )
    return [_customer_to_out(c, dc or 0, mc or 0) for c, dc, mc in rows]


@router.post("")
def create_customer(req: schemas.CustomerCreate, db: Session = Depends(get_db)):
    slug = slugify(req.name)
    if db.query(models.Customer).filter_by(slug=slug).first():
        raise HTTPException(400, f"Customer with slug '{slug}' already exists")
    c = models.Customer(
        slug=slug,
        name=req.name.strip(),
        logo_emoji=req.logo_emoji or "🏢",
        tags_json=req.tags or [],
        icp_json=req.icp or {},
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return _customer_to_out(c)


@router.get("/{customer_id}")
def get_customer(customer_id: str, db: Session = Depends(get_db)):
    c = (
        db.query(models.Customer)
        .options(subqueryload(models.Customer.datasets))
        .filter(
            (models.Customer.id == customer_id) | (models.Customer.slug == customer_id)
        )
        .first()
    )
    if not c:
        raise HTTPException(404, "Customer not found")
    dataset_count = len(c.datasets)
    module_count = db.query(func.count(models.Module.id)).filter_by(customer_id=c.id).scalar() or 0
    out = _customer_to_out(c, dataset_count, module_count)
    out["datasets"] = [
        {
            "id": d.id,
            "source_id": d.source_id,
            "source_key": d.source.key,
            "source_name": d.source.name,
            "source_version": d.source_version.version,
            "original_filename": d.original_filename,
            "row_count": d.row_count,
            "ai_summary": d.ai_summary or "",
            "granularity": d.granularity or "unknown",
            "period_start": str(d.period_start) if d.period_start else None,
            "period_end": str(d.period_end) if d.period_end else None,
            "uploaded_at": d.uploaded_at.isoformat(),
        }
        for d in sorted(c.datasets, key=lambda x: x.uploaded_at, reverse=True)
    ]
    return out


@router.patch("/{customer_id}")
def update_customer(customer_id: str, req: schemas.CustomerUpdate, db: Session = Depends(get_db)):
    c = db.query(models.Customer).filter(
        (models.Customer.id == customer_id) | (models.Customer.slug == customer_id)
    ).first()
    if not c:
        raise HTTPException(404, "Customer not found")
    if req.name is not None:
        c.name = req.name.strip()
    if req.logo_emoji is not None:
        c.logo_emoji = req.logo_emoji
    if req.tags is not None:
        c.tags_json = req.tags
    if req.icp is not None:
        c.icp_json = req.icp
    db.commit()
    db.refresh(c)
    return _customer_to_out(c)


@router.get("/{customer_id}/sources")
def get_customer_sources(customer_id: str, db: Session = Depends(get_db)):
    """All sources this customer has data for, grouped with aggregate stats."""
    c = db.query(models.Customer).filter(
        (models.Customer.id == customer_id) | (models.Customer.slug == customer_id)
    ).first()
    if not c:
        raise HTTPException(404, "Customer not found")

    datasets = (
        db.query(models.Dataset)
        .options(joinedload(models.Dataset.source).joinedload(models.Source.fields))
        .filter_by(customer_id=c.id)
        .order_by(models.Dataset.uploaded_at.desc())
        .all()
    )

    source_groups: Dict[str, List[models.Dataset]] = defaultdict(list)
    for d in datasets:
        source_groups[d.source_id].append(d)

    result = []
    for source_id, ds_list in source_groups.items():
        src = ds_list[0].source
        active_fields = [f for f in src.fields if f.is_active]
        periods_start = [d.period_start for d in ds_list if d.period_start]
        periods_end   = [d.period_end   for d in ds_list if d.period_end]
        gran_counts = Counter(d.granularity for d in ds_list if d.granularity not in ("unknown", None))
        granularity = gran_counts.most_common(1)[0][0] if gran_counts else "unknown"

        result.append({
            "source_id": src.id,
            "source_key": src.key,
            "source_name": src.name,
            "source_platform": src.platform,
            "source_category": src.category,
            "dataset_count": len(ds_list),
            "total_rows": sum(d.row_count or 0 for d in ds_list),
            "period_start": str(min(periods_start)) if periods_start else None,
            "period_end":   str(max(periods_end))   if periods_end   else None,
            "granularity": granularity,
            "fields": [
                {"id": f.id, "key": f.key, "display_name": f.display_name,
                 "unit": f.unit, "data_type": f.data_type}
                for f in sorted(active_fields, key=lambda f: f.key)
            ],
            "datasets": [
                {
                    "id": d.id,
                    "original_filename": d.original_filename,
                    "row_count": d.row_count,
                    "granularity": d.granularity,
                    "period_start": str(d.period_start) if d.period_start else None,
                    "period_end":   str(d.period_end)   if d.period_end   else None,
                    "uploaded_at": d.uploaded_at.isoformat(),
                    "ai_summary": d.ai_summary or "",
                }
                for d in ds_list
            ],
        })

    result.sort(key=lambda x: x["source_name"])
    return result


@router.get("/{customer_id}/sources/{source_key}/timeseries")
def get_source_timeseries(
    customer_id: str,
    source_key: str,
    fields: Optional[str] = Query(None, description="Comma-separated field keys"),
    bucket: Optional[str] = Query(None, description="daily | monthly"),
    db: Session = Depends(get_db),
):
    """Time-series data for one source, aggregated across all datasets for this customer.

    Dedup: for overlapping date buckets the most recently uploaded dataset wins.
    Within a bucket, integer fields are summed (campaign counts), floats averaged (rates).
    """
    c = db.query(models.Customer).filter(
        (models.Customer.id == customer_id) | (models.Customer.slug == customer_id)
    ).first()
    if not c:
        raise HTTPException(404, "Customer not found")

    src = (
        db.query(models.Source)
        .options(joinedload(models.Source.fields))
        .filter_by(key=source_key)
        .first()
    )
    if not src:
        raise HTTPException(404, f"Source '{source_key}' not found")

    datasets = (
        db.query(models.Dataset)
        .filter_by(customer_id=c.id, source_id=src.id)
        .order_by(models.Dataset.uploaded_at.desc())  # newest first for dedup
        .all()
    )
    if not datasets:
        return {"source_key": src.key, "source_name": src.name,
                "date_field": None, "granularity": "unknown", "fields": [], "data": []}

    active_fields = {f.id: f for f in src.fields if f.is_active}

    # Date field — first field with data_type=="date"
    date_fields = [f for f in active_fields.values() if f.data_type == "date"]
    if not date_fields:
        return {"source_key": src.key, "source_name": src.name,
                "date_field": None, "granularity": "unknown", "fields": [], "data": []}
    date_field = date_fields[0]

    # Which numeric fields to include
    requested_keys = {k.strip() for k in fields.split(",")} if fields else None
    numeric_fields = {
        fid: f for fid, f in active_fields.items()
        if f.data_type in ("int", "float")
        and fid != date_field.id
        and (requested_keys is None or f.key in requested_keys)
    }

    # Determine bucket size from granularity if not specified
    if not bucket:
        gran_counts = Counter(
            d.granularity for d in datasets if d.granularity not in ("unknown", "aggregated", None)
        )
        top = gran_counts.most_common(1)
        if top and top[0][0] in ("monthly", "quarterly", "yearly"):
            bucket = "monthly"
        else:
            bucket = "daily"

    def to_bucket_key(value: Any) -> Optional[str]:
        if value is None or value == "":
            return None
        try:
            ts = pd.to_datetime(value, errors="coerce")
            if ts is None or pd.isna(ts):
                return None
            return ts.strftime("%Y-%m") if bucket == "monthly" else ts.strftime("%Y-%m-%d")
        except Exception:
            return None

    # date_key → dataset_id (which dataset owns this bucket — the newest)
    bucket_owner: Dict[str, str] = {}
    # date_key → {field_id → [values]}
    bucket_values: Dict[str, Dict[str, List]] = defaultdict(lambda: defaultdict(list))

    for dataset in datasets:
        rows = (
            db.query(models.DatasetRow)
            .filter_by(dataset_id=dataset.id)
            .all()
        )
        for row in rows:
            vals = row.values_json or {}
            date_key = to_bucket_key(vals.get(date_field.id))
            if date_key is None:
                continue
            if date_key not in bucket_owner:
                bucket_owner[date_key] = dataset.id
            if bucket_owner[date_key] != dataset.id:
                continue  # a newer dataset already owns this date
            for fid in numeric_fields:
                if fid in vals and isinstance(vals[fid], (int, float)):
                    bucket_values[date_key][fid].append(vals[fid])

    def agg(values: List, data_type: str) -> Optional[float]:
        if not values:
            return None
        return sum(values) if data_type == "int" else sum(values) / len(values)

    data = []
    for date_key in sorted(bucket_values.keys()):
        row_out: Dict[str, Any] = {"date": date_key}
        for fid, f in numeric_fields.items():
            row_out[f.key] = agg(bucket_values[date_key].get(fid, []), f.data_type)
        data.append(row_out)

    return {
        "source_key": src.key,
        "source_name": src.name,
        "date_field": {"id": date_field.id, "key": date_field.key, "display_name": date_field.display_name},
        "granularity": bucket,
        "fields": [
            {"id": f.id, "key": f.key, "display_name": f.display_name, "unit": f.unit, "data_type": f.data_type}
            for f in numeric_fields.values()
        ],
        "data": data,
    }


@router.delete("/{customer_id}")
def delete_customer(customer_id: str, db: Session = Depends(get_db)):
    c = db.query(models.Customer).filter(
        (models.Customer.id == customer_id) | (models.Customer.slug == customer_id)
    ).first()
    if not c:
        raise HTTPException(404, "Customer not found")
    db.delete(c)
    db.commit()
    return {"deleted": True}
