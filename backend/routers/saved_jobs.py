"""
Saved jobs (bookmarks): POST /api/saved/{job_id}, DELETE /api/saved/{job_id}, GET /api/saved
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from database import get_db
from models import User, Job, SavedJob
from services.auth_service import get_current_user
from routers.jobs import JobRecord

router = APIRouter(prefix="/saved", tags=["Saved Jobs"])


@router.get("", response_model=List[JobRecord])
def list_saved(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    saved = db.query(SavedJob).filter(SavedJob.user_id == current_user.id).all()
    return [_job_to_record(s.job) for s in saved if s.job]


@router.post("/{job_id}", status_code=201)
def save_job(job_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    job = db.query(Job).filter(Job.id == job_id, Job.user_id == current_user.id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    existing = db.query(SavedJob).filter(SavedJob.user_id == current_user.id, SavedJob.job_id == job_id).first()
    if existing:
        return {"saved": True, "job_id": job_id}
    db.add(SavedJob(user_id=current_user.id, job_id=job_id))
    db.commit()
    return {"saved": True, "job_id": job_id}


@router.delete("/{job_id}")
def unsave_job(job_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    row = db.query(SavedJob).filter(SavedJob.user_id == current_user.id, SavedJob.job_id == job_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Not saved")
    db.delete(row)
    db.commit()
    return {"saved": False, "job_id": job_id}


def _job_to_record(job: Job) -> dict:
    return {
        "id": job.id, "title": job.title, "company": job.company, "url": job.url,
        "resume": job.resume, "job_description": job.job_description,
        "applicant_name": job.applicant_name, "recipient_email": job.recipient_email,
        "status": job.status, "match_score": job.match_score, "reasoning": job.reasoning,
        "missing_skills": job.missing_skills or [], "resume_suggestions": job.resume_suggestions,
        "cover_letter": job.cover_letter, "created_at": job.created_at, "updated_at": job.updated_at,
        "error": job.error, "platform": job.platform, "location": job.location, "date_posted": job.date_posted,
    }
