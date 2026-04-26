"""Customer CRUD endpoints."""
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import models
import schemas
from db import get_db
from helpers import slugify

router = APIRouter(prefix="/api/customers", tags=["customers"])


# ------------------------------------------------------------------
# Helpers
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


# ------------------------------------------------------------------
# Routes
# ------------------------------------------------------------------
@router.get("")
def list_customers(db: Session = Depends(get_db)):
    return [_customer_to_out(c) for c in db.query(models.Customer).order_by(models.Customer.created_at.desc()).all()]


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
