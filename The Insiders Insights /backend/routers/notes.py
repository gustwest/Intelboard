"""Customer Notes & Goals CRUD endpoints."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import models
import schemas
from db import get_db

router = APIRouter(prefix="/api", tags=["notes & goals"])


# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------
def _get_customer(customer_id: str, db: Session) -> models.Customer:
    c = db.query(models.Customer).filter(
        (models.Customer.id == customer_id) | (models.Customer.slug == customer_id)
    ).first()
    if not c:
        raise HTTPException(404, "Customer not found")
    return c


def _note_to_out(n: models.CustomerNote) -> dict:
    return {
        "id": n.id,
        "customer_id": n.customer_id,
        "title": n.title,
        "body": n.body,
        "note_type": n.note_type,
        "author": n.author,
        "created_at": n.created_at.isoformat() if n.created_at else None,
        "updated_at": n.updated_at.isoformat() if n.updated_at else None,
    }


def _goal_to_out(g: models.CustomerGoal) -> dict:
    return {
        "id": g.id,
        "customer_id": g.customer_id,
        "title": g.title,
        "description": g.description,
        "metric_type": g.metric_type,
        "module_id": g.module_id,
        "target_value": g.target_value,
        "target_date": g.target_date.isoformat() if g.target_date else None,
        "current_value": g.current_value,
        "status": g.status,
        "created_at": g.created_at.isoformat() if g.created_at else None,
        "updated_at": g.updated_at.isoformat() if g.updated_at else None,
    }


# ------------------------------------------------------------------
# NOTES
# ------------------------------------------------------------------
@router.get("/customers/{customer_id}/notes")
def list_notes(customer_id: str, db: Session = Depends(get_db)):
    c = _get_customer(customer_id, db)
    notes = (
        db.query(models.CustomerNote)
        .filter_by(customer_id=c.id)
        .order_by(models.CustomerNote.created_at.desc())
        .all()
    )
    return [_note_to_out(n) for n in notes]


@router.post("/customers/{customer_id}/notes")
def create_note(customer_id: str, req: schemas.NoteCreate, db: Session = Depends(get_db)):
    c = _get_customer(customer_id, db)
    note = models.CustomerNote(
        customer_id=c.id,
        title=req.title.strip(),
        body=req.body,
        note_type=req.note_type,
        author=req.author,
    )
    db.add(note)
    db.commit()
    db.refresh(note)
    return _note_to_out(note)


@router.put("/notes/{note_id}")
def update_note(note_id: str, req: schemas.NoteUpdate, db: Session = Depends(get_db)):
    note = db.query(models.CustomerNote).get(note_id)
    if not note:
        raise HTTPException(404, "Note not found")
    if req.title is not None:
        note.title = req.title.strip()
    if req.body is not None:
        note.body = req.body
    if req.note_type is not None:
        note.note_type = req.note_type
    db.commit()
    db.refresh(note)
    return _note_to_out(note)


@router.delete("/notes/{note_id}")
def delete_note(note_id: str, db: Session = Depends(get_db)):
    note = db.query(models.CustomerNote).get(note_id)
    if not note:
        raise HTTPException(404, "Note not found")
    db.delete(note)
    db.commit()
    return {"deleted": True}


# ------------------------------------------------------------------
# GOALS
# ------------------------------------------------------------------
@router.get("/customers/{customer_id}/goals")
def list_goals(customer_id: str, db: Session = Depends(get_db)):
    c = _get_customer(customer_id, db)
    goals = (
        db.query(models.CustomerGoal)
        .filter_by(customer_id=c.id)
        .order_by(models.CustomerGoal.created_at.desc())
        .all()
    )
    return [_goal_to_out(g) for g in goals]


@router.post("/customers/{customer_id}/goals")
def create_goal(customer_id: str, req: schemas.GoalCreate, db: Session = Depends(get_db)):
    c = _get_customer(customer_id, db)
    goal = models.CustomerGoal(
        customer_id=c.id,
        title=req.title.strip(),
        description=req.description,
        metric_type=req.metric_type,
        module_id=req.module_id,
        target_value=req.target_value,
        target_date=req.target_date,
        current_value=req.current_value,
    )
    db.add(goal)
    db.commit()
    db.refresh(goal)
    return _goal_to_out(goal)


@router.put("/goals/{goal_id}")
def update_goal(goal_id: str, req: schemas.GoalUpdate, db: Session = Depends(get_db)):
    goal = db.query(models.CustomerGoal).get(goal_id)
    if not goal:
        raise HTTPException(404, "Goal not found")
    if req.title is not None:
        goal.title = req.title.strip()
    if req.description is not None:
        goal.description = req.description
    if req.target_value is not None:
        goal.target_value = req.target_value
    if req.target_date is not None:
        goal.target_date = req.target_date
    if req.current_value is not None:
        goal.current_value = req.current_value
    if req.status is not None:
        goal.status = req.status
    db.commit()
    db.refresh(goal)
    return _goal_to_out(goal)


@router.delete("/goals/{goal_id}")
def delete_goal(goal_id: str, db: Session = Depends(get_db)):
    goal = db.query(models.CustomerGoal).get(goal_id)
    if not goal:
        raise HTTPException(404, "Goal not found")
    db.delete(goal)
    db.commit()
    return {"deleted": True}
