import io
import json
import math
import os
import re
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd
from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

import models
import schemas
import sources as src_engine
from db import SessionLocal, get_db, init_db
from engine.monte_carlo import run_multi_domain_simulation
from formula import FormulaError, aggregate, evaluate
from logging_config import clear_recent, get_recent, log

# ------------------------------------------------------------------
# App setup
# ------------------------------------------------------------------
init_db()
app = FastAPI(title="The Insiders Insights — API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def request_logger(request: Request, call_next):
    """Log every HTTP request with status + latency. Skips /api/logs and /health to avoid noise."""
    import time as _t
    start = _t.perf_counter()
    try:
        response = await call_next(request)
    except Exception as exc:
        elapsed_ms = int((_t.perf_counter() - start) * 1000)
        log.exception("http.error", method=request.method, path=request.url.path, elapsed_ms=elapsed_ms)
        raise
    elapsed_ms = int((_t.perf_counter() - start) * 1000)
    skip = request.url.path in ("/health", "/api/logs")
    if not skip:
        level = "warn" if response.status_code >= 400 else "info"
        getattr(log, level)(
            "http.request",
            method=request.method,
            path=request.url.path,
            status=response.status_code,
            elapsed_ms=elapsed_ms,
        )
    return response

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
ISSUES_FILE = os.path.join(DATA_DIR, "issues.json")
UPLOADS_DIR = os.path.join(DATA_DIR, "uploads")
CONVOS_FILE = os.path.join(DATA_DIR, "conversations.json")
os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(UPLOADS_DIR, exist_ok=True)


# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------
class SafeJSONEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, (np.integer,)):
            return int(obj)
        if isinstance(obj, (np.floating,)):
            val = float(obj)
            if math.isnan(val) or math.isinf(val):
                return 0
            return val
        if isinstance(obj, np.ndarray):
            return obj.tolist()
        if isinstance(obj, np.bool_):
            return bool(obj)
        if hasattr(obj, "isoformat"):
            return obj.isoformat()
        return super().default(obj)


def safe_json_dumps(obj):
    return json.dumps(obj, cls=SafeJSONEncoder, ensure_ascii=False)


def _slugify(name: str) -> str:
    s = name.lower().strip()
    s = s.replace("å", "a").replace("ä", "a").replace("ö", "o")
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s or uuid.uuid4().hex[:8]


def _file_json(path: str, default):
    if not os.path.exists(path):
        return default
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _save_json(path: str, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False, default=str)


@app.get("/health")
def health():
    return {"status": "ok", "service": "insiders-api"}


# ------------------------------------------------------------------
# LOGS (debugging aid — returns recent in-memory structured events)
# ------------------------------------------------------------------
@app.get("/api/logs")
def api_logs(limit: int = 200, level: Optional[str] = None):
    return {"count": len(get_recent(limit, level)), "entries": get_recent(limit, level)}


@app.delete("/api/logs")
def api_logs_clear():
    clear_recent()
    return {"cleared": True}


# ------------------------------------------------------------------
# SIMULATION (unchanged)
# ------------------------------------------------------------------
class SimulationRequest(BaseModel):
    followers: int = 5000
    impressions_90d: int = 50000
    linkedin_engagement_rate: float = 0.05
    network_density: float = 0.3
    lurker_ratio: float = 0.8
    trust_multiplier: float = 1.0


@app.post("/api/simulate")
def simulate(req: SimulationRequest):
    result = run_multi_domain_simulation(
        followers=req.followers,
        impressions_90d=req.impressions_90d,
        linkedin_engagement_rate=req.linkedin_engagement_rate,
        network_density=req.network_density,
        lurker_ratio=req.lurker_ratio,
        trust_multiplier=req.trust_multiplier,
        iterations=10000,
    )
    return {"status": "success", "data": result}


# ------------------------------------------------------------------
# CUSTOMERS
# ------------------------------------------------------------------
def _customer_to_out(c: models.Customer) -> Dict[str, Any]:
    return {
        "id": c.id,
        "slug": c.slug,
        "name": c.name,
        "logo_emoji": c.logo_emoji or "🏢",
        "tags": c.tags_json or [],
        "icp": c.icp_json or {},
        "dataset_count": len(c.datasets),
        "module_count": len(c.modules),
        "created_at": c.created_at.isoformat() if c.created_at else None,
    }


@app.get("/api/customers")
def list_customers(db: Session = Depends(get_db)):
    return [_customer_to_out(c) for c in db.query(models.Customer).order_by(models.Customer.created_at.desc()).all()]


