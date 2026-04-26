"""File uploads (generic admin file store) + simulation + logs endpoints."""
import os
import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, File, Form, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel

from engine.monte_carlo import run_multi_domain_simulation
from helpers import DATA_DIR, FILES_META, UPLOADS_DIR, file_json, save_json
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
# File uploads (generic admin file store)
# ------------------------------------------------------------------
@router.get("/api/files")
def list_files():
    return file_json(FILES_META, [])


@router.post("/api/files")
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
    files = file_json(FILES_META, [])
    files.insert(0, meta)
    save_json(FILES_META, files)
    return meta


@router.get("/api/files/{file_id}/download")
def download_file(file_id: str):
    files = file_json(FILES_META, [])
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


@router.delete("/api/files/{file_id}")
def delete_file(file_id: str):
    files = file_json(FILES_META, [])
    meta = next((f for f in files if f["id"] == file_id), None)
    if meta:
        filepath = os.path.join(UPLOADS_DIR, meta["storedName"])
        if os.path.exists(filepath):
            os.remove(filepath)
    files = [f for f in files if f["id"] != file_id]
    save_json(FILES_META, files)
    return {"deleted": True}
