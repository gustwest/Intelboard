"""Module management, evaluation, trend, and clone endpoints."""
from datetime import datetime
from typing import Any, Dict, List, Optional

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

import models
import schemas
from db import get_db
from formula import FormulaError, aggregate, evaluate
from logging_config import log

router = APIRouter(tags=["modules"])


# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------
def _module_to_out(m: models.Module) -> Dict[str, Any]:
    return {
        "id": m.id,
        "customer_id": m.customer_id,
        "name": m.name,
        "abbr": m.abbr,
        "category": m.category,
        "description": m.description or "",
        "formula": m.formula_json or {},
        "thresholds": m.thresholds_json or {},
        "visualization": m.visualization,
        "insight_template": m.insight_template or "",
        "inverted": m.inverted,
        "field_refs": [
            {
                "id": ref.id,
                "source_field_id": ref.source_field_id,
                "alias": ref.alias,
                "field_key": ref.source_field.key,
                "field_display_name": ref.source_field.display_name,
                "source_id": ref.source_field.source_id,
                "source_key": ref.source_field.source.key,
            }
            for ref in m.field_refs
        ],
        "created_at": m.created_at.isoformat(),
    }


def _row_values_for_field(customer: models.Customer, source_field_id: str, source_id: str, row_filter=None) -> List[Any]:
    """Collect raw values for a SourceField across this customer's datasets."""
    values: List[Any] = []
    for dataset in customer.datasets:
        if dataset.source_id != source_id:
            continue
        for row in dataset.rows:
            if row_filter and not row_filter(row):
                continue
            if source_field_id in (row.values_json or {}):
                values.append(row.values_json[source_field_id])
    return values


def _evaluate_for_customer(
    db: Session,
    module: models.Module,
    customer: models.Customer,
    default_aggs: Dict[str, str],
    _stack: Optional[List[str]] = None,
    row_filter=None,
) -> Dict[str, Any]:
    """Evaluate a module for one customer.

    Order of operations:
      1. Resolve module_refs (formula_json.module_refs) — recursively eval those modules.
         Cycle detection via _stack.
      2. For each field_ref, aggregate raw values from this customer's datasets.
      3. Merge constants (formula_json.constants) into context.
      4. Evaluate the expression with the merged context.
    """
    stack = list(_stack or [])
    if module.id in stack:
        return {
            "customer_id": customer.id,
            "customer_name": customer.name,
            "customer_slug": customer.slug,
            "value": None,
            "context": {},
            "aliases": {},
            "error": f"Cyklisk modul-referens: {' → '.join(stack + [module.abbr])}",
        }
    stack.append(module.id)

    formula = module.formula_json or {}
    context: Dict[str, Any] = {}
    aliases_used: Dict[str, Any] = {}

    # 1. Module references (module-of-modules)
    for mref in (formula.get("module_refs") or []):
        ref_alias = mref.get("alias")
        ref_id = mref.get("module_id")
        if not ref_alias or not ref_id:
            continue
        ref_mod = db.query(models.Module).filter_by(id=ref_id).first()
        if not ref_mod:
            context[ref_alias] = 0
            aliases_used[ref_alias] = {"module_id": ref_id, "error": "module not found"}
            continue
        sub = _evaluate_for_customer(db, ref_mod, customer, {}, _stack=stack, row_filter=row_filter)
        context[ref_alias] = sub["value"] if sub.get("value") is not None else 0
        aliases_used[ref_alias] = {"kind": "module", "module_id": ref_mod.id, "module_abbr": ref_mod.abbr}

    # 2. Field references
    for ref in module.field_refs:
        values = _row_values_for_field(customer, ref.source_field_id, ref.source_field.source_id, row_filter=row_filter)
        agg = default_aggs.get(ref.alias) or formula.get("aggregations", {}).get(ref.alias) or formula.get("aggregation", "sum")
        try:
            context[ref.alias] = aggregate(values, agg)
        except FormulaError as e:
            context[ref.alias] = 0
            log.warn("module.eval.aggregate_error", module=module.abbr, alias=ref.alias, error=str(e))
        aliases_used[ref.alias] = {"kind": "field", "source_field_id": ref.source_field_id, "value_count": len(values), "aggregation": agg}

    # 3. Constants
    for k, v in (formula.get("constants") or {}).items():
        if k in context:
            continue
        try:
            context[k] = float(v)
            aliases_used[k] = {"kind": "constant", "value": float(v)}
        except (TypeError, ValueError):
            pass

    # 4. Evaluate expression
    expression = formula.get("expression", "")
    value: Any = None
    error: Optional[str] = None
    if expression:
        try:
            value = evaluate(expression, context)
        except FormulaError as e:
            error = str(e)
            log.warn("module.eval.formula_error", module=module.abbr, customer=customer.slug, expression=expression, error=error)
    else:
        value = sum(v for v in context.values() if isinstance(v, (int, float))) if context else 0

    return {
        "customer_id": customer.id,
        "customer_name": customer.name,
        "customer_slug": customer.slug,
        "value": value,
        "context": context,
        "aliases": aliases_used,
        "error": error,
    }


