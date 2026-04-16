import os
import json
import uuid
from datetime import datetime
from typing import Dict, Any, Optional, List
from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel
from engine.monte_carlo import run_multi_domain_simulation
from engine.data_analyzer import analyze_all

app = FastAPI(title="The Predictive Network Engine - API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Data Paths ---
DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
ISSUES_FILE = os.path.join(DATA_DIR, "issues.json")
UPLOADS_DIR = os.path.join(DATA_DIR, "uploads")
os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(UPLOADS_DIR, exist_ok=True)

def load_issues() -> list:
    if not os.path.exists(ISSUES_FILE):
        return []
    with open(ISSUES_FILE, "r") as f:
        return json.load(f)

def save_issues(issues: list):
    with open(ISSUES_FILE, "w") as f:
        json.dump(issues, f, indent=2, default=str)

def load_files_metadata() -> list:
    path = os.path.join(DATA_DIR, "files.json")
    if not os.path.exists(path):
        return []
    with open(path, "r") as f:
        return json.load(f)

def save_files_metadata(files: list):
    path = os.path.join(DATA_DIR, "files.json")
    with open(path, "w") as f:
        json.dump(files, f, indent=2, default=str)


# ============================================================
# SIMULATION
# ============================================================

class SimulationRequest(BaseModel):
    followers: int = 5000
    impressions_90d: int = 50000
    linkedin_engagement_rate: float = 0.05
    network_density: float = 0.3
    lurker_ratio: float = 0.8
    trust_multiplier: float = 1.0

@app.get("/health")
def health():
    return {"status": "ok", "service": "insiders-api"}

@app.post("/api/simulate")
def simulate(req: SimulationRequest):
    result = run_multi_domain_simulation(
        followers=req.followers,
        impressions_90d=req.impressions_90d,
        linkedin_engagement_rate=req.linkedin_engagement_rate,
        network_density=req.network_density,
        lurker_ratio=req.lurker_ratio,
        trust_multiplier=req.trust_multiplier,
        iterations=10000
    )
    return {"status": "success", "data": result}


# ============================================================
# ANALYTICS
# ============================================================

ANALYSIS_FILE = os.path.join(DATA_DIR, "analysis_cache.json")
INSIDERSKUNDER_DIR = os.path.join(os.path.dirname(__file__), "..", "Insiderskunder")

import math
import numpy as np

class SafeJSONEncoder(json.JSONEncoder):
    """Custom encoder that handles numpy types and NaN/Inf."""
    def default(self, obj):
        if isinstance(obj, (np.integer,)):
            return int(obj)
        if isinstance(obj, (np.floating,)):
            val = float(obj)
            if math.isnan(val) or math.isinf(val):
                return 0
            return val
        if isinstance(obj, (np.ndarray,)):
            return obj.tolist()
        if isinstance(obj, (np.bool_,)):
            return bool(obj)
        if hasattr(obj, 'isoformat'):
            return obj.isoformat()
        return super().default(obj)

def safe_json_dumps(obj):
    return json.dumps(obj, cls=SafeJSONEncoder, ensure_ascii=False)

@app.get("/api/analytics")
def get_analytics():
    """Return cached analysis results (or run fresh if none exist)."""
    if os.path.exists(ANALYSIS_FILE):
        with open(ANALYSIS_FILE, "r", encoding="utf-8") as f:
            content = f.read()
        return Response(content=content, media_type="application/json")
    
    # Try auto-analyze if data directory exists
    if os.path.exists(INSIDERSKUNDER_DIR):
        return run_analysis_now()
    
    return {"error": "No analysis data found. Upload files or run analysis first."}


@app.post("/api/analytics/run")
def run_analysis_now():
    """Run fresh analysis on Insiderskunder directory."""
    if not os.path.exists(INSIDERSKUNDER_DIR):
        return {"error": f"Data directory not found: {INSIDERSKUNDER_DIR}"}
    
    result = analyze_all(INSIDERSKUNDER_DIR)
    
    # Serialize with safe encoder
    content = safe_json_dumps(result)
    
    # Cache it
    with open(ANALYSIS_FILE, "w", encoding="utf-8") as f:
        f.write(content)
    
    return Response(content=content, media_type="application/json")


# ============================================================
# KANBAN / ISSUES
# ============================================================

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
    return load_issues()

@app.post("/api/issues")
def create_issue(req: IssueCreate):
    issues = load_issues()
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
    save_issues(issues)
    return issue

@app.patch("/api/issues/{issue_id}")
def update_issue(issue_id: str, req: IssueUpdate):
    issues = load_issues()
    for issue in issues:
        if issue["id"] == issue_id:
            if req.status is not None:
                issue["status"] = req.status
            if req.title is not None:
                issue["title"] = req.title.strip()
            if req.description is not None:
                issue["description"] = req.description.strip()
            issue["updatedAt"] = datetime.utcnow().isoformat()
            save_issues(issues)
            return issue
    return {"error": "Not found"}, 404

@app.delete("/api/issues/{issue_id}")
def delete_issue(issue_id: str):
    issues = load_issues()
    issues = [i for i in issues if i["id"] != issue_id]
    save_issues(issues)
    return {"deleted": True}

@app.post("/api/issues/{issue_id}/comments")
def add_comment(issue_id: str, req: CommentCreate):
    issues = load_issues()
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
            save_issues(issues)
            return comment
    return {"error": "Not found"}, 404


# ============================================================
# FILE UPLOADS
# ============================================================

@app.get("/api/files")
def list_files():
    return load_files_metadata()

@app.post("/api/files")
async def upload_file(
    file: UploadFile = File(...),
    name: str = Form(""),
    category: str = Form("Övrigt"),
):
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

    files = load_files_metadata()
    files.insert(0, meta)
    save_files_metadata(files)
    return meta

@app.get("/api/files/{file_id}/download")
def download_file(file_id: str):
    files = load_files_metadata()
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
        headers={"Content-Disposition": f'attachment; filename="{meta["originalName"]}"'}
    )

