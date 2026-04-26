"""AI Agent — sessions, tasks, polling (JSON-file backed)."""
import os
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from helpers import AGENT_FILE, file_json, save_json

router = APIRouter(prefix="/api/agent", tags=["agent"])


# ------------------------------------------------------------------
# State management
# ------------------------------------------------------------------
def _load_agent_state() -> Dict[str, Any]:
    return file_json(AGENT_FILE, {"sessions": []})


def _save_agent_state(state: Dict[str, Any]) -> None:
    save_json(AGENT_FILE, state)


def _require_agent_key(authorization: Optional[str]) -> None:
    expected = os.environ.get("AGENT_API_KEY")
    if not expected:
        raise HTTPException(503, "AGENT_API_KEY not configured on backend")
    if authorization != f"Bearer {expected}":
        raise HTTPException(401, "Unauthorized")


def _sorted_sessions(state: Dict[str, Any]) -> List[Dict[str, Any]]:
    return sorted(
        state.get("sessions", []),
        key=lambda s: s.get("updatedAt", ""),
        reverse=True,
    )


# ------------------------------------------------------------------
# Models
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
# Routes
# ------------------------------------------------------------------
@router.get("/sessions")
def agent_list_sessions():
    state = _load_agent_state()
    return _sorted_sessions(state)


@router.get("/sessions/{session_id}")
def agent_get_session(session_id: str):
    state = _load_agent_state()
    session = next((s for s in state.get("sessions", []) if s["id"] == session_id), None)
    if not session:
        raise HTTPException(404, "Session not found")
    return session


@router.post("/tasks")
def agent_create_task(req: AgentTaskCreate):
    if not req.prompt or not req.prompt.strip():
        raise HTTPException(400, "prompt is required")

    state = _load_agent_state()
    state.setdefault("sessions", [])
    now = datetime.utcnow().isoformat()
    task_id = str(uuid.uuid4())
    task_model = req.model or "claude-sonnet-4-6"

    task = {
        "id": task_id,
        "prompt": req.prompt.strip(),
        "status": "PENDING",
        "model": task_model,
        "response": None,
        "error": None,
        "sessionId": "",
        "claudeSessionId": None,
        "createdAt": now,
        "updatedAt": now,
        "logs": [],
    }

    if req.sessionId:
        session = next((s for s in state["sessions"] if s["id"] == req.sessionId), None)
        if not session:
            raise HTTPException(404, "Session not found")
        task["sessionId"] = session["id"]
        session.setdefault("tasks", []).append(task)
        session["updatedAt"] = now
    else:
        sid = str(uuid.uuid4())
        title = req.prompt[:50] + "…" if len(req.prompt) > 50 else req.prompt
        session = {
            "id": sid,
            "title": title,
            "pinned": False,
            "claudeSessionId": None,
            "createdAt": now,
            "updatedAt": now,
            "tasks": [task],
        }
        task["sessionId"] = sid
        state["sessions"].insert(0, session)

    _save_agent_state(state)
    return {"session": session, "task": task}


@router.patch("/sessions/{session_id}")
def agent_patch_session(session_id: str, req: AgentSessionPatch):
    state = _load_agent_state()
    session = next((s for s in state.get("sessions", []) if s["id"] == session_id), None)
    if not session:
        raise HTTPException(404, "Session not found")
    if req.title is not None:
        session["title"] = req.title
    if req.pinned is not None:
        session["pinned"] = req.pinned
    session["updatedAt"] = datetime.utcnow().isoformat()
    _save_agent_state(state)
    return session


@router.delete("/sessions/{session_id}")
def agent_delete_session(session_id: str):
    state = _load_agent_state()
    sessions = state.get("sessions", [])
    new_sessions = [s for s in sessions if s["id"] != session_id]
    if len(new_sessions) == len(sessions):
        raise HTTPException(404, "Session not found")
    state["sessions"] = new_sessions
    _save_agent_state(state)
    return {"ok": True}


@router.get("/poll")
def agent_poll_get(
    authorization: Optional[str] = Header(None),
    x_agent_model: Optional[str] = Header(None),
    x_agent_version: Optional[str] = Header(None),
    x_agent_project: Optional[str] = Header(None),
):
    _require_agent_key(authorization)
    state = _load_agent_state()
    state["lastPoll"] = datetime.utcnow().isoformat()
    if x_agent_model: state["agentModel"] = x_agent_model
    if x_agent_version: state["agentVersion"] = x_agent_version
    if x_agent_project: state["agentProject"] = x_agent_project

    pending_task = None
    pending_session = None
    for session in state.get("sessions", []):
        for task in session.get("tasks", []):
            if task.get("status") == "PENDING":
                pending_task = task
                pending_session = session
                break
        if pending_task:
            break

    if not pending_task:
        _save_agent_state(state)
        return {"task": None, "timestamp": datetime.utcnow().isoformat()}

    pending_task["status"] = "RUNNING"
    now = datetime.utcnow().isoformat()
    pending_task["updatedAt"] = now
    pending_session["updatedAt"] = now
    _save_agent_state(state)

    return {
        "task": {
            "id": pending_task["id"],
            "prompt": pending_task["prompt"],
            "model": pending_task["model"],
            "sessionId": pending_task["sessionId"],
            "resumeSessionId": pending_session.get("claudeSessionId"),
        },
        "timestamp": now,
    }


@router.patch("/poll")
def agent_poll_patch(req: AgentPollPatch, authorization: Optional[str] = Header(None)):
    _require_agent_key(authorization)
    state = _load_agent_state()
    now = datetime.utcnow().isoformat()
    for session in state.get("sessions", []):
        task = next((t for t in session.get("tasks", []) if t["id"] == req.taskId), None)
        if not task:
            continue
        if req.status: task["status"] = req.status
        if req.response is not None: task["response"] = req.response
        if req.error: task["error"] = req.error
        if req.claudeSessionId:
            task["claudeSessionId"] = req.claudeSessionId
            session["claudeSessionId"] = req.claudeSessionId
        if req.logs:
            for msg in req.logs:
                task.setdefault("logs", []).append({
                    "id": str(uuid.uuid4()),
                    "message": msg,
                    "createdAt": now,
                })
        task["updatedAt"] = now
        session["updatedAt"] = now
        _save_agent_state(state)
        return {"ok": True}
    raise HTTPException(404, "Task not found")


@router.get("/status")
def agent_status():
    state = _load_agent_state()
    all_tasks = [t for s in state.get("sessions", []) for t in s.get("tasks", [])]
    total = len(all_tasks)
    completed = sum(1 for t in all_tasks if t.get("status") == "DONE")
    failed = sum(1 for t in all_tasks if t.get("status") == "FAILED")
    last_poll = state.get("lastPoll")
    online = False
    if last_poll:
        try:
            delta = (datetime.utcnow() - datetime.fromisoformat(last_poll)).total_seconds()
            online = delta < 30
        except Exception:
            online = False
    return {
        "online": online,
        "lastPoll": last_poll,
        "model": state.get("agentModel"),
        "cliVersion": state.get("agentVersion"),
        "projectDir": state.get("agentProject"),
        "stats": {
            "total": total,
            "completed": completed,
            "failed": failed,
            "successRate": round((completed / total) * 100) if total > 0 else 0,
        },
    }
