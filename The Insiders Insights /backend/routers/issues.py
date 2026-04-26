"""Kanban / issues endpoints (JSON-file backed)."""
import uuid
from datetime import datetime
from typing import Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from helpers import ISSUES_FILE, file_json, save_json

router = APIRouter(prefix="/api/issues", tags=["issues"])


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


@router.get("")
def list_issues():
    return file_json(ISSUES_FILE, [])


@router.post("")
def create_issue(req: IssueCreate):
    issues = file_json(ISSUES_FILE, [])
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
    save_json(ISSUES_FILE, issues)
    return issue


@router.patch("/{issue_id}")
def update_issue(issue_id: str, req: IssueUpdate):
    issues = file_json(ISSUES_FILE, [])
    for issue in issues:
        if issue["id"] == issue_id:
            if req.status is not None: issue["status"] = req.status
            if req.title is not None: issue["title"] = req.title.strip()
            if req.description is not None: issue["description"] = req.description.strip()
            issue["updatedAt"] = datetime.utcnow().isoformat()
            save_json(ISSUES_FILE, issues)
            return issue
    raise HTTPException(404, "Issue not found")


@router.delete("/{issue_id}")
def delete_issue(issue_id: str):
    issues = file_json(ISSUES_FILE, [])
    issues = [i for i in issues if i["id"] != issue_id]
    save_json(ISSUES_FILE, issues)
    return {"deleted": True}


@router.post("/{issue_id}/comments")
def add_comment(issue_id: str, req: CommentCreate):
    issues = file_json(ISSUES_FILE, [])
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
            save_json(ISSUES_FILE, issues)
            return comment
    raise HTTPException(404, "Issue not found")