# ------------------------------------------------------------------
# CRUD
# ------------------------------------------------------------------
@router.get("/api/modules")
def list_modules(customer_id: Optional[str] = None, include_global: bool = True, db: Session = Depends(get_db)):
    q = db.query(models.Module)
    if customer_id:
        c = db.query(models.Customer).filter(
            (models.Customer.id == customer_id) | (models.Customer.slug == customer_id)
        ).first()
        if not c:
            raise HTTPException(404, "Customer not found")
        if include_global:
            q = q.filter((models.Module.customer_id == c.id) | (models.Module.customer_id.is_(None)))
        else:
            q = q.filter(models.Module.customer_id == c.id)
    return [_module_to_out(m) for m in q.order_by(models.Module.created_at.desc()).all()]


@router.post("/api/modules")
def create_module(req: schemas.ModuleCreate, db: Session = Depends(get_db)):
    customer_id = None
    if req.customer_id:
        c = db.query(models.Customer).filter(
            (models.Customer.id == req.customer_id) | (models.Customer.slug == req.customer_id)
        ).first()
        if not c:
            raise HTTPException(404, "Customer not found")
        customer_id = c.id

    m = models.Module(
        customer_id=customer_id,
        name=req.name,
        abbr=req.abbr,
        category=req.category,
        description=req.description,
        formula_json=req.formula or {},
        thresholds_json=req.thresholds or {},
        visualization=req.visualization,
        insight_template=req.insight_template,
        inverted=req.inverted,
    )
    db.add(m)
    db.flush()
    for ref in req.field_refs:
        db.add(models.ModuleFieldRef(
            module_id=m.id,
            source_field_id=ref.source_field_id,
            alias=ref.alias,
        ))
    db.commit()
    db.refresh(m)
    return _module_to_out(m)


@router.get("/api/modules/{module_id}")
def get_module(module_id: str, db: Session = Depends(get_db)):
    m = db.query(models.Module).filter_by(id=module_id).first()
    if not m:
        raise HTTPException(404, "Module not found")
    return _module_to_out(m)


@router.patch("/api/modules/{module_id}")
def update_module(module_id: str, req: schemas.ModuleUpdate, db: Session = Depends(get_db)):
    m = db.query(models.Module).filter_by(id=module_id).first()
    if not m:
        raise HTTPException(404, "Module not found")
    for field in ("name", "abbr", "category", "description", "visualization", "insight_template", "inverted"):
        val = getattr(req, field)
        if val is not None:
            setattr(m, field, val)
    if req.formula is not None:
        m.formula_json = req.formula
    if req.thresholds is not None:
        m.thresholds_json = req.thresholds
    if req.field_refs is not None:
        for ref in list(m.field_refs):
            db.delete(ref)
        db.flush()
        for ref in req.field_refs:
            db.add(models.ModuleFieldRef(
                module_id=m.id,
                source_field_id=ref.source_field_id,
                alias=ref.alias,
            ))
    db.commit()
    db.refresh(m)
    return _module_to_out(m)


@router.delete("/api/modules/{module_id}")
def delete_module(module_id: str, db: Session = Depends(get_db)):
    m = db.query(models.Module).filter_by(id=module_id).first()
    if not m:
        raise HTTPException(404, "Module not found")
    db.delete(m)
    db.commit()
    return {"deleted": True}


# ------------------------------------------------------------------
# Clone
# ------------------------------------------------------------------
class ModuleCloneReq(BaseModel):
    customer_id: str
    name_override: Optional[str] = None


@router.post("/api/modules/{module_id}/clone")
def clone_module(module_id: str, req: ModuleCloneReq, db: Session = Depends(get_db)):
    """Clone a module (typically a global template) into a customer-specific copy."""
    source_module = db.query(models.Module).filter_by(id=module_id).first()
    if not source_module:
        raise HTTPException(404, "Module not found")
    customer = db.query(models.Customer).filter(
        (models.Customer.id == req.customer_id) | (models.Customer.slug == req.customer_id)
    ).first()
    if not customer:
        raise HTTPException(404, "Customer not found")

    new_module = models.Module(
        customer_id=customer.id,
        name=req.name_override or source_module.name,
        abbr=source_module.abbr,
        category=source_module.category,
        description=source_module.description,
        formula_json=dict(source_module.formula_json or {}),
        thresholds_json=dict(source_module.thresholds_json or {}),
        visualization=source_module.visualization,
        insight_template=source_module.insight_template,
        inverted=source_module.inverted,
    )
    db.add(new_module)
    db.flush()
    for ref in source_module.field_refs:
        db.add(models.ModuleFieldRef(
            module_id=new_module.id,
            source_field_id=ref.source_field_id,
            alias=ref.alias,
        ))
    db.commit()
    db.refresh(new_module)
    log.info("module.cloned", source_module=source_module.abbr, customer=customer.slug, new_module_id=new_module.id)
    return _module_to_out(new_module)