@app.post("/api/customers")
def create_customer(req: schemas.CustomerCreate, db: Session = Depends(get_db)):
    slug = _slugify(req.name)
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


@app.get("/api/customers/{customer_id}")
def get_customer(customer_id: str, db: Session = Depends(get_db)):
    c = db.query(models.Customer).filter(
        (models.Customer.id == customer_id) | (models.Customer.slug == customer_id)
    ).first()
    if not c:
        raise HTTPException(404, "Customer not found")
    out = _customer_to_out(c)
    out["datasets"] = [
        {
            "id": d.id,
            "source_id": d.source_id,
            "source_key": d.source.key,
            "source_name": d.source.name,
            "source_version": d.source_version.version,
            "original_filename": d.original_filename,
            "row_count": d.row_count,
            "uploaded_at": d.uploaded_at.isoformat(),
        }
        for d in sorted(c.datasets, key=lambda x: x.uploaded_at, reverse=True)
    ]
    return out


@app.patch("/api/customers/{customer_id}")
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


@app.delete("/api/customers/{customer_id}")
def delete_customer(customer_id: str, db: Session = Depends(get_db)):
    c = db.query(models.Customer).filter(
        (models.Customer.id == customer_id) | (models.Customer.slug == customer_id)
    ).first()
    if not c:
        raise HTTPException(404, "Customer not found")
    db.delete(c)
    db.commit()
    return {"deleted": True}


# ------------------------------------------------------------------
# SOURCES (report types)
# ------------------------------------------------------------------
def _source_to_out(s: models.Source) -> Dict[str, Any]:
    return {
        "id": s.id,
        "key": s.key,
        "name": s.name,
        "description": s.description or "",
        "detect_rules": s.detect_rules_json or {},
        "fields": [
            {
                "id": f.id,
                "key": f.key,
                "display_name": f.display_name,
                "data_type": f.data_type,
                "unit": f.unit or "",
                "description": f.description or "",
                "is_active": f.is_active,
            }
            for f in s.fields
        ],
        "versions": [
            {
                "id": v.id,
                "version": v.version,
                "is_current": v.is_current,
                "notes": v.notes or "",
                "created_at": v.created_at.isoformat(),
                "mappings": [{"source_field_id": m.source_field_id, "column_name": m.column_name} for m in v.mappings],
            }
            for v in sorted(s.versions, key=lambda x: x.version)
        ],
        "current_version_id": next((v.id for v in s.versions if v.is_current), None),
        "created_at": s.created_at.isoformat(),
    }


@app.get("/api/sources")
def list_sources(db: Session = Depends(get_db)):
    return [_source_to_out(s) for s in db.query(models.Source).order_by(models.Source.created_at.desc()).all()]


@app.post("/api/sources")
def create_source(req: schemas.SourceCreate, db: Session = Depends(get_db)):
    key = _slugify(req.key)
    if db.query(models.Source).filter_by(key=key).first():
        raise HTTPException(400, f"Source with key '{key}' already exists")
    source = models.Source(
        key=key,
        name=req.name.strip(),
        description=req.description,
        detect_rules_json=req.detect_rules or {},
    )
    db.add(source)
    db.flush()

    # Fields
    field_by_key: Dict[str, models.SourceField] = {}
    for f_in in req.fields:
        f = models.SourceField(
            source_id=source.id,
            key=_slugify(f_in.key),
            display_name=f_in.display_name,
            data_type=f_in.data_type,
            unit=f_in.unit,
            description=f_in.description,
        )
        db.add(f)
        db.flush()
        field_by_key[f.key] = f

    # Version 1
    version = models.SourceVersion(
        source_id=source.id,
        version=1,
        is_current=True,
        notes="Initial version",
    )
    db.add(version)
    db.flush()

    for field_key, column_name in (req.initial_column_mapping or {}).items():
        fkey = _slugify(field_key)
        if fkey in field_by_key:
            db.add(models.SourceFieldMapping(
                source_version_id=version.id,
                source_field_id=field_by_key[fkey].id,
                column_name=column_name,
            ))

    db.commit()
    db.refresh(source)
    return _source_to_out(source)


@app.get("/api/sources/{source_id}")
def get_source(source_id: str, db: Session = Depends(get_db)):
    s = db.query(models.Source).filter(
        (models.Source.id == source_id) | (models.Source.key == source_id)
    ).first()
    if not s:
        raise HTTPException(404, "Source not found")
    return _source_to_out(s)


