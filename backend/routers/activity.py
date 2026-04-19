"""
Activity log router: GET /api/activity
Provides a notification/history feed for the user.
"""
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from typing import List, Optional
from sqlalchemy.orm import Session

from database import get_db, SessionLocal
from models import User, ActivityLog
from services.auth_service import get_current_user

router = APIRouter(prefix="/activity", tags=["Activity"])


class ActivityRecord(BaseModel):
    id: int
    event_type: str
    message: str
    job_id: Optional[str] = None
    created_at: Optional[str] = None


@router.get("", response_model=List[ActivityRecord])
def list_activity(
    limit: int = Query(50, ge=1, le=200),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    logs = (
        db.query(ActivityLog)
        .filter(ActivityLog.user_id == current_user.id)
        .order_by(ActivityLog.created_at.desc())
        .limit(limit)
        .all()
    )
    return [
        ActivityRecord(
            id=l.id,
            event_type=l.event_type,
            message=l.message,
            job_id=l.job_id,
            created_at=str(l.created_at) if l.created_at else None,
        )
        for l in logs
    ]


@router.delete("")
def clear_activity(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    db.query(ActivityLog).filter(ActivityLog.user_id == current_user.id).delete()
    db.commit()
    return {"cleared": True}


# ── Helper used by pipeline/search to log events ─────────────────────────────

def log_activity(user_id: str, event_type: str, message: str, job_id: str = None):
    """Log an activity event. Safe to call from background tasks."""
    db = SessionLocal()
    try:
        db.add(ActivityLog(
            user_id=user_id,
            event_type=event_type,
            message=message,
            job_id=job_id,
        ))
        db.commit()
    except Exception:
        db.rollback()
    finally:
        db.close()
