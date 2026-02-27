"""
Jobs router - SQLite backed, per-user scoped.
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Optional
import uuid
from datetime import datetime
from sqlalchemy.orm import Session

from database import get_db
from models import Job
from services.auth_service import get_current_user
from models import User

router = APIRouter()


class JobCreate(BaseModel):
    title: str
    company: str
    url: str = ""
    resume: str
    job_description: str
    recipient_email: str
    applicant_name: str = "Applicant"


class JobRecord(BaseModel):
    id: str
    title: str
    company: str
    url: str
    resume: str
    job_description: str
    recipient_email: str
    applicant_name: str
    status: str = "pending"
    match_score: Optional[int] = None
    reasoning: Optional[str] = None
    missing_skills: List[str] = []
    resume_suggestions: Optional[str] = None
    cover_letter: Optional[str] = None
    created_at: str = ""
    updated_at: str = ""
    error: Optional[str] = None
    platform: str = ""
    location: str = ""
    date_posted: str = ""

    class Config:
        from_attributes = True


def _to_record(job: Job) -> dict:
    return {
        "id": job.id, "title": job.title, "company": job.company, "url": job.url,
        "resume": job.resume, "job_description": job.job_description,
        "applicant_name": job.applicant_name, "recipient_email": job.recipient_email,
        "status": job.status, "match_score": job.match_score, "reasoning": job.reasoning,
        "missing_skills": job.missing_skills or [], "resume_suggestions": job.resume_suggestions,
        "cover_letter": job.cover_letter, "created_at": job.created_at or "",
        "updated_at": job.updated_at or "", "error": job.error, "platform": job.platform,
        "location": job.location, "date_posted": job.date_posted,
    }


@router.get("/jobs", response_model=List[JobRecord])
def list_jobs(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    jobs = db.query(Job).filter(Job.user_id == current_user.id).order_by(Job.created_at.desc()).all()
    return [_to_record(j) for j in jobs]


@router.post("/jobs", response_model=JobRecord)
def create_job(payload: JobCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    now = datetime.utcnow().isoformat()
    job = Job(id=str(uuid.uuid4()), user_id=current_user.id, created_at=now, updated_at=now, **payload.model_dump())
    db.add(job)
    db.commit()
    db.refresh(job)
    return _to_record(job)


@router.get("/jobs/{job_id}", response_model=JobRecord)
def get_job(job_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    job = db.query(Job).filter(Job.id == job_id, Job.user_id == current_user.id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return _to_record(job)


@router.delete("/jobs/{job_id}")
def delete_job(job_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    job = db.query(Job).filter(Job.id == job_id, Job.user_id == current_user.id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    db.delete(job)
    db.commit()
    return {"deleted": job_id}


# ── Internal helper used by pipeline/search (no HTTP) ────────────────────────

def update_job(job_id: str, db: Session = None, **kwargs):
    """Update job fields. If db is None, opens a fresh session (for background tasks)."""
    from database import SessionLocal
    own_session = db is None
    if own_session:
        db = SessionLocal()
    try:
        job = db.query(Job).filter(Job.id == job_id).first()
        if job:
            for k, v in kwargs.items():
                setattr(job, k, v)
            job.updated_at = datetime.utcnow().isoformat()
            db.commit()
    finally:
        if own_session:
            db.close()


def create_job_record(user_id: str, job_data: dict, db: Session = None) -> str:
    """Create a job row in the DB. Returns the new job_id."""
    from database import SessionLocal
    own_session = db is None
    if own_session:
        db = SessionLocal()
    try:
        now = datetime.utcnow().isoformat()
        job = Job(
            id=str(uuid.uuid4()), user_id=user_id,
            created_at=now, updated_at=now,
            **{k: v for k, v in job_data.items() if hasattr(Job, k)}
        )
        db.add(job)
        db.commit()
        return job.id
    finally:
        if own_session:
            db.close()