# ------------------------------------------------------------------
# Evaluation
# ------------------------------------------------------------------
class ModuleEvaluateReq(BaseModel):
    customer_ids: List[str]
    aggregations: Optional[Dict[str, str]] = None


@router.post("/api/modules/{module_id}/evaluate")
def evaluate_module(module_id: str, req: ModuleEvaluateReq, db: Session = Depends(get_db)):
    m = db.query(models.Module).filter_by(id=module_id).first()
    if not m:
        raise HTTPException(404, "Module not found")

    default_aggs = req.aggregations or {}
    results = []
    for cid in req.customer_ids:
        c = db.query(models.Customer).filter(
            (models.Customer.id == cid) | (models.Customer.slug == cid)
        ).first()
        if not c:
            continue
        results.append(_evaluate_for_customer(db, m, c, default_aggs))

    return {
        "module_id": m.id,
        "module_name": m.name,
        "module_abbr": m.abbr,
        "expression": (m.formula_json or {}).get("expression", ""),
        "results": results,
    }


# ------------------------------------------------------------------
# Bulk evaluate per customer
# ------------------------------------------------------------------
class BulkEvaluateReq(BaseModel):
    module_ids: List[str]
    aggregations: Optional[Dict[str, str]] = None


@router.post("/api/customers/{customer_id}/evaluate")
def evaluate_modules_for_customer(customer_id: str, req: BulkEvaluateReq, db: Session = Depends(get_db)):
    """Evaluate multiple modules for a single customer in one call."""
    c = db.query(models.Customer).filter(
        (models.Customer.id == customer_id) | (models.Customer.slug == customer_id)
    ).first()
    if not c:
        raise HTTPException(404, "Customer not found")

    default_aggs = req.aggregations or {}
    results = []
    for mid in req.module_ids:
        m = db.query(models.Module).filter_by(id=mid).first()
        if not m:
            continue
        r = _evaluate_for_customer(db, m, c, default_aggs)
        results.append({
            "module_id": m.id,
            "module_name": m.name,
            "module_abbr": m.abbr,
            "expression": (m.formula_json or {}).get("expression", ""),
            **r,
        })

    log.info("customer.evaluate", customer=c.slug, module_count=len(results))
    return {"customer_id": c.id, "customer_name": c.name, "results": results}


# ------------------------------------------------------------------
# Trend / Time-series
# ------------------------------------------------------------------
def _bucket_key(value: Any, granularity: str) -> Optional[str]:
    if value is None or value == "":
        return None
    try:
        ts = pd.to_datetime(value, errors="coerce")
    except Exception:
        return None
    if ts is None or pd.isna(ts):
        return None
    if granularity == "month":
        return ts.strftime("%Y-%m")
    if granularity == "week":
        iso = ts.isocalendar()
        return f"{iso.year:04d}-W{iso.week:02d}"
    return ts.strftime("%Y-%m-%d")


def _evaluate_trend_for_customer(
    db: Session,
    module: models.Module,
    customer: models.Customer,
    date_field_id: str,
    granularity: str,
    default_aggs: Dict[str, str],
) -> List[Dict[str, Any]]:
    period_to_rows: Dict[str, set] = {}
    for dataset in customer.datasets:
        for row in dataset.rows:
            v = (row.values_json or {}).get(date_field_id)
            key = _bucket_key(v, granularity)
            if key is None:
                continue
            period_to_rows.setdefault(key, set()).add(row.id)

    out: List[Dict[str, Any]] = []
    for period in sorted(period_to_rows.keys()):
        row_ids = period_to_rows[period]
        sub = _evaluate_for_customer(
            db, module, customer, default_aggs,
            row_filter=lambda r, _ids=row_ids: r.id in _ids,
        )
        out.append({
            "period": period,
            "value": sub["value"],
            "context": sub["context"],
            "error": sub.get("error"),
        })
    return out


class TrendReq(BaseModel):
    customer_ids: List[str]
    date_field_id: str
    granularity: str = "day"
    aggregations: Optional[Dict[str, str]] = None


@router.post("/api/modules/{module_id}/trend")
def module_trend(module_id: str, req: TrendReq, db: Session = Depends(get_db)):
    m = db.query(models.Module).filter_by(id=module_id).first()
    if not m:
        raise HTTPException(404, "Module not found")
    if req.granularity not in ("day", "week", "month"):
        raise HTTPException(400, "granularity must be day | week | month")

    series = []
    default_aggs = req.aggregations or {}
    all_periods: set = set()
    for cid in req.customer_ids:
        c = db.query(models.Customer).filter(
            (models.Customer.id == cid) | (models.Customer.slug == cid)
        ).first()
        if not c:
            continue
        points = _evaluate_trend_for_customer(db, m, c, req.date_field_id, req.granularity, default_aggs)
        for p in points:
            all_periods.add(p["period"])
        series.append({
            "customer_id": c.id,
            "customer_name": c.name,
            "customer_slug": c.slug,
            "points": points,
        })

    return {
        "module_id": m.id,
        "module_name": m.name,
        "module_abbr": m.abbr,
        "granularity": req.granularity,
        "periods": sorted(all_periods),
        "series": series,
    }
