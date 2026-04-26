"""Source (report type) management endpoints."""
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

import models
import schemas
from db import get_db
from helpers import slugify

router = APIRouter(prefix="/api/sources", tags=["sources"])


# ------------------------------------------------------------------
# Helpers
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


# ------------------------------------------------------------------
# Routes
# ------------------------------------------------------------------
@router.get("")
def list_sources(db: Session = Depends(get_db)):
    return [_source_to_out(s) for s in db.query(models.Source).order_by(models.Source.created_at.desc()).all()]


@router.post("")
def create_source(req: schemas.SourceCreate, db: Session = Depends(get_db)):
    key = slugify(req.key)
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
            key=slugify(f_in.key),
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
        fkey = slugify(field_key)
        if fkey in field_by_key:
            db.add(models.SourceFieldMapping(
                source_version_id=version.id,
                source_field_id=field_by_key[fkey].id,
                column_name=column_name,
            ))

    db.commit()
    db.refresh(source)
    return _source_to_out(source)


@router.get("/{source_id}")
def get_source(source_id: str, db: Session = Depends(get_db)):
    s = db.query(models.Source).filter(
        (models.Source.id == source_id) | (models.Source.key == source_id)
    ).first()
    if not s:
        raise HTTPException(404, "Source not found")
    return _source_to_out(s)


@router.patch("/{source_id}")
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


@router.delete("/{source_id}")
def delete_source(source_id: str, db: Session = Depends(get_db)):
    s = db.query(models.Source).filter(
        (models.Source.id == source_id) | (models.Source.key == source_id)
    ).first()
    if not s:
        raise HTTPException(404, "Source not found")
    db.delete(s)
    db.commit()
    return {"deleted": True}


# ------------------------------------------------------------------
# Fields
# ------------------------------------------------------------------
class SourceFieldAdd(BaseModel):
    key: str
    display_name: str
    data_type: str = "str"
    unit: str = ""
    description: str = ""


@router.post("/{source_id}/fields")
def add_source_field(source_id: str, req: SourceFieldAdd, db: Session = Depends(get_db)):
    s = db.query(models.Source).filter(
        (models.Source.id == source_id) | (models.Source.key == source_id)
    ).first()
    if not s:
        raise HTTPException(404, "Source not found")
    fkey = slugify(req.key)
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


@router.delete("/{source_id}/fields/{field_id}")
def delete_source_field(source_id: str, field_id: str, db: Session = Depends(get_db)):
    f = db.query(models.SourceField).filter_by(id=field_id).first()
    if not f:
        raise HTTPException(404, "Field not found")
    db.delete(f)
    db.commit()
    return {"deleted": True}


# ------------------------------------------------------------------
# Versions
# ------------------------------------------------------------------
@router.post("/{source_id}/versions")
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