@app.delete("/api/files/{file_id}")
def delete_file(file_id: str):
    files = load_files_metadata()
    meta = next((f for f in files if f["id"] == file_id), None)
    if meta:
        filepath = os.path.join(UPLOADS_DIR, meta["storedName"])
        if os.path.exists(filepath):
            os.remove(filepath)
    files = [f for f in files if f["id"] != file_id]
    save_files_metadata(files)
    return {"deleted": True}


# ============================================================
# CHAT — Conversations, Messages, Reactions, WebSocket
# ============================================================
from fastapi import WebSocket, WebSocketDisconnect

CONVOS_FILE = os.path.join(DATA_DIR, "conversations.json")

# --- WebSocket manager ---
class ConnectionManager:
    def __init__(self):
        self.active: Dict[str, list] = {}  # convo_id -> [ws, ...]

    async def connect(self, ws: WebSocket, convo_id: str):
        await ws.accept()
        if convo_id not in self.active:
            self.active[convo_id] = []
        self.active[convo_id].append(ws)

    def disconnect(self, ws: WebSocket, convo_id: str):
        if convo_id in self.active:
            self.active[convo_id] = [w for w in self.active[convo_id] if w != ws]

    async def broadcast(self, convo_id: str, data: dict):
        for ws in self.active.get(convo_id, []):
            try:
                await ws.send_json(data)
            except:
                pass

manager = ConnectionManager()

def load_convos() -> list:
    if not os.path.exists(CONVOS_FILE):
        return []
    with open(CONVOS_FILE, "r") as f:
        return json.load(f)

def save_convos(convos: list):
    with open(CONVOS_FILE, "w") as f:
        json.dump(convos, f, indent=2, default=str)


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


# --- Conversations ---
@app.get("/api/conversations")
def list_conversations():
    return load_convos()


@app.post("/api/conversations")
def create_conversation(req: ConvoCreate):
    convos = load_convos()
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
    save_convos(convos)
    return convo


@app.delete("/api/conversations/{convo_id}")
def delete_conversation(convo_id: str):
    convos = load_convos()
    convos = [c for c in convos if c["id"] != convo_id]
    save_convos(convos)
    return {"deleted": True}


# --- Messages ---
@app.get("/api/conversations/{convo_id}/messages")
def get_messages(convo_id: str):
    convos = load_convos()
    convo = next((c for c in convos if c["id"] == convo_id), None)
    if not convo:
        return []
    return convo.get("messages", [])


@app.post("/api/conversations/{convo_id}/messages")
async def send_msg(convo_id: str, req: MsgSend):
    convos = load_convos()
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
    save_convos(convos)

    # Broadcast to WebSocket listeners
    await manager.broadcast(convo_id, {"type": "new_message", "message": message})
    return message


@app.post("/api/conversations/{convo_id}/upload")
async def convo_upload(
    convo_id: str,
    file: UploadFile = File(...),
    author: str = Form(""),
    body: str = Form(""),
):
    convos = load_convos()
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
    save_convos(convos)

    await manager.broadcast(convo_id, {"type": "new_message", "message": message})
    return message


@app.get("/api/conversations/attachment/{file_id}")
def download_chat_attachment(file_id: str):
    convos = load_convos()
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


# --- Reactions ---
@app.post("/api/conversations/{convo_id}/messages/{msg_id}/react")
async def toggle_reaction(convo_id: str, msg_id: str, req: ReactionToggle):
    convos = load_convos()
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
    save_convos(convos)

    await manager.broadcast(convo_id, {"type": "reaction", "messageId": msg_id, "reactions": reactions})
    return {"reactions": reactions}


# --- WebSocket ---
@app.websocket("/ws/chat/{convo_id}")
async def ws_chat(ws: WebSocket, convo_id: str):
    await manager.connect(ws, convo_id)
    try:
        while True:
            await ws.receive_text()  # keep alive
    except WebSocketDisconnect:
        manager.disconnect(ws, convo_id)

