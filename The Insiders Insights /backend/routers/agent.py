"""AI Agent — sessions, tasks, polling — PostgreSQL backed."""
import base64
import os
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload

import models
from db import get_db

router = APIRouter(prefix="/api/agent", tags=["agent"])

# Where uploaded screenshots etc. land
_DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
AGENT_UPLOADS_DIR = os.path.join(_DATA_DIR, "uploads", "agent")
os.makedirs(AGENT_UPLOADS_DIR, exist_ok=True)

_EXT_BY_MIME = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/gif": ".gif",
    "image/webp": ".webp",
}


# ------------------------------------------------------------------
# Auth
# ------------------------------------------------------------------
def _require_agent_key(authorization: Optional[str]) -> None:
    expected = os.environ.get("AGENT_API_KEY")
    if not expected:
        raise HTTPException(503, "AGENT_API_KEY not configured on backend")
    if authorization != f"Bearer {expected}":
        raise HTTPException(401, "Unauthorized")


# ------------------------------------------------------------------
# Request models
# ------------------------------------------------------------------
class AgentTaskCreate(BaseModel):
    prompt: str
    sessionId: Optional[str] = None
    model: Optional[str] = None
    imageBase64: Optional[str] = None       # raw base64 or "data:image/png;base64,..."
    imageContentType: Optional[str] = None  # e.g. "image/png"
    product: str = "the-insiders"           # which admin workspace a new session belongs to


class AgentSessionPatch(BaseModel):
    title: Optional[str] = None
    pinned: Optional[bool] = None


class AgentPollPatch(BaseModel):
    taskId: str
    status: Optional[str] = None
    response: Optional[str] = None
    error: Optional[str] = None
    logs: Optional[List[str]] = None
    claudeSessionId: Optional[str] = None


# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------
def _task_to_out(t: models.AgentTask) -> dict:
    image_url = None
    if t.image_path:
        # task.image_path stores the bare filename; expose a relative URL the worker can fetch
        image_url = f"/api/agent/uploads/{t.image_path}"
    return {
        "id": t.id,
        "prompt": t.prompt,
        "status": t.status,
        "model": t.model,
        "response": t.response,
        "error": t.error,
        "sessionId": t.session_id,
        "claudeSessionId": t.claude_session_id,
        "createdAt": t.created_at.isoformat(),
        "updatedAt": t.updated_at.isoformat(),
        "logs": t.logs_json or [],
        "cancelRequested": bool(t.cancel_requested),
        "imageUrl": image_url,
    }


def _save_image(image_b64: str, content_type: Optional[str]) -> str:
    """Decode base64 image and save under AGENT_UPLOADS_DIR. Returns the bare filename."""
    payload = image_b64
    if payload.startswith("data:"):
        # data:image/png;base64,XXXX — split off the prefix
        try:
            header, payload = payload.split(",", 1)
            if not content_type and ";" in header:
                content_type = header.split(":", 1)[1].split(";", 1)[0]
        except ValueError:
            raise HTTPException(400, "Invalid data URL for image")
    try:
        raw = base64.b64decode(payload)
    except Exception:
        raise HTTPException(400, "Could not decode image base64")
    if len(raw) == 0:
        raise HTTPException(400, "Empty image payload")
    if len(raw) > 12 * 1024 * 1024:  # 12 MB cap
        raise HTTPException(413, "Image too large (max 12 MB)")

    ext = _EXT_BY_MIME.get((content_type or "").lower(), ".bin")
    filename = f"{uuid.uuid4().hex}{ext}"
    full_path = os.path.join(AGENT_UPLOADS_DIR, filename)
    with open(full_path, "wb") as f:
        f.write(raw)
    return filename


def _session_to_out(s: models.AgentSession) -> dict:
    return {
        "id": s.id,
        "title": s.title,
        "pinned": s.pinned,
        "claudeSessionId": s.claude_session_id,
        "createdAt": s.created_at.isoformat(),
        "updatedAt": s.updated_at.isoformat(),
        "tasks": [_task_to_out(t) for t in s.tasks],
    }


def _get_or_create_meta(db: Session) -> models.AgentMeta:
    meta = db.query(models.AgentMeta).first()
    if not meta:
        meta = models.AgentMeta(id=1)
        db.add(meta)
        db.flush()
    return meta


