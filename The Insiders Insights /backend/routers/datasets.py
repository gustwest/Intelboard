"""Upload, detect, and dataset endpoints — with SQL pagination."""
from typing import Any, Dict

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

import models
import sources as src_engine
import ai as ai_engine
from db import get_db
from logging_config import log

router = APIRouter(tags=["datasets"])


def _generate_and_save_summary(db: Session, dataset: models.Dataset, df, filename: str, source_name: str):
    """Generate AI summary synchronously and save to dataset.
    
    Runs inline (not async) because Cloud Run kills daemon threads
    after the HTTP response is sent. Gemini Flash is fast (~1-2s).
    """
    try:
        summary = ai_engine.summarize_dataset(df.head(500), filename, source_name)
        if summary:
            dataset.ai_summary = summary
            db.commit()
            log.info("ai.summary_saved", dataset_id=dataset.id, length=len(summary))
    except Exception as e:
        log.warn("ai.summary_error", dataset_id=dataset.id, error=str(e))


# ------------------------------------------------------------------
# Upload + Detect
# ------------------------------------------------------------------
@router.post("/api/customers/{customer_id}/upload")
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
        # Auto-create Source from the file's columns
        log.info("upload.auto_create_source", customer=c.slug, filename=file.filename, file_columns=len(df.columns))
        source, version = src_engine.auto_create_source(db, df, file.filename or "upload.csv")
        dataset = src_engine.ingest_dataset(db, c, source, version, df, file.filename or "upload", raw)
        log.info("upload.auto_created", customer=c.slug, source=source.key, fields=len(source.fields), rows=dataset.row_count)
        _generate_and_save_summary(db, dataset, df, file.filename or "upload.csv", source.name)
        return {
            "status": "auto_created",
            "message": f"Ny Source '{source.name}' skapades automatiskt med {len(source.fields)} fält.",
            "dataset_id": dataset.id,
            "source_id": source.id,
            "source_key": source.key,
            "source_name": source.name,
            "source_version": version.version,
            "original_filename": dataset.original_filename,
            "row_count": dataset.row_count,
            "ai_summary": dataset.ai_summary or "",
            "fields_created": len(source.fields),
        }

    if status == "drift":
        # Auto-create new SourceVersion with updated mappings
        log.info("upload.auto_version_bump", customer=c.slug, source=source.key, filename=file.filename)
        new_version = src_engine.auto_create_version(db, source, version, df, file.filename or "upload.csv")
        dataset = src_engine.ingest_dataset(db, c, source, new_version, df, file.filename or "upload", raw)
        log.info("upload.version_bumped", customer=c.slug, source=source.key, new_version=new_version.version, rows=dataset.row_count)
        _generate_and_save_summary(db, dataset, df, file.filename or "upload.csv", source.name)
        return {
            "status": "version_bumped",
            "message": f"Ny version (v{new_version.version}) av '{source.name}' skapades automatiskt.",
            "dataset_id": dataset.id,
            "source_id": source.id,
            "source_key": source.key,
            "source_name": source.name,
            "source_version": new_version.version,
            "original_filename": dataset.original_filename,
            "row_count": dataset.row_count,
            "ai_summary": dataset.ai_summary or "",
        }

    # matched → ingest
    dataset = src_engine.ingest_dataset(db, c, source, version, df, file.filename or "upload", raw)
    log.info("upload.ingested", customer=c.slug, source=source.key, version=version.version, rows=dataset.row_count, dataset_id=dataset.id)
    _generate_and_save_summary(db, dataset, df, file.filename or "upload", source.name)
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
        "ai_summary": dataset.ai_summary or "",
    }


@router.post("/api/customers/{customer_id}/upload/force")
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
# Datasets — AI Regeneration (must be before {dataset_id} routes)
# ------------------------------------------------------------------
@router.post("/api/datasets/regenerate-summaries")
def regenerate_summaries(db: Session = Depends(get_db)):
    """Regenerate AI summaries for all datasets that don't have one yet."""
    import pandas as pd

    datasets = (
        db.query(models.Dataset)
        .options(
            joinedload(models.Dataset.source),
            joinedload(models.Dataset.source_version)
            .joinedload(models.SourceVersion.mappings)
            .joinedload(models.SourceFieldMapping.source_field),
        )
        .filter(
            (models.Dataset.ai_summary == None) | (models.Dataset.ai_summary == "")  # noqa: E711
        )
        .all()
    )

    results = []
    for d in datasets:
        try:
            fields = [m.source_field for m in d.source_version.mappings]
            field_id_to_key = {f.id: f.key for f in fields}

            rows = (
                db.query(models.DatasetRow)
                .filter_by(dataset_id=d.id)
                .order_by(models.DatasetRow.row_index)
                .limit(500)
                .all()
            )
            out_rows = []
            for r in rows:
                out = {}
                for fid, val in (r.values_json or {}).items():
                    key = field_id_to_key.get(fid)
                    if key:
                        out[key] = val
                out_rows.append(out)

            if not out_rows:
                continue

            df = pd.DataFrame(out_rows)
            summary = ai_engine.summarize_dataset(df, d.original_filename, d.source.name)
            if summary:
                d.ai_summary = summary
                db.commit()
                results.append({"dataset_id": d.id, "filename": d.original_filename, "status": "ok", "length": len(summary)})
                log.info("ai.regenerate_ok", dataset_id=d.id, filename=d.original_filename)
            else:
                results.append({"dataset_id": d.id, "filename": d.original_filename, "status": "skipped"})
        except Exception as e:
            log.warn("ai.regenerate_error", dataset_id=d.id, error=str(e))
            results.append({"dataset_id": d.id, "filename": d.original_filename, "status": "error", "error": str(e)})

    return {"processed": len(results), "results": results}


