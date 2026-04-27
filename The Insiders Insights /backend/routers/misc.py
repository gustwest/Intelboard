"""File uploads (generic admin file store) + simulation + logs endpoints — PostgreSQL backed."""
import os
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

import models
from db import get_db
from engine.monte_carlo import run_multi_domain_simulation
from helpers import UPLOADS_DIR
from logging_config import clear_recent, get_recent

router = APIRouter(tags=["misc"])


# ------------------------------------------------------------------
# Logs
# ------------------------------------------------------------------
@router.get("/api/logs")
def api_logs(limit: int = 200, level: Optional[str] = None):
    return {"count": len(get_recent(limit, level)), "entries": get_recent(limit, level)}


@router.delete("/api/logs")
def api_logs_clear():
    clear_recent()
    return {"cleared": True}


# ------------------------------------------------------------------
# Simulation
# ------------------------------------------------------------------
class SimulationRequest(BaseModel):
    followers: int = 5000
    impressions_90d: int = 50000
    linkedin_engagement_rate: float = 0.05
    network_density: float = 0.3
    lurker_ratio: float = 0.8
    trust_multiplier: float = 1.0


@router.post("/api/simulate")
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
# File uploads — PostgreSQL backed
# ------------------------------------------------------------------
def _file_to_out(f: models.AdminFile) -> dict:
    return {
        "id": f.id,
        "originalName": f.original_name,
        "displayName": f.display_name,
        "category": f.category,
        "storedName": f.stored_name,
        "size": f.size,
        "contentType": f.content_type,
        "uploadedAt": f.uploaded_at.isoformat(),
    }


@router.get("/api/files")
def list_files(db: Session = Depends(get_db)):
    files = db.query(models.AdminFile).order_by(models.AdminFile.uploaded_at.desc()).all()
    return [_file_to_out(f) for f in files]


@router.post("/api/files")
async def upload_file(file: UploadFile = File(...), name: str = Form(""), category: str = Form("Övrigt"), db: Session = Depends(get_db)):
    import uuid
    file_id = str(uuid.uuid4())
    ext = os.path.splitext(file.filename or "file")[1]
    stored_name = f"{file_id}{ext}"
    filepath = os.path.join(UPLOADS_DIR, stored_name)
    content = await file.read()
    with open(filepath, "wb") as f:
        f.write(content)
    admin_file = models.AdminFile(
        id=file_id,
        original_name=file.filename or "unknown",
        display_name=name.strip() or file.filename or "unknown",
        category=category.strip(),
        stored_name=stored_name,
        size=len(content),
        content_type=file.content_type or "application/octet-stream",
    )
    db.add(admin_file)
    db.commit()
    db.refresh(admin_file)
    return _file_to_out(admin_file)


@router.get("/api/files/{file_id}/download")
def download_file(file_id: str, db: Session = Depends(get_db)):
    meta = db.query(models.AdminFile).filter_by(id=file_id).first()
    if not meta:
        return Response(status_code=404, content="Not found")
    filepath = os.path.join(UPLOADS_DIR, meta.stored_name)
    if not os.path.exists(filepath):
        return Response(status_code=404, content="File not found on disk")
    with open(filepath, "rb") as f:
        content = f.read()
    return Response(
        content=content,
        media_type=meta.content_type or "application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{meta.original_name}"'},
    )


@router.delete("/api/files/{file_id}")
def delete_file(file_id: str, db: Session = Depends(get_db)):
    meta = db.query(models.AdminFile).filter_by(id=file_id).first()
    if meta:
        filepath = os.path.join(UPLOADS_DIR, meta.stored_name)
        if os.path.exists(filepath):
            os.remove(filepath)
        db.delete(meta)
        db.commit()
    return {"deleted": True}
