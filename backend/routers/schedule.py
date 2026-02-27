"""
Schedule router: GET/PUT/DELETE /api/schedule
"""
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import List, Optional
from sqlalchemy.orm import Session

from database import get_db
from models import User, UserSchedule
from services.auth_service import get_current_user
from services.scheduler import upsert_schedule, remove_schedule

router = APIRouter(prefix="/schedule", tags=["Schedule"])


class ScheduleRequest(BaseModel):
    keywords: str = ""
    location: str = "Remote"
    platforms: List[str] = ["indeed", "linkedin"]
    results_per_site: int = 10
    hours_old: int = 72
    auto_pipeline: bool = True
    run_time: str = "09:00"   # HH:MM UTC
    enabled: bool = True


class ScheduleResponse(BaseModel):
    enabled: bool
    keywords: str
    location: str
    platforms: List[str]
    results_per_site: int
    hours_old: int
    auto_pipeline: bool
    run_time: str
    last_run: Optional[str]


@router.get("", response_model=Optional[ScheduleResponse])
def get_schedule(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    s = db.query(UserSchedule).filter(UserSchedule.user_id == current_user.id).first()
    if not s:
        return None
    return _to_response(s)


@router.put("", response_model=ScheduleResponse)
def set_schedule(
    payload: ScheduleRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    s = db.query(UserSchedule).filter(UserSchedule.user_id == current_user.id).first()
    if not s:
        s = UserSchedule(user_id=current_user.id)
        db.add(s)

    s.keywords         = payload.keywords
    s.location         = payload.location
    s.platforms        = payload.platforms
    s.results_per_site = payload.results_per_site
    s.hours_old        = payload.hours_old
    s.auto_pipeline    = payload.auto_pipeline
    s.run_time         = payload.run_time
    s.enabled          = payload.enabled
    db.commit()
    db.refresh(s)

    upsert_schedule(current_user.id, s.run_time, s.enabled)
    return _to_response(s)


@router.delete("")
def delete_schedule(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    s = db.query(UserSchedule).filter(UserSchedule.user_id == current_user.id).first()
    if s:
        db.delete(s)
        db.commit()
    remove_schedule(current_user.id)
    return {"deleted": True}


def _to_response(s: UserSchedule) -> ScheduleResponse:
    return ScheduleResponse(
        enabled=s.enabled, keywords=s.keywords, location=s.location,
        platforms=s.platforms or [], results_per_site=s.results_per_site,
        hours_old=s.hours_old, auto_pipeline=s.auto_pipeline,
        run_time=s.run_time, last_run=s.last_run,
    )
