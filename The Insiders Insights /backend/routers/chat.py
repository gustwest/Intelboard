"""Chat / conversation endpoints + WebSocket (JSON-file backed)."""
import os
import uuid
from datetime import datetime
from typing import Dict, List, Optional

from fastapi import APIRouter, File, Form, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.responses import Response
from pydantic import BaseModel

from helpers import CONVOS_FILE, UPLOADS_DIR, file_json, save_json

router = APIRouter(tags=["chat"])


# ------------------------------------------------------------------
# WebSocket manager
# ------------------------------------------------------------------
class ConnectionManager:
    def __init__(self):
        self.active: Dict[str, list] = {}

    async def connect(self, ws: WebSocket, convo_id: str):
        await ws.accept()
        self.active.setdefault(convo_id, []).append(ws)

    def disconnect(self, ws: WebSocket, convo_id: str):
        if convo_id in self.active:
            self.active[convo_id] = [w for w in self.active[convo_id] if w != ws]

    async def broadcast(self, convo_id: str, data: dict):
        for ws in self.active.get(convo_id, []):
            try:
                await ws.send_json(data)
            except Exception:
                pass


manager = ConnectionManager()


# ------------------------------------------------------------------
# Models
# ------------------------------------------------------------------
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


# ------------------------------------------------------------------
# Routes
# ------------------------------------------------------------------
@router.get("/api/conversations")
def list_conversations():
    return file_json(CONVOS_FILE, [])


@router.post("/api/conversations")
def create_conversation(req: ConvoCreate):
    convos = file_json(CONVOS_FILE, [])
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
    save_json(CONVOS_FILE, convos)
    return convo


@router.delete("/api/conversations/{convo_id}")
def delete_conversation(convo_id: str):
    convos = file_json(CONVOS_FILE, [])
    convos = [c for c in convos if c["id"] != convo_id]
    save_json(CONVOS_FILE, convos)
    return {"deleted": True}


@router.get("/api/conversations/{convo_id}/messages")
def get_messages(convo_id: str):
    convos = file_json(CONVOS_FILE, [])
    convo = next((c for c in convos if c["id"] == convo_id), None)
    return convo.get("messages", []) if convo else []


@router.post("/api/conversations/{convo_id}/messages")
async def send_msg(convo_id: str, req: MsgSend):
    convos = file_json(CONVOS_FILE, [])
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
    save_json(CONVOS_FILE, convos)
    await manager.broadcast(convo_id, {"type": "new_message", "message": message})
    return message


@router.post("/api/conversations/{convo_id}/upload")
async def convo_upload(convo_id: str, file: UploadFile = File(...), author: str = Form(""), body: str = Form("")):
    convos = file_json(CONVOS_FILE, [])
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
    save_json(CONVOS_FILE, convos)
    await manager.broadcast(convo_id, {"type": "new_message", "message": message})
    return message


@router.get("/api/conversations/attachment/{file_id}")
def download_chat_attachment(file_id: str):
    convos = file_json(CONVOS_FILE, [])
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


@router.post("/api/conversations/{convo_id}/messages/{msg_id}/react")
async def toggle_reaction(convo_id: str, msg_id: str, req: ReactionToggle):
    convos = file_json(CONVOS_FILE, [])
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
    save_json(CONVOS_FILE, convos)
    await manager.broadcast(convo_id, {"type": "reaction", "messageId": msg_id, "reactions": reactions})
    return {"reactions": reactions}


@router.websocket("/ws/chat/{convo_id}")
async def ws_chat(ws: WebSocket, convo_id: str):
    await manager.connect(ws, convo_id)
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(ws, convo_id)
