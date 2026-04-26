"""AI Agent — sessions, tasks, polling — PostgreSQL backed."""
import os
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload

import models
from db import get_db

router = APIRouter(prefix="/api/agent", tags=["agent"])


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
    }


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
def agent_list_sessions(db: Session = Depends(get_db)):
    sessions = (
        db.query(models.AgentSession)
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
        session = models.AgentSession(title=title, created_at=now, updated_at=now)
        db.add(session)
        db.flush()

    task = models.AgentTask(
        session_id=session.id,
        prompt=req.prompt.strip(),
        status="PENDING",
        model=task_model,
        created_at=now,
        updated_at=now,
    )
    db.add(task)
    session.updated_at = now
    db.commit()
    db.refresh(session)
    db.refresh(task)
    return {"session": _session_to_out(session), "task": _task_to_out(task)}


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

    return {
        "task": {
            "id": pending_task.id,
            "prompt": pending_task.prompt,
            "model": pending_task.model,
            "sessionId": pending_task.session_id,
            "resumeSessionId": session.claude_session_id if session else None,
        },
        "timestamp": now.isoformat(),
    }


@router.patch("/poll")
def agent_poll_patch(req: AgentPollPatch, authorization: Optional[str] = Header(None), db: Session = Depends(get_db)):
    _require_agent_key(authorization)

    task = db.query(models.AgentTask).filter_by(id=req.taskId).first()
    if not task:
        raise HTTPException(404, "Task not found")

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
def agent_status(db: Session = Depends(get_db)):
    meta = _get_or_create_meta(db)

    total = db.query(models.AgentTask).count()
    completed = db.query(models.AgentTask).filter_by(status="DONE").count()
    failed = db.query(models.AgentTask).filter_by(status="FAILED").count()

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