@router.post("/api/datasets/backfill-granularity")
def backfill_granularity(db: Session = Depends(get_db)):
    """Detect and save granularity + period_start/end for all datasets missing it."""
    import pandas as pd

    datasets = (
        db.query(models.Dataset)
        .options(
            joinedload(models.Dataset.source),
            joinedload(models.Dataset.source_version)
            .joinedload(models.SourceVersion.mappings)
            .joinedload(models.SourceFieldMapping.source_field),
        )
        .filter(
            (models.Dataset.granularity == None) |  # noqa: E711
            (models.Dataset.granularity == "") |
            (models.Dataset.granularity == "unknown")
        )
        .all()
    )

    results = []
    for d in datasets:
        try:
            fields = [m.source_field for m in d.source_version.mappings]
            field_id_to_key = {f.id: f.key for f in fields}

            rows = (
                db.query(models.DatasetRow)
                .filter_by(dataset_id=d.id)
                .order_by(models.DatasetRow.row_index)
                .limit(500)
                .all()
            )
            out_rows = []
            for r in rows:
                out = {}
                for fid, val in (r.values_json or {}).items():
                    key = field_id_to_key.get(fid)
                    if key:
                        out[key] = val
                out_rows.append(out)

            if not out_rows:
                results.append({"dataset_id": d.id, "filename": d.original_filename, "status": "no_rows"})
                continue

            df = pd.DataFrame(out_rows)
            granularity, period_start, period_end = src_engine.detect_granularity(df)

            d.granularity = granularity
            d.period_start = period_start
            d.period_end = period_end
            db.commit()

            results.append({
                "dataset_id": d.id,
                "filename": d.original_filename,
                "status": "ok",
                "granularity": granularity,
                "period_start": period_start,
                "period_end": period_end,
            })
            log.info("granularity.backfill_ok", dataset_id=d.id, granularity=granularity,
                     period_start=period_start, period_end=period_end)
        except Exception as e:
            log.warn("granularity.backfill_error", dataset_id=d.id, error=str(e))
            results.append({"dataset_id": d.id, "filename": d.original_filename, "status": "error", "error": str(e)})

    return {"processed": len(results), "results": results}

# ------------------------------------------------------------------
# Datasets — SQL OFFSET/LIMIT pagination
# ------------------------------------------------------------------
@router.get("/api/datasets/{dataset_id}")
def get_dataset(dataset_id: str, page: int = 1, page_size: int = 100, db: Session = Depends(get_db)):
    d = (
        db.query(models.Dataset)
        .options(
            joinedload(models.Dataset.source),
            joinedload(models.Dataset.source_version).joinedload(models.SourceVersion.mappings).joinedload(models.SourceFieldMapping.source_field),
        )
        .filter_by(id=dataset_id)
        .first()
    )
    if not d:
        raise HTTPException(404, "Dataset not found")

    # Columns from version mappings
    fields = [mapping.source_field for mapping in d.source_version.mappings]
    columns = [
        {"field_id": f.id, "key": f.key, "display_name": f.display_name, "unit": f.unit or "", "data_type": f.data_type}
        for f in fields
    ]
    field_id_to_key = {f.id: f.key for f in fields}

    # SQL-level pagination (no loading all rows into memory)
    total = db.query(func.count(models.DatasetRow.id)).filter_by(dataset_id=d.id).scalar() or 0
    offset = (page - 1) * page_size
    page_rows = (
        db.query(models.DatasetRow)
        .filter_by(dataset_id=d.id)
        .order_by(models.DatasetRow.row_index)
        .offset(offset)
        .limit(page_size)
        .all()
    )

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
        "total_pages": (total + page_size - 1) // page_size if total > 0 else 0,
    }


@router.delete("/api/datasets/{dataset_id}")
def delete_dataset(dataset_id: str, db: Session = Depends(get_db)):
    d = db.query(models.Dataset).filter_by(id=dataset_id).first()
    if not d:
        raise HTTPException(404, "Dataset not found")
    db.delete(d)
    db.commit()
    return {"deleted": True}