# ------------------------------------------------------------------
# Routes
# ------------------------------------------------------------------
@router.get("/sessions")
def agent_list_sessions(product: str = "the-insiders", db: Session = Depends(get_db)):
    sessions = (
        db.query(models.AgentSession)
        .filter_by(product=product)
        .options(joinedload(models.AgentSession.tasks))
        .order_by(models.AgentSession.updated_at.desc())
        .all()
    )
    return [_session_to_out(s) for s in sessions]


@router.get("/sessions/{session_id}")
def agent_get_session(session_id: str, db: Session = Depends(get_db)):
    session = (
        db.query(models.AgentSession)
        .options(joinedload(models.AgentSession.tasks))
        .filter_by(id=session_id)
        .first()
    )
    if not session:
        raise HTTPException(404, "Session not found")
    return _session_to_out(session)


@router.post("/tasks")
def agent_create_task(req: AgentTaskCreate, db: Session = Depends(get_db)):
    if not req.prompt or not req.prompt.strip():
        raise HTTPException(400, "prompt is required")

    now = datetime.utcnow()
    task_model = req.model or "claude-sonnet-4-6"

    if req.sessionId:
        session = (
            db.query(models.AgentSession)
            .options(joinedload(models.AgentSession.tasks))
            .filter_by(id=req.sessionId)
            .first()
        )
        if not session:
            raise HTTPException(404, "Session not found")
    else:
        title = req.prompt[:50] + "…" if len(req.prompt) > 50 else req.prompt
        session = models.AgentSession(title=title, product=req.product, created_at=now, updated_at=now)
        db.add(session)
        db.flush()

    image_filename = None
    if req.imageBase64:
        image_filename = _save_image(req.imageBase64, req.imageContentType)

    task = models.AgentTask(
        session_id=session.id,
        prompt=req.prompt.strip(),
        status="PENDING",
        model=task_model,
        image_path=image_filename,
        created_at=now,
        updated_at=now,
    )
    db.add(task)
    session.updated_at = now
    db.commit()
    db.refresh(session)
    db.refresh(task)
    return {"session": _session_to_out(session), "task": _task_to_out(task)}


@router.post("/tasks/{task_id}/cancel")
def agent_cancel_task(task_id: str, db: Session = Depends(get_db)):
    """Mark a task as CANCELLED. Worker will see cancel_requested via /poll
    response and may abort; even if it doesn't, its later PATCH is ignored
    because the task is already in a terminal state."""
    task = db.query(models.AgentTask).filter_by(id=task_id).first()
    if not task:
        raise HTTPException(404, "Task not found")
    if task.status in ("DONE", "FAILED", "CANCELLED"):
        return _task_to_out(task)  # already terminal, no-op

    now = datetime.utcnow()
    task.status = "CANCELLED"
    task.cancel_requested = True
    task.updated_at = now
    if not task.error:
        task.error = "Avbruten av användaren"

    session = db.query(models.AgentSession).filter_by(id=task.session_id).first()
    if session:
        session.updated_at = now

    db.commit()
    db.refresh(task)
    return _task_to_out(task)


@router.get("/uploads/{filename}")
def agent_serve_upload(filename: str):
    """Serve a previously uploaded image. Filename is a UUID-based name we generated;
    we still strip path separators defensively."""
    safe = os.path.basename(filename)
    full_path = os.path.join(AGENT_UPLOADS_DIR, safe)
    if not os.path.isfile(full_path):
        raise HTTPException(404, "Not found")
    return FileResponse(full_path)


@router.patch("/sessions/{session_id}")
def agent_patch_session(session_id: str, req: AgentSessionPatch, db: Session = Depends(get_db)):
    session = (
        db.query(models.AgentSession)
        .options(joinedload(models.AgentSession.tasks))
        .filter_by(id=session_id)
        .first()
    )
    if not session:
        raise HTTPException(404, "Session not found")
    if req.title is not None:
        session.title = req.title
    if req.pinned is not None:
        session.pinned = req.pinned
    session.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(session)
    return _session_to_out(session)


@router.delete("/sessions/{session_id}")
def agent_delete_session(session_id: str, db: Session = Depends(get_db)):
    session = db.query(models.AgentSession).filter_by(id=session_id).first()
    if not session:
        raise HTTPException(404, "Session not found")
    db.delete(session)
    db.commit()
    return {"ok": True}


