"""
Jobs router - SQLite backed, per-user scoped.
"""
from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Optional
import uuid, io
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import func as sqla_func

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
    kanban_stage: str = "discovered"
    notes: Optional[str] = None
    salary_min: Optional[str] = None
    salary_max: Optional[str] = None
    job_type: Optional[str] = None
    interview_prep: Optional[str] = None
    deadline: Optional[str] = None
    is_expired: bool = False
    resume_id: Optional[str] = None

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
        "kanban_stage": job.kanban_stage or "discovered",
        "notes": job.notes, "salary_min": job.salary_min,
        "salary_max": job.salary_max, "job_type": job.job_type,
        "interview_prep": job.interview_prep,
        "deadline": job.deadline,
        "is_expired": bool(job.is_expired),
        "resume_id": job.resume_id,
    }


class JobsPage(BaseModel):
    jobs: List[JobRecord]
    total: int
    page: int
    page_size: int
    pages: int


@router.get("/jobs", response_model=JobsPage)
def list_jobs(
    page: int = 1,
    page_size: int = 20,
    status: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return a paginated, optionally status-filtered list of jobs for the current user.

    Query params:
      - page      : 1-based page number (default 1)
      - page_size : results per page, capped at 100 (default 20)
      - status    : filter by status string e.g. ?status=emailed
    """
    page_size = min(max(page_size, 1), 100)
    page = max(page, 1)

    q = db.query(Job).filter(Job.user_id == current_user.id)
    if status:
        q = q.filter(Job.status == status)

    total = q.count()
    jobs = (
        q.order_by(Job.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return JobsPage(
        jobs=[_to_record(j) for j in jobs],
        total=total,
        page=page,
        page_size=page_size,
        pages=max(1, -(-total // page_size)),  # ceiling division
    )


@router.post("/jobs", response_model=JobRecord)
def create_job(payload: JobCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    now = datetime.utcnow().isoformat() + "Z"
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


# ── Stats endpoint ────────────────────────────────────────────────────────────

class StatsResponse(BaseModel):
    total_jobs: int = 0
    emailed: int = 0
    avg_score: Optional[float] = None
    by_status: dict = {}
    recent_7d: int = 0
    errors: int = 0


@router.get("/stats", response_model=StatsResponse)
def get_stats(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    jobs = db.query(Job).filter(Job.user_id == current_user.id).all()
    if not jobs:
        return StatsResponse()

    by_status = {}
    total_score = 0
    scored_count = 0
    cutoff = datetime.utcnow() - timedelta(days=7)
    recent = 0

    for j in jobs:
        by_status[j.status] = by_status.get(j.status, 0) + 1
        if j.match_score is not None:
            total_score += j.match_score
            scored_count += 1
        try:
            if j.created_at and datetime.fromisoformat(j.created_at) > cutoff:
                recent += 1
        except (ValueError, TypeError):
            pass

    return StatsResponse(
        total_jobs=len(jobs),
        emailed=by_status.get("emailed", 0),
        avg_score=round(total_score / scored_count, 1) if scored_count else None,
        by_status=by_status,
        recent_7d=recent,
        errors=by_status.get("error", 0),
    )


# ── Retry endpoint ────────────────────────────────────────────────────────────

@router.post("/jobs/{job_id}/retry")
async def retry_job(
    job_id: str,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    job = db.query(Job).filter(Job.id == job_id, Job.user_id == current_user.id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.status != "error":
        raise HTTPException(status_code=400, detail="Only error jobs can be retried")

    job.status = "queued"
    job.error = None
    job.updated_at = datetime.utcnow().isoformat() + "Z"
    db.commit()

    # Re-run the pipeline in background
    from routers.pipeline import _run_pipeline, PipelineRequest
    req = PipelineRequest(
        resume=job.resume, job_description=job.job_description,
        job_url=job.url, recipient_email=job.recipient_email,
        applicant_name=job.applicant_name, job_title=job.title,
        company_name=job.company,
    )
    background_tasks.add_task(_run_pipeline, job_id, req, current_user.id)
    return {"status": "queued", "job_id": job_id, "message": "Job re-queued for processing"}


# ── Cover Letter PDF download ─────────────────────────────────────────────────

@router.get("/jobs/{job_id}/cover-letter.pdf")
def download_cover_letter(
    job_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    job = db.query(Job).filter(Job.id == job_id, Job.user_id == current_user.id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if not job.cover_letter:
        raise HTTPException(status_code=404, detail="No cover letter generated yet")

    from services.pdf_service import generate_cover_letter_pdf
    pdf_bytes = generate_cover_letter_pdf(
        name=job.applicant_name,
        content=job.cover_letter,
    )
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="cover_letter_{job.company}.pdf"'},
    )


# ── Kanban stage update ───────────────────────────────────────────────────────

class KanbanStageUpdate(BaseModel):
    stage: str   # discovered | applied | interview | offer | rejected


KANBAN_STAGES = {"discovered", "applied", "interview", "offer", "rejected"}


@router.patch("/jobs/{job_id}/stage")
def update_kanban_stage(
    job_id: str,
    body: KanbanStageUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if body.stage not in KANBAN_STAGES:
        raise HTTPException(status_code=400, detail=f"Invalid stage. Must be one of: {', '.join(KANBAN_STAGES)}")
    job = db.query(Job).filter(Job.id == job_id, Job.user_id == current_user.id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    job.kanban_stage = body.stage
    job.updated_at = datetime.utcnow().isoformat() + "Z"
    db.commit()
    return {"job_id": job_id, "kanban_stage": body.stage}


# ── Notes endpoint ───────────────────────────────────────────────────────────

class NotesUpdate(BaseModel):
    notes: str


@router.patch("/jobs/{job_id}/notes")
def update_notes(
    job_id: str,
    body: NotesUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    job = db.query(Job).filter(Job.id == job_id, Job.user_id == current_user.id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    job.notes = body.notes
    job.updated_at = datetime.utcnow().isoformat() + "Z"
    db.commit()
    return {"job_id": job_id, "notes": job.notes}


# ── Bulk action endpoints ─────────────────────────────────────────────────────

@router.post("/jobs/bulk-retry")
async def bulk_retry(
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Re-queue all error jobs for the current user."""
    error_jobs = db.query(Job).filter(Job.user_id == current_user.id, Job.status == "error").all()
    count = 0
    for job in error_jobs:
        job.status = "queued"
        job.error = None
        job.updated_at = datetime.utcnow().isoformat() + "Z"
        count += 1

        from routers.pipeline import _run_pipeline, PipelineRequest
        req = PipelineRequest(
            resume=job.resume, job_description=job.job_description,
            job_url=job.url, recipient_email=job.recipient_email,
            applicant_name=job.applicant_name, job_title=job.title,
            company_name=job.company,
        )
        background_tasks.add_task(_run_pipeline, job.id, req, current_user.id)

    db.commit()
    return {"retried": count}


@router.post("/jobs/bulk-delete-below-threshold")
def bulk_delete_below_threshold(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete all below_threshold jobs for the current user."""
    rows = db.query(Job).filter(Job.user_id == current_user.id, Job.status == "below_threshold").all()
    count = len(rows)
    for job in rows:
        db.delete(job)
    db.commit()
    return {"deleted": count}


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
            job.updated_at = datetime.utcnow().isoformat() + "Z"
            db.commit()
    finally:
        if own_session:
            db.close()


# ── Cover letter / tailoring on-demand ───────────────────────────────────────

async def _tailor_job_background(job_id: str, user_id: str, resume_id: Optional[str] = None):
    """Run just the tailoring step (resume suggestions + cover letter) for any existing job.

    If resume_id is provided, fetch that specific resume and use it instead of the job's
    stored resume text — this enables Resume A/B comparison.
    """
    import asyncio
    from services.tailor_service import tailor_documents
    from routers.activity import log_activity
    import logging
    _log = logging.getLogger(__name__)

    def _load_job():
        from database import SessionLocal
        from models import Resume as ResumeModel
        db = SessionLocal()
        try:
            job = db.query(Job).filter(Job.id == job_id).first()
            if not job:
                return None
            resume_text = job.resume or ""
            used_resume_id = job.resume_id
            if resume_id:
                r = db.query(ResumeModel).filter(ResumeModel.id == resume_id).first()
                if r:
                    resume_text = r.resume_text
                    used_resume_id = resume_id
            return {
                "resume": resume_text,
                "job_description": job.job_description or "",
                "title": job.title or "",
                "company": job.company or "",
                "applicant_name": job.applicant_name or "Applicant",
                "missing_skills": job.missing_skills or [],
                "used_resume_id": used_resume_id,
            }
        finally:
            db.close()

    data = await asyncio.to_thread(_load_job)
    if not data:
        return

    try:
        td = await tailor_documents(
            resume=data["resume"],
            job_description=data["job_description"],
            missing_skills=data["missing_skills"],
            applicant_name=data["applicant_name"],
            job_title=data["title"],
            company_name=data["company"],
        )
        await asyncio.to_thread(
            update_job, job_id,
            resume_suggestions=td["resume_suggestions"],
            cover_letter=td["cover_letter"],
            resume_id=data["used_resume_id"],
        )
        await asyncio.to_thread(
            log_activity, user_id, "tailored",
            f"Cover letter generated for {data['title']} at {data['company']}", job_id,
        )
        _log.info("Cover letter generated for job %s", job_id)
    except Exception as e:
        _log.warning("Tailoring failed for job %s: %s", job_id, e)
        await asyncio.to_thread(
            update_job, job_id, error=f"Cover letter generation failed: {str(e)[:120]}"
        )


class TailorRequest(BaseModel):
    resume_id: Optional[str] = None   # if set, tailor with this specific saved resume


@router.post("/jobs/{job_id}/tailor")
async def generate_cover_letter(
    job_id: str,
    background_tasks: BackgroundTasks,
    body: TailorRequest = TailorRequest(),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Generate (or regenerate) resume suggestions and a cover letter for any job.
    Pass resume_id in the body to tailor using a specific saved resume (A/B testing).
    """
    job = db.query(Job).filter(Job.id == job_id, Job.user_id == current_user.id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if not job.resume and not body.resume_id:
        raise HTTPException(status_code=400, detail="No resume attached — run a search with an active resume first.")
    if not job.job_description:
        raise HTTPException(status_code=400, detail="No job description available for this job.")

    background_tasks.add_task(_tailor_job_background, job_id, current_user.id, body.resume_id)
    return {"status": "tailoring", "message": "Generating cover letter and resume suggestions…"}


# ── Interview prep on-demand ──────────────────────────────────────────────────

async def _interview_prep_background(job_id: str, user_id: str):
    """Generate an interview preparation guide for an existing job."""
    import asyncio
    from services.tailor_service import generate_interview_prep
    from routers.activity import log_activity
    import logging
    _log = logging.getLogger(__name__)

    def _load_job():
        from database import SessionLocal
        db = SessionLocal()
        try:
            job = db.query(Job).filter(Job.id == job_id).first()
            if not job:
                return None
            return {
                "resume": job.resume or "",
                "job_description": job.job_description or "",
                "title": job.title or "",
                "company": job.company or "",
            }
        finally:
            db.close()

    data = await asyncio.to_thread(_load_job)
    if not data:
        return

    try:
        prep = await generate_interview_prep(
            resume=data["resume"],
            job_description=data["job_description"],
            job_title=data["title"],
            company_name=data["company"],
        )
        await asyncio.to_thread(update_job, job_id, interview_prep=prep)
        await asyncio.to_thread(
            log_activity, user_id, "interview_prep",
            f"Interview prep generated for {data['title']} at {data['company']}", job_id,
        )
        _log.info("Interview prep generated for job %s", job_id)
    except Exception as e:
        _log.warning("Interview prep failed for job %s: %s", job_id, e)


@router.post("/jobs/{job_id}/interview-prep")
async def generate_interview_prep_endpoint(
    job_id: str,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Generate (or regenerate) an interview prep guide for any job."""
    job = db.query(Job).filter(Job.id == job_id, Job.user_id == current_user.id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if not job.job_description:
        raise HTTPException(status_code=400, detail="No job description available for this job.")

    background_tasks.add_task(_interview_prep_background, job_id, current_user.id)
    return {"status": "generating", "message": "Generating interview prep guide…"}


# ── Deadline endpoint ─────────────────────────────────────────────────────────

class DeadlineUpdate(BaseModel):
    deadline: Optional[str] = None   # ISO date "YYYY-MM-DD" or null to clear


@router.patch("/jobs/{job_id}/deadline")
def update_deadline(
    job_id: str,
    body: DeadlineUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    job = db.query(Job).filter(Job.id == job_id, Job.user_id == current_user.id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    job.deadline = body.deadline
    job.updated_at = datetime.utcnow().isoformat() + "Z"
    db.commit()
    return {"job_id": job_id, "deadline": job.deadline}


# ── Bulk actions ──────────────────────────────────────────────────────────────

class BulkJobIds(BaseModel):
    job_ids: List[str]


class BulkStageUpdate(BaseModel):
    job_ids: List[str]
    stage: str


@router.post("/jobs/bulk-tailor")
async def bulk_tailor(
    body: BulkJobIds,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Queue cover-letter + resume-suggestions generation for multiple jobs."""
    queued = []
    for job_id in body.job_ids[:20]:   # cap at 20 to avoid abuse
        job = db.query(Job).filter(Job.id == job_id, Job.user_id == current_user.id).first()
        if job and job.resume and job.job_description:
            background_tasks.add_task(_tailor_job_background, job_id, current_user.id)
            queued.append(job_id)
    return {"queued": len(queued), "job_ids": queued}


@router.patch("/jobs/bulk-stage")
def bulk_stage(
    body: BulkStageUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Move multiple jobs to a kanban stage."""
    if body.stage not in KANBAN_STAGES:
        raise HTTPException(status_code=400, detail=f"Invalid stage: {body.stage}")
    updated = 0
    for job_id in body.job_ids[:50]:
        job = db.query(Job).filter(Job.id == job_id, Job.user_id == current_user.id).first()
        if job:
            job.kanban_stage = body.stage
            job.updated_at = datetime.utcnow().isoformat() + "Z"
            updated += 1
    db.commit()
    return {"updated": updated}


@router.delete("/jobs/bulk-delete")
def bulk_delete(
    body: BulkJobIds,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete multiple jobs."""
    deleted = 0
    for job_id in body.job_ids[:50]:
        job = db.query(Job).filter(Job.id == job_id, Job.user_id == current_user.id).first()
        if job:
            db.delete(job)
            deleted += 1
    db.commit()
    return {"deleted": deleted}


def create_job_record(user_id: str, job_data: dict, db: Session = None) -> str:
    """Create a job row in the DB. Returns the new job_id."""
    from database import SessionLocal
    own_session = db is None
    if own_session:
        db = SessionLocal()
    try:
        now = datetime.utcnow().isoformat() + "Z"
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