@app.patch("/api/sources/{source_id}")
def update_source(source_id: str, req: schemas.SourceUpdate, db: Session = Depends(get_db)):
    s = db.query(models.Source).filter(
        (models.Source.id == source_id) | (models.Source.key == source_id)
    ).first()
    if not s:
        raise HTTPException(404, "Source not found")
    if req.name is not None:
        s.name = req.name.strip()
    if req.description is not None:
        s.description = req.description
    if req.detect_rules is not None:
        s.detect_rules_json = req.detect_rules
    db.commit()
    db.refresh(s)
    return _source_to_out(s)


@app.delete("/api/sources/{source_id}")
def delete_source(source_id: str, db: Session = Depends(get_db)):
    s = db.query(models.Source).filter(
        (models.Source.id == source_id) | (models.Source.key == source_id)
    ).first()
    if not s:
        raise HTTPException(404, "Source not found")
    db.delete(s)
    db.commit()
    return {"deleted": True}


class SourceFieldAdd(BaseModel):
    key: str
    display_name: str
    data_type: str = "str"
    unit: str = ""
    description: str = ""


@app.post("/api/sources/{source_id}/fields")
def add_source_field(source_id: str, req: SourceFieldAdd, db: Session = Depends(get_db)):
    s = db.query(models.Source).filter(
        (models.Source.id == source_id) | (models.Source.key == source_id)
    ).first()
    if not s:
        raise HTTPException(404, "Source not found")
    fkey = _slugify(req.key)
    if any(f.key == fkey for f in s.fields):
        raise HTTPException(400, f"Field with key '{fkey}' already exists")
    f = models.SourceField(
        source_id=s.id,
        key=fkey,
        display_name=req.display_name,
        data_type=req.data_type,
        unit=req.unit,
        description=req.description,
    )
    db.add(f)
    db.commit()
    db.refresh(s)
    return _source_to_out(s)


@app.delete("/api/sources/{source_id}/fields/{field_id}")
def delete_source_field(source_id: str, field_id: str, db: Session = Depends(get_db)):
    f = db.query(models.SourceField).filter_by(id=field_id).first()
    if not f:
        raise HTTPException(404, "Field not found")
    db.delete(f)
    db.commit()
    return {"deleted": True}


@app.post("/api/sources/{source_id}/versions")
def create_source_version(source_id: str, req: schemas.SourceVersionIn, db: Session = Depends(get_db)):
    s = db.query(models.Source).filter(
        (models.Source.id == source_id) | (models.Source.key == source_id)
    ).first()
    if not s:
        raise HTTPException(404, "Source not found")
    # Mark current as not current
    for v in s.versions:
        v.is_current = False
    new_version_num = (max((v.version for v in s.versions), default=0) or 0) + 1
    version = models.SourceVersion(
        source_id=s.id,
        version=new_version_num,
        is_current=True,
        notes=req.notes,
    )
    db.add(version)
    db.flush()
    for m in req.mappings:
        db.add(models.SourceFieldMapping(
            source_version_id=version.id,
            source_field_id=m.source_field_id,
            column_name=m.column_name,
        ))
    db.commit()
    db.refresh(s)
    return _source_to_out(s)