@router.get("/poll")
def agent_poll_get(
    authorization: Optional[str] = Header(None),
    x_agent_model: Optional[str] = Header(None),
    x_agent_version: Optional[str] = Header(None),
    x_agent_project: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_agent_key(authorization)

    meta = _get_or_create_meta(db)
    meta.last_poll = datetime.utcnow()
    if x_agent_model:
        meta.agent_model = x_agent_model
    if x_agent_version:
        meta.agent_version = x_agent_version
    if x_agent_project:
        meta.agent_project = x_agent_project

    # Find the first PENDING task
    pending_task = (
        db.query(models.AgentTask)
        .filter_by(status="PENDING")
        .order_by(models.AgentTask.created_at.asc())
        .first()
    )

    if not pending_task:
        db.commit()
        return {"task": None, "timestamp": datetime.utcnow().isoformat()}

    pending_task.status = "RUNNING"
    now = datetime.utcnow()
    pending_task.updated_at = now

    session = db.query(models.AgentSession).filter_by(id=pending_task.session_id).first()
    if session:
        session.updated_at = now

    db.commit()

    image_url = None
    if pending_task.image_path:
        image_url = f"/api/agent/uploads/{pending_task.image_path}"

    return {
        "task": {
            "id": pending_task.id,
            "prompt": pending_task.prompt,
            "model": pending_task.model,
            "sessionId": pending_task.session_id,
            "resumeSessionId": session.claude_session_id if session else None,
            "imageUrl": image_url,
        },
        "timestamp": now.isoformat(),
    }


@router.patch("/poll")
def agent_poll_patch(req: AgentPollPatch, authorization: Optional[str] = Header(None), db: Session = Depends(get_db)):
    _require_agent_key(authorization)

    task = db.query(models.AgentTask).filter_by(id=req.taskId).first()
    if not task:
        raise HTTPException(404, "Task not found")

    # If the user already cancelled the task, ignore late updates from the worker
    # so the UI/state stays consistent (the worker may finish anyway, but we don't care).
    if task.status == "CANCELLED":
        return {"ok": True, "ignored": "task is cancelled"}

    now = datetime.utcnow()
    if req.status:
        task.status = req.status
    if req.response is not None:
        task.response = req.response
    if req.error:
        task.error = req.error
    if req.claudeSessionId:
        task.claude_session_id = req.claudeSessionId
        session = db.query(models.AgentSession).filter_by(id=task.session_id).first()
        if session:
            session.claude_session_id = req.claudeSessionId
            session.updated_at = now
    if req.logs:
        logs = list(task.logs_json or [])
        for msg in req.logs:
            logs.append({
                "id": str(uuid.uuid4()),
                "message": msg,
                "createdAt": now.isoformat(),
            })
        task.logs_json = logs
    task.updated_at = now

    session = db.query(models.AgentSession).filter_by(id=task.session_id).first()
    if session:
        session.updated_at = now

    db.commit()
    return {"ok": True}


@router.get("/status")
def agent_status(product: Optional[str] = None, db: Session = Depends(get_db)):
    meta = _get_or_create_meta(db)

    # "online" reflects the (shared) worker; stats are scoped per product when asked.
    task_q = db.query(models.AgentTask)
    if product:
        task_q = task_q.join(models.AgentSession).filter(models.AgentSession.product == product)

    total = task_q.count()
    completed = task_q.filter(models.AgentTask.status == "DONE").count()
    failed = task_q.filter(models.AgentTask.status == "FAILED").count()

    online = False
    last_poll = meta.last_poll
    if last_poll:
        try:
            delta = (datetime.utcnow() - last_poll).total_seconds()
            online = delta < 30
        except Exception:
            online = False

    db.commit()  # persist any meta changes

    return {
        "online": online,
        "lastPoll": last_poll.isoformat() if last_poll else None,
        "model": meta.agent_model,
        "cliVersion": meta.agent_version,
        "projectDir": meta.agent_project,
        "stats": {
            "total": total,
            "completed": completed,
            "failed": failed,
            "successRate": round((completed / total) * 100) if total > 0 else 0,
        },
    }
