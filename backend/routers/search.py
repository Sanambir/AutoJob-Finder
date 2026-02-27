"""
POST /api/search — Scrapes jobs, stores in DB per-user, runs pipeline in background.
"""
from fastapi import APIRouter, BackgroundTasks, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Optional
import asyncio, datetime, logging
from sqlalchemy.orm import Session

from config import DEFAULT_LOCATION, DEFAULT_RESULTS_EACH
from services.job_scraper import scrape_jobs, SUPPORTED_PLATFORMS
from services.scorer import score_resume
from services.tailor_service import tailor_documents
from services.email_service import send_match_email
from services.auth_service import get_current_user
from database import get_db, SessionLocal
from models import User
from routers.jobs import update_job, create_job_record

router = APIRouter()
logger = logging.getLogger(__name__)


class SearchRequest(BaseModel):
    resume: str = ""
    recipient_email: str
    applicant_name: str = "Applicant"
    keywords: str = ""
    location: str = DEFAULT_LOCATION
    platforms: List[str] = ["indeed", "linkedin", "glassdoor", "zip_recruiter"]
    results_per_site: int = DEFAULT_RESULTS_EACH
    hours_old: int = 72
    auto_pipeline: bool = True
    user_id: Optional[str] = None   # injected by scheduler


class SearchResponse(BaseModel):
    total_found: int
    above_threshold: int
    jobs: List[dict]
    message: str


def _now() -> str:
    return datetime.datetime.utcnow().isoformat()


async def _pipeline_job(job_id: str, resume: str, job: dict, recipient_email: str, applicant_name: str, user_id: str):
    """Score → tailor → email for a single job, writing results to DB."""
    from database import SessionLocal
    from models import User
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        threshold = user.match_threshold if user else 75
    finally:
        db.close()

    update_job(job_id, status="scoring")
    try:
        sd = await score_resume(resume, job["description"])
    except Exception as e:
        update_job(job_id, status="error", error=f"Scoring: {e}")
        logger.warning("Scoring failed for job %s: %s", job_id, e)
        return

    score = sd["match_score"]
    update_job(job_id, match_score=score, reasoning=sd.get("reasoning", ""), missing_skills=sd.get("missing_skills", []))

    if score < threshold:
        update_job(job_id, status="below_threshold")
        return

    update_job(job_id, status="tailoring")
    try:
        td = await tailor_documents(
            resume=resume, job_description=job["description"],
            missing_skills=sd.get("missing_skills", []),
            applicant_name=applicant_name, job_title=job["title"], company_name=job["company"],
        )
    except Exception as e:
        update_job(job_id, status="error", error=f"Tailoring: {e}")
        logger.warning("Tailoring failed for job %s: %s", job_id, e)
        return

    update_job(job_id, resume_suggestions=td["resume_suggestions"], cover_letter=td["cover_letter"])

    update_job(job_id, status="emailing")
    try:
        result = await send_match_email(
            recipient_email=recipient_email, applicant_name=applicant_name,
            job_title=job["title"], company_name=job["company"], job_url=job.get("url", ""),
            resume_suggestions=td["resume_suggestions"], cover_letter=td["cover_letter"], match_score=score,
        )
        update_job(job_id, status="scored" if result.get("status") == "skipped" else "emailed")
    except Exception as e:
        update_job(job_id, status="error", error=f"Email: {e}")
        logger.warning("Email failed for job %s: %s", job_id, e)


async def _run_search_pipeline(request: SearchRequest):
    loop = asyncio.get_event_loop()
    try:
        raw_jobs = await loop.run_in_executor(None, lambda: scrape_jobs(
            keywords=request.keywords or request.resume[:80],
            location=request.location, platforms=request.platforms,
            results_per_site=request.results_per_site, hours_old=request.hours_old,
        ))
    except Exception as e:
        logger.error("Job scraping failed: %s", e)
        raw_jobs = []

    if not raw_jobs:
        logger.info("No jobs found for query.")
        return

    logger.info("Scraped %d jobs, starting pipeline…", len(raw_jobs))

    # Register all jobs in DB
    job_ids = []
    for job in raw_jobs:
        job_id = create_job_record(request.user_id, {
            "title": job["title"], "company": job["company"], "url": job["url"],
            "resume": request.resume, "job_description": job["description"],
            "recipient_email": request.recipient_email, "applicant_name": request.applicant_name,
            "status": "queued", "platform": job.get("platform", ""),
            "location": job.get("location", ""), "date_posted": job.get("date_posted", ""),
        })
        job_ids.append((job_id, job))

    sem = asyncio.Semaphore(5)

    async def process_one(job_id, job):
        async with sem:
            if request.auto_pipeline:
                await _pipeline_job(job_id, request.resume, job, request.recipient_email, request.applicant_name, request.user_id)
            else:
                update_job(job_id, status="scoring")
                try:
                    sd = await score_resume(request.resume, job["description"])
                    score = sd["match_score"]
                    db = SessionLocal()
                    user = db.query(User).filter(User.id == request.user_id).first()
                    threshold = user.match_threshold if user else 75
                    db.close()
                    update_job(job_id, match_score=score, reasoning=sd.get("reasoning", ""),
                               missing_skills=sd.get("missing_skills", []),
                               status="below_threshold" if score < threshold else "scored")
                except Exception as e:
                    update_job(job_id, status="error", error=str(e))

    await asyncio.gather(*[process_one(jid, j) for jid, j in job_ids])


@router.post("/search", response_model=SearchResponse)
async def search_jobs(
    request: SearchRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not request.keywords and not request.resume:
        raise HTTPException(status_code=400, detail="Provide keywords or resume text")

    request.user_id = current_user.id
    background_tasks.add_task(_run_search_pipeline, request)

    return SearchResponse(
        total_found=0, above_threshold=0, jobs=[],
        message=f"Searching {', '.join(request.platforms)} for '{request.keywords or 'jobs matching your resume'}' in '{request.location}'. Jobs will appear in the feed as they are discovered and scored.",
    )