# ------------------------------------------------------------------
# UPLOAD + DETECT
# ------------------------------------------------------------------
@app.post("/api/customers/{customer_id}/upload")
async def upload_to_customer(customer_id: str, file: UploadFile = File(...), db: Session = Depends(get_db)):
    c = db.query(models.Customer).filter(
        (models.Customer.id == customer_id) | (models.Customer.slug == customer_id)
    ).first()
    if not c:
        raise HTTPException(404, "Customer not found")

    raw = await file.read()
    log.info("upload.received", customer=c.slug, filename=file.filename, size_bytes=len(raw))
    df = src_engine.parse_file(raw, file.filename or "upload.csv")
    if df is None:
        log.warn("upload.parse_failed", customer=c.slug, filename=file.filename)
        raise HTTPException(422, "Kunde inte läsa filen. Stöd: CSV, TSV, XLS, XLSX.")

    status, source, version, detail = src_engine.detect_source(db, df, file.filename or "")
    log.info(
        "upload.detect",
        customer=c.slug,
        filename=file.filename,
        status=status,
        source=source.key if source else None,
        version=version.version if version else None,
        overlap=detail.get("overlap"),
        file_columns=len(df.columns),
    )

    if status == "no_match":
        return {
            "status": "no_match",
            "message": "Kunde inte känna igen filen som en registrerad Source. Skapa en ny Source först.",
            "file_columns": detail.get("file_columns", []),
            "row_count": int(len(df)),
        }

    if status == "drift":
        return {
            "status": "drift",
            "message": f"Filen liknar '{source.name}' men kolumnerna matchar inte nuvarande version fullt ut. Skapa en ny SourceVersion?",
            "source_id": source.id,
            "source_key": source.key,
            "source_version_id": version.id,
            "source_version": version.version,
            "matched_columns": detail.get("matched_columns", []),
            "missing_columns": detail.get("missing_columns", []),
            "extra_columns": detail.get("extra_columns", []),
            "row_count": int(len(df)),
        }

    # matched → ingest
    dataset = src_engine.ingest_dataset(db, c, source, version, df, file.filename or "upload", raw)
    log.info("upload.ingested", customer=c.slug, source=source.key, version=version.version, rows=dataset.row_count, dataset_id=dataset.id)
    return {
        "status": "matched",
        "dataset_id": dataset.id,
        "source_id": source.id,
        "source_key": source.key,
        "source_version": version.version,
        "original_filename": dataset.original_filename,
        "row_count": dataset.row_count,
        "matched_columns": detail.get("matched_columns", []),
        "missing_columns": detail.get("missing_columns", []),
        "extra_columns": detail.get("extra_columns", []),
    }


class ForceIngestReq(BaseModel):
    source_version_id: str


@app.post("/api/customers/{customer_id}/upload/force")
async def force_ingest(customer_id: str, source_version_id: str = Form(...), file: UploadFile = File(...), db: Session = Depends(get_db)):
    """Ingest a file against an explicitly chosen SourceVersion (used after 'drift' warning)."""
    c = db.query(models.Customer).filter(
        (models.Customer.id == customer_id) | (models.Customer.slug == customer_id)
    ).first()
    if not c:
        raise HTTPException(404, "Customer not found")

    version = db.query(models.SourceVersion).filter_by(id=source_version_id).first()
    if not version:
        raise HTTPException(404, "SourceVersion not found")

    raw = await file.read()
    df = src_engine.parse_file(raw, file.filename or "upload.csv")
    if df is None:
        raise HTTPException(422, "Kunde inte läsa filen.")
    dataset = src_engine.ingest_dataset(db, c, version.source, version, df, file.filename or "upload", raw)
    return {"status": "ingested", "dataset_id": dataset.id, "row_count": dataset.row_count}


# ------------------------------------------------------------------
# DATASETS
# ------------------------------------------------------------------
@app.get("/api/datasets/{dataset_id}")
def get_dataset(dataset_id: str, page: int = 1, page_size: int = 100, db: Session = Depends(get_db)):
    d = db.query(models.Dataset).filter_by(id=dataset_id).first()
    if not d:
        raise HTTPException(404, "Dataset not found")

    # Columns: fields used in this source's current version mappings
    fields = [mapping.source_field for mapping in d.source_version.mappings]
    columns = [
        {"field_id": f.id, "key": f.key, "display_name": f.display_name, "unit": f.unit or "", "data_type": f.data_type}
        for f in fields
    ]
    field_id_to_key = {f.id: f.key for f in fields}

    total = len(d.rows)
    rows_sorted = sorted(d.rows, key=lambda r: r.row_index)
    start = (page - 1) * page_size
    end = start + page_size
    page_rows = rows_sorted[start:end]

    out_rows = []
    for r in page_rows:
        out = {}
        for field_id, value in (r.values_json or {}).items():
            key = field_id_to_key.get(field_id)
            if key:
                out[key] = value
        out_rows.append(out)

    return {
        "dataset_id": d.id,
        "customer_id": d.customer_id,
        "source_id": d.source_id,
        "source_key": d.source.key,
        "source_name": d.source.name,
        "source_version": d.source_version.version,
        "original_filename": d.original_filename,
        "row_count": d.row_count,
        "columns": columns,
        "rows": out_rows,
        "page": page,
        "page_size": page_size,
        "total": total,
        "total_pages": (total + page_size - 1) // page_size,
    }


@app.delete("/api/datasets/{dataset_id}")
def delete_dataset(dataset_id: str, db: Session = Depends(get_db)):
    d = db.query(models.Dataset).filter_by(id=dataset_id).first()
    if not d:
        raise HTTPException(404, "Dataset not found")
    db.delete(d)
    db.commit()
    return {"deleted": True}


