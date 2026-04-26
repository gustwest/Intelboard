"""Report CRUD, datapoint evaluation, and report run endpoints."""
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

import models
import schemas
from db import get_db
from formula import FormulaError, aggregate
from logging_config import log

# We import the evaluation helpers from the modules router
from routers.modules import ModuleEvaluateReq, _evaluate_for_customer, _row_values_for_field, evaluate_module

router = APIRouter(tags=["reports"])


# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------
def _report_to_out(r: models.Report) -> Dict[str, Any]:
    return {
        "id": r.id,
        "customer_id": r.customer_id,
        "name": r.name,
        "description": r.description or "",
        "config": r.config_json or {},
        "created_at": r.created_at.isoformat(),
    }


# ------------------------------------------------------------------
# CRUD
# ------------------------------------------------------------------
@router.get("/api/reports")
def list_reports(customer_id: Optional[str] = None, db: Session = Depends(get_db)):
    q = db.query(models.Report)
    if customer_id:
        c = db.query(models.Customer).filter(
            (models.Customer.id == customer_id) | (models.Customer.slug == customer_id)
        ).first()
        if c:
            q = q.filter((models.Report.customer_id == c.id) | (models.Report.customer_id.is_(None)))
    return [_report_to_out(r) for r in q.order_by(models.Report.created_at.desc()).all()]


@router.post("/api/reports")
def create_report(req: schemas.ReportCreate, db: Session = Depends(get_db)):
    customer_id = None
    if req.customer_id:
        c = db.query(models.Customer).filter(
            (models.Customer.id == req.customer_id) | (models.Customer.slug == req.customer_id)
        ).first()
        if c:
            customer_id = c.id
    r = models.Report(
        customer_id=customer_id,
        name=req.name,
        description=req.description,
        config_json=req.config or {},
    )
    db.add(r)
    db.commit()
    db.refresh(r)
    return _report_to_out(r)


@router.get("/api/reports/{report_id}")
def get_report(report_id: str, db: Session = Depends(get_db)):
    r = db.query(models.Report).filter_by(id=report_id).first()
    if not r:
        raise HTTPException(404, "Report not found")
    return _report_to_out(r)


@router.patch("/api/reports/{report_id}")
def update_report(report_id: str, req: schemas.ReportUpdate, db: Session = Depends(get_db)):
    r = db.query(models.Report).filter_by(id=report_id).first()
    if not r:
        raise HTTPException(404, "Report not found")
    if req.name is not None:
        r.name = req.name
    if req.description is not None:
        r.description = req.description
    if req.config is not None:
        r.config_json = req.config
    db.commit()
    db.refresh(r)
    return _report_to_out(r)


@router.delete("/api/reports/{report_id}")
def delete_report(report_id: str, db: Session = Depends(get_db)):
    r = db.query(models.Report).filter_by(id=report_id).first()
    if not r:
        raise HTTPException(404, "Report not found")
    db.delete(r)
    db.commit()
    return {"deleted": True}


# ------------------------------------------------------------------
# Datapoint evaluation
# ------------------------------------------------------------------
class DatapointSpec(BaseModel):
    source_field_id: str
    alias: Optional[str] = None
    aggregation: str = "sum"


class DatapointEvaluateReq(BaseModel):
    customer_id: str
    source_field_id: str
    aggregation: str = "sum"


@router.post("/api/datapoints/evaluate")
def evaluate_datapoint(req: DatapointEvaluateReq, db: Session = Depends(get_db)):
    """Ad-hoc evaluation of a single SourceField for a single customer."""
    c = db.query(models.Customer).filter(
        (models.Customer.id == req.customer_id) | (models.Customer.slug == req.customer_id)
    ).first()
    if not c:
        raise HTTPException(404, "Customer not found")
    field = db.query(models.SourceField).filter_by(id=req.source_field_id).first()
    if not field:
        raise HTTPException(404, "SourceField not found")
    values = _row_values_for_field(c, field.id, field.source_id)
    try:
        value = aggregate(values, req.aggregation)
    except FormulaError as e:
        return {"value": None, "value_count": len(values), "error": str(e)}
    return {
        "customer_id": c.id,
        "source_field_id": field.id,
        "field_key": field.key,
        "field_unit": field.unit or "",
        "value": value,
        "value_count": len(values),
        "aggregation": req.aggregation,
        "error": None,
    }


# ------------------------------------------------------------------
# Report run
# ------------------------------------------------------------------
class ReportRunReq(BaseModel):
    customer_ids: Optional[List[str]] = None
    module_ids: Optional[List[str]] = None
    datapoints: Optional[List[DatapointSpec]] = None


def _evaluate_datapoint_for_customer(db: Session, dp: DatapointSpec, customer: models.Customer) -> Dict[str, Any]:
    field = db.query(models.SourceField).filter_by(id=dp.source_field_id).first()
    if not field:
        return {
            "customer_id": customer.id,
            "customer_name": customer.name,
            "value": None,
            "error": "Datapunkt saknas",
        }
    values = _row_values_for_field(customer, field.id, field.source_id)
    try:
        value = aggregate(values, dp.aggregation)
    except FormulaError as e:
        return {
            "customer_id": customer.id,
            "customer_name": customer.name,
            "value": None,
            "error": str(e),
        }
    return {
        "customer_id": customer.id,
        "customer_name": customer.name,
        "customer_slug": customer.slug,
        "value": value,
        "value_count": len(values),
        "context": {dp.alias or field.key: value},
        "error": None,
    }


@router.post("/api/reports/{report_id}/run")
def run_report(report_id: str, req: ReportRunReq, db: Session = Depends(get_db)):
    r = db.query(models.Report).filter_by(id=report_id).first()
    if not r:
        raise HTTPException(404, "Report not found")
    cfg = r.config_json or {}
    customer_ids = req.customer_ids or cfg.get("customer_ids") or ([r.customer_id] if r.customer_id else [])
    module_ids = req.module_ids or cfg.get("module_ids") or []

    raw_dps = req.datapoints if req.datapoints is not None else [DatapointSpec(**d) for d in (cfg.get("datapoints") or [])]

    modules = db.query(models.Module).filter(models.Module.id.in_(module_ids)).all() if module_ids else []

    panels = []
    for m in modules:
        eval_req = ModuleEvaluateReq(customer_ids=customer_ids)
        result = evaluate_module(m.id, eval_req, db)
        result["panel_kind"] = "module"
        panels.append(result)

    datapoint_panels: List[Dict[str, Any]] = []
    for dp in raw_dps:
        field = db.query(models.SourceField).filter_by(id=dp.source_field_id).first()
        if not field:
            continue
        results = []
        for cid in customer_ids:
            c = db.query(models.Customer).filter(
                (models.Customer.id == cid) | (models.Customer.slug == cid)
            ).first()
            if not c:
                continue
            results.append(_evaluate_datapoint_for_customer(db, dp, c))
        datapoint_panels.append({
            "panel_kind": "datapoint",
            "source_field_id": field.id,
            "field_key": field.key,
            "field_display_name": field.display_name,
            "field_unit": field.unit or "",
            "alias": dp.alias or field.key,
            "aggregation": dp.aggregation,
            "results": results,
        })

    return {
        "report_id": r.id,
        "name": r.name,
        "customer_ids": customer_ids,
        "module_ids": module_ids,
        "panels": panels,
        "datapoints": datapoint_panels,
        "ran_at": datetime.utcnow().isoformat(),
    }
