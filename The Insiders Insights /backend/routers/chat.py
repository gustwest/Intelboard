"""Chat / conversation endpoints + WebSocket — PostgreSQL backed."""
import os
import uuid
from datetime import datetime
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, File, Form, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload

import models
from db import get_db
from helpers import UPLOADS_DIR

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
# Request models
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
# Helpers
# ------------------------------------------------------------------
def _msg_to_out(m: models.ChatMessage) -> dict:
    return {
        "id": m.id,
        "body": m.body or "",
        "author": m.author,
        "images": m.images_json or [],
        "attachments": m.attachments_json or [],
        "reactions": m.reactions_json or [],
        "createdAt": m.created_at.isoformat(),
    }


def _convo_to_out(c: models.Conversation, include_messages: bool = False) -> dict:
    out = {
        "id": c.id,
        "name": c.name,
        "members": c.members_json or [],
        "emoji": c.emoji or "💬",
        "createdAt": c.created_at.isoformat(),
        "updatedAt": c.updated_at.isoformat(),
    }
    if include_messages:
        out["messages"] = [_msg_to_out(m) for m in c.messages]
    else:
        out["messages"] = []
    return out


# ------------------------------------------------------------------
# Routes
# ------------------------------------------------------------------
@router.get("/api/conversations")
def list_conversations(db: Session = Depends(get_db)):
    convos = (
        db.query(models.Conversation)
        .order_by(models.Conversation.updated_at.desc())
        .all()
    )
    return [_convo_to_out(c) for c in convos]


@router.post("/api/conversations")
def create_conversation(req: ConvoCreate, db: Session = Depends(get_db)):
    convo = models.Conversation(
        name=req.name.strip(),
        emoji=req.emoji or "💬",
        members_json=req.members,
    )
    db.add(convo)
    db.commit()
    db.refresh(convo)
    return _convo_to_out(convo, include_messages=True)


@router.delete("/api/conversations/{convo_id}")
def delete_conversation(convo_id: str, db: Session = Depends(get_db)):
    convo = db.query(models.Conversation).filter_by(id=convo_id).first()
    if not convo:
        return Response(status_code=404, content="Conversation not found")
    db.delete(convo)
    db.commit()
    return {"deleted": True}


@router.get("/api/conversations/{convo_id}/messages")
def get_messages(convo_id: str, db: Session = Depends(get_db)):
    convo = (
        db.query(models.Conversation)
        .options(joinedload(models.Conversation.messages))
        .filter_by(id=convo_id)
        .first()
    )
    if not convo:
        return []
    return [_msg_to_out(m) for m in convo.messages]


@router.post("/api/conversations/{convo_id}/messages")
async def send_msg(convo_id: str, req: MsgSend, db: Session = Depends(get_db)):
    convo = db.query(models.Conversation).filter_by(id=convo_id).first()
    if not convo:
        return Response(status_code=404, content="Conversation not found")
    msg = models.ChatMessage(
        conversation_id=convo.id,
        body=req.body.strip(),
        author=req.author.strip(),
        images_json=req.images or [],
    )
    db.add(msg)
    convo.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(msg)
    out = _msg_to_out(msg)
    await manager.broadcast(convo_id, {"type": "new_message", "message": out})
    return out


@router.post("/api/conversations/{convo_id}/upload")
async def convo_upload(convo_id: str, file: UploadFile = File(...), author: str = Form(""), body: str = Form(""), db: Session = Depends(get_db)):
    convo = db.query(models.Conversation).filter_by(id=convo_id).first()
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
    msg = models.ChatMessage(
        conversation_id=convo.id,
        body=body.strip(),
        author=author.strip() or "Okänd",
        attachments_json=[attachment],
    )
    db.add(msg)
    convo.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(msg)
    out = _msg_to_out(msg)
    await manager.broadcast(convo_id, {"type": "new_message", "message": out})
    return out


@router.get("/api/conversations/attachment/{file_id}")
def download_chat_attachment(file_id: str, db: Session = Depends(get_db)):
    """Search all messages for an attachment by file_id and serve it."""
    messages = db.query(models.ChatMessage).all()
    for msg in messages:
        for att in (msg.attachments_json or []):
            if att.get("id") == file_id:
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
async def toggle_reaction(convo_id: str, msg_id: str, req: ReactionToggle, db: Session = Depends(get_db)):
    msg = db.query(models.ChatMessage).filter_by(id=msg_id, conversation_id=convo_id).first()
    if not msg:
        return Response(status_code=404, content="Message not found")
    reactions = list(msg.reactions_json or [])
    existing = next((r for r in reactions if r["emoji"] == req.emoji and r["user"] == req.user), None)
    if existing:
        reactions.remove(existing)
    else:
        reactions.append({"emoji": req.emoji, "user": req.user})
    msg.reactions_json = reactions
    db.commit()
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