# ------------------------------------------------------------------
# MODULES
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


@app.get("/api/modules")
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


@app.post("/api/modules")
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


@app.get("/api/modules/{module_id}")
def get_module(module_id: str, db: Session = Depends(get_db)):
    m = db.query(models.Module).filter_by(id=module_id).first()
    if not m:
        raise HTTPException(404, "Module not found")
    return _module_to_out(m)


@app.patch("/api/modules/{module_id}")
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
        # replace all field_refs
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


@app.delete("/api/modules/{module_id}")
def delete_module(module_id: str, db: Session = Depends(get_db)):
    m = db.query(models.Module).filter_by(id=module_id).first()
    if not m:
        raise HTTPException(404, "Module not found")
    db.delete(m)
    db.commit()
    return {"deleted": True}


class ModuleCloneReq(BaseModel):
    customer_id: str
    name_override: Optional[str] = None


@app.post("/api/modules/{module_id}/clone")
def clone_module(module_id: str, req: ModuleCloneReq, db: Session = Depends(get_db)):
    """Clone a module (typically a global template) into a customer-specific copy.
    The clone keeps the same field_refs so it runs immediately against that customer's data."""
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


# ---- Evaluation ----
class ModuleEvaluateReq(BaseModel):
    customer_ids: List[str]  # one or many (for global view)
    # Optional per-alias aggregation override: { alias: "sum" | "avg" | ... }
    aggregations: Optional[Dict[str, str]] = None


def _row_values_for_field(customer: models.Customer, source_field_id: str, source_id: str, row_filter=None) -> List[Any]:
    """Collect raw values for a SourceField across this customer's datasets.
    Optional row_filter(row) filters DatasetRow before pulling the value."""
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

    row_filter (optional) lets callers narrow DatasetRows (used by trend bucketing).
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
        # Child module has its own alias scope — don't leak parent's per-alias overrides.
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

    # 3. Constants (custom values bound into the module)
    for k, v in (formula.get("constants") or {}).items():
        if k in context:
            continue  # don't shadow refs
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


@app.post("/api/modules/{module_id}/evaluate")
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
# BULK MODULE EVALUATE (per customer)
# ------------------------------------------------------------------
class BulkEvaluateReq(BaseModel):
    module_ids: List[str]
    aggregations: Optional[Dict[str, str]] = None


@app.post("/api/customers/{customer_id}/evaluate")
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
# REPORTS (saved views)
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


@app.get("/api/reports")
def list_reports(customer_id: Optional[str] = None, db: Session = Depends(get_db)):
    q = db.query(models.Report)
    if customer_id:
        c = db.query(models.Customer).filter(
            (models.Customer.id == customer_id) | (models.Customer.slug == customer_id)
        ).first()
        if c:
            q = q.filter((models.Report.customer_id == c.id) | (models.Report.customer_id.is_(None)))
    return [_report_to_out(r) for r in q.order_by(models.Report.created_at.desc()).all()]


@app.post("/api/reports")
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


@app.get("/api/reports/{report_id}")
def get_report(report_id: str, db: Session = Depends(get_db)):
    r = db.query(models.Report).filter_by(id=report_id).first()
    if not r:
        raise HTTPException(404, "Report not found")
    return _report_to_out(r)


@app.patch("/api/reports/{report_id}")
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


@app.delete("/api/reports/{report_id}")
def delete_report(report_id: str, db: Session = Depends(get_db)):
    r = db.query(models.Report).filter_by(id=report_id).first()
    if not r:
        raise HTTPException(404, "Report not found")
    db.delete(r)
    db.commit()
    return {"deleted": True}


class DatapointSpec(BaseModel):
    source_field_id: str
    alias: Optional[str] = None
    aggregation: str = "sum"


class DatapointEvaluateReq(BaseModel):
    customer_id: str
    source_field_id: str
    aggregation: str = "sum"


@app.post("/api/datapoints/evaluate")
def evaluate_datapoint(req: DatapointEvaluateReq, db: Session = Depends(get_db)):
    """Ad-hoc evaluation of a single SourceField for a single customer.
    Used by the report page when user picks raw datapoints alongside modules."""
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


class ReportRunReq(BaseModel):
    customer_ids: Optional[List[str]] = None  # overrides config
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


