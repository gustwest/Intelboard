"""Kanban / issues endpoints — PostgreSQL backed."""
from datetime import datetime
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload

import models
from db import get_db

router = APIRouter(prefix="/api/issues", tags=["issues"])


# ------------------------------------------------------------------
# Request models
# ------------------------------------------------------------------
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


# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------
def _issue_to_out(issue: models.Issue) -> dict:
    return {
        "id": issue.id,
        "title": issue.title,
        "description": issue.description or "",
        "status": issue.status,
        "order": issue.order,
        "images": issue.images_json or [],
        "comments": [
            {
                "id": c.id,
                "body": c.body,
                "author": c.author,
                "images": c.images_json or [],
                "createdAt": c.created_at.isoformat(),
            }
            for c in issue.comments
        ],
        "createdAt": issue.created_at.isoformat(),
        "updatedAt": issue.updated_at.isoformat(),
    }


# ------------------------------------------------------------------
# Routes
# ------------------------------------------------------------------
@router.get("")
def list_issues(db: Session = Depends(get_db)):
    issues = (
        db.query(models.Issue)
        .options(joinedload(models.Issue.comments))
        .order_by(models.Issue.created_at.desc())
        .all()
    )
    return [_issue_to_out(i) for i in issues]


@router.post("")
def create_issue(req: IssueCreate, db: Session = Depends(get_db)):
    ny_count = db.query(models.Issue).filter_by(status="NY").count()
    issue = models.Issue(
        title=req.title.strip(),
        description=req.description.strip(),
        status="NY",
        order=ny_count,
        images_json=req.images or [],
    )
    db.add(issue)
    db.commit()
    db.refresh(issue)
    return _issue_to_out(issue)


@router.patch("/{issue_id}")
def update_issue(issue_id: str, req: IssueUpdate, db: Session = Depends(get_db)):
    issue = db.query(models.Issue).options(joinedload(models.Issue.comments)).filter_by(id=issue_id).first()
    if not issue:
        raise HTTPException(404, "Issue not found")
    if req.status is not None:
        issue.status = req.status
    if req.title is not None:
        issue.title = req.title.strip()
    if req.description is not None:
        issue.description = req.description.strip()
    issue.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(issue)
    return _issue_to_out(issue)


@router.delete("/{issue_id}")
def delete_issue(issue_id: str, db: Session = Depends(get_db)):
    issue = db.query(models.Issue).filter_by(id=issue_id).first()
    if not issue:
        raise HTTPException(404, "Issue not found")
    db.delete(issue)
    db.commit()
    return {"deleted": True}


@router.post("/{issue_id}/comments")
def add_comment(issue_id: str, req: CommentCreate, db: Session = Depends(get_db)):
    issue = db.query(models.Issue).options(joinedload(models.Issue.comments)).filter_by(id=issue_id).first()
    if not issue:
        raise HTTPException(404, "Issue not found")
    comment = models.IssueComment(
        issue_id=issue.id,
        body=req.body.strip(),
        author=req.author,
        images_json=req.images or [],
    )
    db.add(comment)
    issue.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(comment)
    return {
        "id": comment.id,
        "body": comment.body,
        "author": comment.author,
        "images": comment.images_json or [],
        "createdAt": comment.created_at.isoformat(),
    }
