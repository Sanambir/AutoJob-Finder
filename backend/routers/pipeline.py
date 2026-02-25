from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import Optional
import httpx, uuid, datetime
from config import app_config
from routers.jobs import _jobs, update_job

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
    match_score: Optional[int] = None
    reasoning: Optional[str] = None
    missing_skills: list = []
    status: str
    message: str
    resume_suggestions: Optional[str] = None
    cover_letter: Optional[str] = None


async def _run_pipeline(job_id: str, request: PipelineRequest):
    base_url = "http://localhost:8000/api"

    async with httpx.AsyncClient(timeout=120.0) as client:
        # ── Score ─────────────────────────────────────────────────────────────
        update_job(job_id, status="scoring")
        try:
            sr = await client.post(f"{base_url}/score",
                json={"resume": request.resume, "job_description": request.job_description})
            sr.raise_for_status()
            score_data = sr.json()
        except Exception as e:
            update_job(job_id, status="error", error=f"Scoring failed: {e}")
            return

        match_score = score_data["match_score"]
        update_job(job_id, match_score=match_score,
                   reasoning=score_data.get("reasoning",""),
                   missing_skills=score_data.get("missing_skills",[]))

        # ── Gate ──────────────────────────────────────────────────────────────
        if match_score < app_config["match_threshold"]:
            update_job(job_id, status="below_threshold")
            return

        # ── Tailor (Gemini) ───────────────────────────────────────────────────
        update_job(job_id, status="tailoring")
        try:
            tr = await client.post(f"{base_url}/tailor", json={
                "resume": request.resume,
                "job_description": request.job_description,
                "missing_skills": score_data.get("missing_skills", []),
                "applicant_name": request.applicant_name,
                "job_title": request.job_title,
                "company_name": request.company_name,
            })
            tr.raise_for_status()
            tailor_data = tr.json()
        except Exception as e:
            update_job(job_id, status="error", error=f"Tailoring failed: {e}")
            return

        update_job(job_id,
                   resume_suggestions=tailor_data["resume_suggestions"],
                   cover_letter=tailor_data["cover_letter"])

        # ── Email ─────────────────────────────────────────────────────────────
        update_job(job_id, status="emailing")
        try:
            er = await client.post(f"{base_url}/send-email", json={
                "recipient_email": request.recipient_email,
                "applicant_name": request.applicant_name,
                "job_title": request.job_title,
                "company_name": request.company_name,
                "job_url": request.job_url,
                "resume_suggestions": tailor_data["resume_suggestions"],
                "cover_letter": tailor_data["cover_letter"],
                "match_score": match_score,
            })
            er.raise_for_status()
        except Exception as e:
            update_job(job_id, status="error", error=f"Email failed: {e}")
            return

        update_job(job_id, status="emailed")


@router.post("/pipeline", response_model=PipelineResponse)
async def run_pipeline(request: PipelineRequest, background_tasks: BackgroundTasks):
    job_id = str(uuid.uuid4())
    now = datetime.datetime.utcnow().isoformat()
    _jobs[job_id] = {
        "id": job_id, "title": request.job_title, "company": request.company_name,
        "url": request.job_url, "resume": request.resume,
        "job_description": request.job_description,
        "recipient_email": request.recipient_email,
        "applicant_name": request.applicant_name,
        "status": "queued", "match_score": None, "reasoning": None,
        "missing_skills": [], "resume_suggestions": None, "cover_letter": None,
        "created_at": now, "updated_at": now, "error": None,
        "platform": "manual", "location": "", "date_posted": "",
    }
    background_tasks.add_task(_run_pipeline, job_id, request)
    return PipelineResponse(
        job_id=job_id, status="queued",
        message="Pipeline started — poll GET /api/jobs/{job_id} for status updates",
    )