@app.post("/api/reports/{report_id}/run")
def run_report(report_id: str, req: ReportRunReq, db: Session = Depends(get_db)):
    r = db.query(models.Report).filter_by(id=report_id).first()
    if not r:
        raise HTTPException(404, "Report not found")
    cfg = r.config_json or {}
    customer_ids = req.customer_ids or cfg.get("customer_ids") or ([r.customer_id] if r.customer_id else [])
    module_ids = req.module_ids or cfg.get("module_ids") or []

    # Datapoints can come from request or config
    raw_dps = req.datapoints if req.datapoints is not None else [DatapointSpec(**d) for d in (cfg.get("datapoints") or [])]

    modules = db.query(models.Module).filter(models.Module.id.in_(module_ids)).all() if module_ids else []

    panels = []
    for m in modules:
        evaluate_req = ModuleEvaluateReq(customer_ids=customer_ids)
        result = evaluate_module(m.id, evaluate_req, db)
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


# ------------------------------------------------------------------
# TREND / TIME-SERIES
# ------------------------------------------------------------------
def _bucket_key(value: Any, granularity: str) -> Optional[str]:
    """Parse a row value as a date/datetime and return its bucket key.
    Returns None if value can't be parsed."""
    if value is None or value == "":
        return None
    try:
        # pandas handles strings, ints (epoch), and datetimes uniformly
        ts = pd.to_datetime(value, errors="coerce")
    except Exception:
        return None
    if ts is None or pd.isna(ts):
        return None
    if granularity == "month":
        return ts.strftime("%Y-%m")
    if granularity == "week":
        # ISO week: e.g. "2026-W17"
        iso = ts.isocalendar()
        return f"{iso.year:04d}-W{iso.week:02d}"
    # default: day
    return ts.strftime("%Y-%m-%d")


def _evaluate_trend_for_customer(
    db: Session,
    module: models.Module,
    customer: models.Customer,
    date_field_id: str,
    granularity: str,
    default_aggs: Dict[str, str],
) -> List[Dict[str, Any]]:
    """Bucket this customer's rows by the given date field's value, then evaluate the
    module per bucket. Returns a list of {period, value, context, error}."""
    # Build period -> set of row ids belonging to that period
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
    granularity: str = "day"  # day | week | month
    aggregations: Optional[Dict[str, str]] = None


@app.post("/api/modules/{module_id}/trend")
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


# ------------------------------------------------------------------
# KANBAN / ISSUES (kept — collaboration feature)
# ------------------------------------------------------------------
class IssueCreate(BaseModel):
    title: str
    description: str
    images: Optional[List[Dict[str, str]]] = None


class IssueUpdate(BaseModel):
    status: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None


class CommentCreate(BaseModel):
    body: str
    author: str = "Team Member"
    images: Optional[List[Dict[str, str]]] = None


@app.get("/api/issues")
def list_issues():
    return _file_json(ISSUES_FILE, [])


@app.post("/api/issues")
def create_issue(req: IssueCreate):
    issues = _file_json(ISSUES_FILE, [])
    issue = {
        "id": str(uuid.uuid4()),
        "title": req.title.strip(),
        "description": req.description.strip(),
        "status": "NY",
        "order": len([i for i in issues if i["status"] == "NY"]),
        "images": req.images or [],
        "comments": [],
        "createdAt": datetime.utcnow().isoformat(),
        "updatedAt": datetime.utcnow().isoformat(),
    }
    issues.insert(0, issue)
    _save_json(ISSUES_FILE, issues)
    return issue


@app.patch("/api/issues/{issue_id}")
def update_issue(issue_id: str, req: IssueUpdate):
    issues = _file_json(ISSUES_FILE, [])
    for issue in issues:
        if issue["id"] == issue_id:
            if req.status is not None: issue["status"] = req.status
            if req.title is not None: issue["title"] = req.title.strip()
            if req.description is not None: issue["description"] = req.description.strip()
            issue["updatedAt"] = datetime.utcnow().isoformat()
            _save_json(ISSUES_FILE, issues)
            return issue
    raise HTTPException(404, "Issue not found")


@app.delete("/api/issues/{issue_id}")
def delete_issue(issue_id: str):
    issues = _file_json(ISSUES_FILE, [])
    issues = [i for i in issues if i["id"] != issue_id]
    _save_json(ISSUES_FILE, issues)
    return {"deleted": True}


