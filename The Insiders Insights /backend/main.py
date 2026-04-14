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
# CHAT
# ============================================================

CHAT_FILE = os.path.join(DATA_DIR, "chat.json")

def load_messages() -> list:
    if not os.path.exists(CHAT_FILE):
        return []
    with open(CHAT_FILE, "r") as f:
        return json.load(f)

def save_messages(messages: list):
    with open(CHAT_FILE, "w") as f:
        json.dump(messages, f, indent=2, default=str)


class ChatMessage(BaseModel):
    body: str
    author: str
    images: Optional[List[str]] = None  # base64 data URLs


@app.get("/api/chat")
def list_messages():
    return load_messages()


@app.post("/api/chat")
def send_message(msg: ChatMessage):
    messages = load_messages()
    message = {
        "id": str(uuid.uuid4()),
        "body": msg.body.strip(),
        "author": msg.author.strip(),
        "images": msg.images or [],
        "attachments": [],
        "createdAt": datetime.utcnow().isoformat(),
    }
    messages.append(message)
    save_messages(messages)
    return message


@app.post("/api/chat/upload")
async def chat_upload(
    file: UploadFile = File(...),
    author: str = Form(""),
    body: str = Form(""),
):
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

    messages = load_messages()
    message = {
        "id": str(uuid.uuid4()),
        "body": body.strip(),
        "author": author.strip() or "Okänd",
        "images": [],
        "attachments": [attachment],
        "createdAt": datetime.utcnow().isoformat(),
    }
    messages.append(message)
    save_messages(messages)
    return message


@app.get("/api/chat/attachment/{file_id}")
def download_chat_attachment(file_id: str):
    messages = load_messages()
    for msg in messages:
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


@app.delete("/api/chat")
def clear_chat():
    save_messages([])
    return {"cleared": True}

