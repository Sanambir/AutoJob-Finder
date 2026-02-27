"""
Manual pipeline: POST /api/pipeline — auth required, stores job in DB under current user.
"""
from fastapi import APIRouter, BackgroundTasks, Depends
from pydantic import BaseModel
from typing import Optional
from sqlalchemy.orm import Session

from database import get_db, SessionLocal
from services.auth_service import get_current_user
from services.scorer import score_resume
from services.tailor_service import tailor_documents
from services.email_service import send_match_email
from models import User
from routers.jobs import create_job_record, update_job

router = APIRouter()


class PipelineRequest(BaseModel):
    resume: str
    job_description: str
    job_url: str = ""
    recipient_email: str
    applicant_name: str = "Applicant"
    job_title: str = "Position"
    company_name: str = "Company"


class PipelineResponse(BaseModel):
    job_id: str
    status: str
    message: str


async def _run_pipeline(job_id: str, request: PipelineRequest, user_id: str):
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        threshold = user.match_threshold if user else 75
    finally:
        db.close()

    update_job(job_id, status="scoring")
    try:
        sd = await score_resume(request.resume, request.job_description)
    except Exception as e:
        update_job(job_id, status="error", error=f"Scoring: {e}")
        return

    score = sd["match_score"]
    update_job(job_id, match_score=score, reasoning=sd.get("reasoning", ""), missing_skills=sd.get("missing_skills", []))

    if score < threshold:
        update_job(job_id, status="below_threshold")
        return

    update_job(job_id, status="tailoring")
    try:
        td = await tailor_documents(
            resume=request.resume, job_description=request.job_description,
            missing_skills=sd.get("missing_skills", []), applicant_name=request.applicant_name,
            job_title=request.job_title, company_name=request.company_name,
        )
    except Exception as e:
        update_job(job_id, status="error", error=f"Tailoring: {e}")
        return

    update_job(job_id, resume_suggestions=td["resume_suggestions"], cover_letter=td["cover_letter"])

    update_job(job_id, status="emailing")
    try:
        result = await send_match_email(
            recipient_email=request.recipient_email, applicant_name=request.applicant_name,
            job_title=request.job_title, company_name=request.company_name,
            job_url=request.job_url, resume_suggestions=td["resume_suggestions"],
            cover_letter=td["cover_letter"], match_score=score,
        )
        update_job(job_id, status="scored" if result.get("status") == "skipped" else "emailed")
    except Exception as e:
        update_job(job_id, status="error", error=f"Email: {e}")


@router.post("/pipeline", response_model=PipelineResponse)
async def run_pipeline(
    request: PipelineRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    job_id = create_job_record(current_user.id, {
        "title": request.job_title, "company": request.company_name, "url": request.job_url,
        "resume": request.resume, "job_description": request.job_description,
        "recipient_email": request.recipient_email, "applicant_name": request.applicant_name,
        "status": "queued", "platform": "manual",
    }, db=db)

    background_tasks.add_task(_run_pipeline, job_id, request, current_user.id)
    return PipelineResponse(job_id=job_id, status="queued", message=f"Pipeline started — job ID: {job_id}")