@app.post("/api/issues/{issue_id}/comments")
def add_comment(issue_id: str, req: CommentCreate):
    issues = _file_json(ISSUES_FILE, [])
    for issue in issues:
        if issue["id"] == issue_id:
            comment = {
                "id": str(uuid.uuid4()),
                "body": req.body.strip(),
                "author": req.author,
                "images": req.images or [],
                "createdAt": datetime.utcnow().isoformat(),
            }
            issue["comments"].append(comment)
            issue["updatedAt"] = datetime.utcnow().isoformat()
            _save_json(ISSUES_FILE, issues)
            return comment
    raise HTTPException(404, "Issue not found")


# ------------------------------------------------------------------
# FILE UPLOADS (generic admin file store — kept)
# ------------------------------------------------------------------
FILES_META = os.path.join(DATA_DIR, "files.json")


@app.get("/api/files")
def list_files():
    return _file_json(FILES_META, [])


@app.post("/api/files")
async def upload_file(file: UploadFile = File(...), name: str = Form(""), category: str = Form("Övrigt")):
    file_id = str(uuid.uuid4())
    ext = os.path.splitext(file.filename or "file")[1]
    stored_name = f"{file_id}{ext}"
    filepath = os.path.join(UPLOADS_DIR, stored_name)
    content = await file.read()
    with open(filepath, "wb") as f:
        f.write(content)
    meta = {
        "id": file_id,
        "originalName": file.filename,
        "displayName": name.strip() or file.filename,
        "category": category.strip(),
        "storedName": stored_name,
        "size": len(content),
        "contentType": file.content_type,
        "uploadedAt": datetime.utcnow().isoformat(),
    }
    files = _file_json(FILES_META, [])
    files.insert(0, meta)
    _save_json(FILES_META, files)
    return meta


@app.get("/api/files/{file_id}/download")
def download_file(file_id: str):
    files = _file_json(FILES_META, [])
    meta = next((f for f in files if f["id"] == file_id), None)
    if not meta:
        return Response(status_code=404, content="Not found")
    filepath = os.path.join(UPLOADS_DIR, meta["storedName"])
    if not os.path.exists(filepath):
        return Response(status_code=404, content="File not found on disk")
    with open(filepath, "rb") as f:
        content = f.read()
    return Response(
        content=content,
        media_type=meta.get("contentType", "application/octet-stream"),
        headers={"Content-Disposition": f'attachment; filename="{meta["originalName"]}"'},
    )


@app.delete("/api/files/{file_id}")
def delete_file(file_id: str):
    files = _file_json(FILES_META, [])
    meta = next((f for f in files if f["id"] == file_id), None)
    if meta:
        filepath = os.path.join(UPLOADS_DIR, meta["storedName"])
        if os.path.exists(filepath):
            os.remove(filepath)
    files = [f for f in files if f["id"] != file_id]
    _save_json(FILES_META, files)
    return {"deleted": True}


# ------------------------------------------------------------------
# CHAT (kept — WebSocket + message history)
# ------------------------------------------------------------------
class ConnectionManager:
    def __init__(self):
        self.active: Dict[str, list] = {}

    async def connect(self, ws: WebSocket, convo_id: str):
        await ws.accept()
        self.active.setdefault(convo_id, []).append(ws)

    def disconnect(self, ws: WebSocket, convo_id: str):
        if convo_id in self.active:
            self.active[convo_id] = [w for w in self.active[convo_id] if w != ws]

    async def broadcast(self, convo_id: str, data: dict):
        for ws in self.active.get(convo_id, []):
            try:
                await ws.send_json(data)
            except Exception:
                pass


manager = ConnectionManager()


class ConvoCreate(BaseModel):
    name: str
    members: List[str]
    emoji: Optional[str] = "💬"


class MsgSend(BaseModel):
    body: str
    author: str
    images: Optional[List[str]] = None


class ReactionToggle(BaseModel):
    emoji: str
    user: str


@app.get("/api/conversations")
def list_conversations():
    return _file_json(CONVOS_FILE, [])


@app.post("/api/conversations")
def create_conversation(req: ConvoCreate):
    convos = _file_json(CONVOS_FILE, [])
    convo = {
        "id": str(uuid.uuid4()),
        "name": req.name.strip(),
        "members": req.members,
        "emoji": req.emoji or "💬",
        "messages": [],
        "createdAt": datetime.utcnow().isoformat(),
        "updatedAt": datetime.utcnow().isoformat(),
    }
    convos.insert(0, convo)
    _save_json(CONVOS_FILE, convos)
    return convo


@app.delete("/api/conversations/{convo_id}")
def delete_conversation(convo_id: str):
    convos = _file_json(CONVOS_FILE, [])
    convos = [c for c in convos if c["id"] != convo_id]
    _save_json(CONVOS_FILE, convos)
    return {"deleted": True}


