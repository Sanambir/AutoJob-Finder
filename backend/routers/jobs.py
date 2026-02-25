from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import uuid
from datetime import datetime

router = APIRouter()

_jobs: dict = {}


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
    resume_suggestions: Optional[str] = None   # v2: replaces tailored_resume
    cover_letter: Optional[str] = None
    created_at: str = ""
    updated_at: str = ""
    error: Optional[str] = None
    # v2 job-search fields
    platform: str = ""
    location: str = ""
    date_posted: str = ""


@router.get("/jobs", response_model=List[JobRecord])
async def list_jobs():
    return list(_jobs.values())


@router.post("/jobs", response_model=JobRecord)
async def create_job(payload: JobCreate):
    job_id = str(uuid.uuid4())
    now = datetime.utcnow().isoformat()
    record = JobRecord(id=job_id, created_at=now, updated_at=now, **payload.model_dump())
    _jobs[job_id] = record.model_dump()
    return record


@router.get("/jobs/{job_id}", response_model=JobRecord)
async def get_job(job_id: str):
    if job_id not in _jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    return _jobs[job_id]


@router.delete("/jobs/{job_id}")
async def delete_job(job_id: str):
    if job_id not in _jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    del _jobs[job_id]
    return {"deleted": job_id}


def update_job(job_id: str, **kwargs):
    if job_id in _jobs:
        _jobs[job_id].update(kwargs)
        _jobs[job_id]["updated_at"] = datetime.utcnow().isoformat()