@app.get("/api/conversations/{convo_id}/messages")
def get_messages(convo_id: str):
    convos = _file_json(CONVOS_FILE, [])
    convo = next((c for c in convos if c["id"] == convo_id), None)
    return convo.get("messages", []) if convo else []


@app.post("/api/conversations/{convo_id}/messages")
async def send_msg(convo_id: str, req: MsgSend):
    convos = _file_json(CONVOS_FILE, [])
    convo = next((c for c in convos if c["id"] == convo_id), None)
    if not convo:
        return Response(status_code=404, content="Conversation not found")
    message = {
        "id": str(uuid.uuid4()),
        "body": req.body.strip(),
        "author": req.author.strip(),
        "images": req.images or [],
        "attachments": [],
        "reactions": [],
        "createdAt": datetime.utcnow().isoformat(),
    }
    convo["messages"].append(message)
    convo["updatedAt"] = datetime.utcnow().isoformat()
    _save_json(CONVOS_FILE, convos)
    await manager.broadcast(convo_id, {"type": "new_message", "message": message})
    return message


@app.post("/api/conversations/{convo_id}/upload")
async def convo_upload(convo_id: str, file: UploadFile = File(...), author: str = Form(""), body: str = Form("")):
    convos = _file_json(CONVOS_FILE, [])
    convo = next((c for c in convos if c["id"] == convo_id), None)
    if not convo:
        return Response(status_code=404, content="Conversation not found")
    file_id = str(uuid.uuid4())
    ext = os.path.splitext(file.filename or "file")[1]
    stored_name = f"chat_{file_id}{ext}"
    filepath = os.path.join(UPLOADS_DIR, stored_name)
    content = await file.read()
    with open(filepath, "wb") as f:
        f.write(content)
    attachment = {
        "id": file_id,
        "name": file.filename,
        "storedName": stored_name,
        "size": len(content),
        "contentType": file.content_type,
    }
    message = {
        "id": str(uuid.uuid4()),
        "body": body.strip(),
        "author": author.strip() or "Okänd",
        "images": [],
        "attachments": [attachment],
        "reactions": [],
        "createdAt": datetime.utcnow().isoformat(),
    }
    convo["messages"].append(message)
    convo["updatedAt"] = datetime.utcnow().isoformat()
    _save_json(CONVOS_FILE, convos)
    await manager.broadcast(convo_id, {"type": "new_message", "message": message})
    return message


@app.get("/api/conversations/attachment/{file_id}")
def download_chat_attachment(file_id: str):
    convos = _file_json(CONVOS_FILE, [])
    for convo in convos:
        for msg in convo.get("messages", []):
            for att in msg.get("attachments", []):
                if att["id"] == file_id:
                    filepath = os.path.join(UPLOADS_DIR, att["storedName"])
                    if not os.path.exists(filepath):
                        return Response(status_code=404, content="File not found")
                    with open(filepath, "rb") as f:
                        data = f.read()
                    return Response(
                        content=data,
                        media_type=att.get("contentType", "application/octet-stream"),
                        headers={"Content-Disposition": f'attachment; filename="{att["name"]}"'},
                    )
    return Response(status_code=404, content="Attachment not found")


@app.post("/api/conversations/{convo_id}/messages/{msg_id}/react")
async def toggle_reaction(convo_id: str, msg_id: str, req: ReactionToggle):
    convos = _file_json(CONVOS_FILE, [])
    convo = next((c for c in convos if c["id"] == convo_id), None)
    if not convo:
        return Response(status_code=404, content="Not found")
    msg = next((m for m in convo.get("messages", []) if m["id"] == msg_id), None)
    if not msg:
        return Response(status_code=404, content="Message not found")
    reactions = msg.get("reactions", [])
    existing = next((r for r in reactions if r["emoji"] == req.emoji and r["user"] == req.user), None)
    if existing:
        reactions.remove(existing)
    else:
        reactions.append({"emoji": req.emoji, "user": req.user})
    msg["reactions"] = reactions
    _save_json(CONVOS_FILE, convos)
    await manager.broadcast(convo_id, {"type": "reaction", "messageId": msg_id, "reactions": reactions})
    return {"reactions": reactions}


@app.websocket("/ws/chat/{convo_id}")
async def ws_chat(ws: WebSocket, convo_id: str):
    await manager.connect(ws, convo_id)
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(ws, convo_id)
