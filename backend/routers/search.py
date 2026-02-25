"""
POST /api/search
Scrapes jobs from selected platforms, scores each against the resume with Gemini,
and queues those above threshold into the pipeline automatically.

NOTE: This module calls the service layer directly (no internal HTTP self-calls).
"""
from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import uuid, datetime, asyncio, logging

from config import app_config, DEFAULT_LOCATION, DEFAULT_RESULTS_EACH
from services.job_scraper import scrape_jobs, SUPPORTED_PLATFORMS
from services.scorer import score_resume
from services.tailor_service import tailor_documents
from services.email_service import send_match_email
from routers.jobs import _jobs, update_job

router = APIRouter()
logger = logging.getLogger(__name__)


class SearchRequest(BaseModel):
    resume: str
    recipient_email: str
    applicant_name: str = "Applicant"
    keywords: str = ""
    location: str = DEFAULT_LOCATION
    platforms: List[str] = ["indeed", "linkedin", "glassdoor", "zip_recruiter"]
    results_per_site: int = DEFAULT_RESULTS_EACH
    hours_old: int = 72
    auto_pipeline: bool = True    # if True, jobs above threshold run full pipeline automatically


class SearchResult(BaseModel):
    job_id: str
    title: str
    company: str
    location: str
    url: str
    platform: str
    date_posted: str
    match_score: Optional[int] = None
    status: str


class SearchResponse(BaseModel):
    total_found: int
    above_threshold: int
    jobs: List[SearchResult]
    message: str


def _now() -> str:
    return datetime.datetime.utcnow().isoformat()


async def _pipeline_job(
    job_id: str,
    resume: str,
    job: dict,
    recipient_email: str,
    applicant_name: str,
):
    """Run full score → tailor → email for a single job, calling services directly."""

    # ── Score ────────────────────────────────────────────────────────────────
    update_job(job_id, status="scoring")
    try:
        sd = await score_resume(resume, job["description"])
    except Exception as e:
        update_job(job_id, status="error", error=f"Scoring: {e}")
        logger.warning("Scoring failed for job %s: %s", job_id, e)
        return

    score = sd["match_score"]
    update_job(
        job_id,
        match_score=score,
        reasoning=sd.get("reasoning", ""),
        missing_skills=sd.get("missing_skills", []),
    )

    if score < app_config["match_threshold"]:
        update_job(job_id, status="below_threshold")
        return

    # ── Tailor ───────────────────────────────────────────────────────────────
    update_job(job_id, status="tailoring")
    try:
        td = await tailor_documents(
            resume=resume,
            job_description=job["description"],
            missing_skills=sd.get("missing_skills", []),
            applicant_name=applicant_name,
            job_title=job["title"],
            company_name=job["company"],
        )
    except Exception as e:
        update_job(job_id, status="error", error=f"Tailoring: {e}")
        logger.warning("Tailoring failed for job %s: %s", job_id, e)
        return

    update_job(
        job_id,
        resume_suggestions=td["resume_suggestions"],
        cover_letter=td["cover_letter"],
    )

    # ── Email ────────────────────────────────────────────────────────────────
    update_job(job_id, status="emailing")
    try:
        result = await send_match_email(
            recipient_email=recipient_email,
            applicant_name=applicant_name,
            job_title=job["title"],
            company_name=job["company"],
            job_url=job.get("url", ""),
            resume_suggestions=td["resume_suggestions"],
            cover_letter=td["cover_letter"],
            match_score=score,
        )
        if result.get("status") == "skipped":
            # SMTP not configured — still mark as scored so the user can review
            update_job(job_id, status="scored")
        else:
            update_job(job_id, status="emailed")
    except Exception as e:
        update_job(job_id, status="error", error=f"Email: {e}")
        logger.warning("Email failed for job %s: %s", job_id, e)


async def _run_search_pipeline(request: SearchRequest):
    """Background task: scrape → score all → pipeline eligible ones."""

    # 1. Scrape jobs (blocking I/O — run in threadpool)
    loop = asyncio.get_event_loop()
    try:
        raw_jobs = await loop.run_in_executor(
            None,
            lambda: scrape_jobs(
                keywords=request.keywords or request.resume[:80],
                location=request.location,
                platforms=request.platforms,
                results_per_site=request.results_per_site,
                hours_old=request.hours_old,
            ),
        )
    except Exception as e:
        logger.error("Job scraping failed: %s", e)
        raw_jobs = []

    if not raw_jobs:
        logger.info("No jobs found for query.")
        return

    logger.info("Scraped %d jobs, starting pipeline…", len(raw_jobs))

    # 2. Register all jobs immediately so they appear in the feed
    job_ids = []
    for job in raw_jobs:
        now = _now()
        job_id = str(uuid.uuid4())
        job_ids.append((job_id, job))
        _jobs[job_id] = {
            "id": job_id,
            "title": job["title"],
            "company": job["company"],
            "url": job["url"],
            "resume": request.resume,
            "job_description": job["description"],
            "recipient_email": request.recipient_email,
            "applicant_name": request.applicant_name,
            "status": "queued",
            "match_score": None,
            "reasoning": None,
            "missing_skills": [],
            "resume_suggestions": None,
            "cover_letter": None,
            "created_at": now,
            "updated_at": now,
            "error": None,
            "platform": job.get("platform", ""),
            "location": job.get("location", ""),
            "date_posted": job.get("date_posted", ""),
        }

    # 3. Score + pipeline concurrently (max 5 at a time to be polite to Gemini)
    sem = asyncio.Semaphore(5)

    async def process_one(job_id: str, job: dict):
        async with sem:
            if request.auto_pipeline:
                await _pipeline_job(
                    job_id,
                    request.resume,
                    job,
                    request.recipient_email,
                    request.applicant_name,
                )
            else:
                # Score only
                update_job(job_id, status="scoring")
                try:
                    sd = await score_resume(request.resume, job["description"])
                    score = sd["match_score"]
                    update_job(
                        job_id,
                        match_score=score,
                        reasoning=sd.get("reasoning", ""),
                        missing_skills=sd.get("missing_skills", []),
                        status="below_threshold" if score < app_config["match_threshold"] else "scored",
                    )
                except Exception as e:
                    update_job(job_id, status="error", error=str(e))

    await asyncio.gather(*[process_one(jid, j) for jid, j in job_ids])


@router.post("/search", response_model=SearchResponse)
async def search_jobs(request: SearchRequest, background_tasks: BackgroundTasks):
    """
    Kick off a job search + pipeline run in the background.
    Returns immediately; results appear in /api/jobs as they process.
    """
    if not request.keywords and not request.resume:
        raise HTTPException(status_code=400, detail="Provide keywords or resume text")

    background_tasks.add_task(_run_search_pipeline, request)

    platforms_str = ", ".join(request.platforms)
    query = request.keywords or "jobs matching your resume"

    return SearchResponse(
        total_found=0,
        above_threshold=0,
        jobs=[],
        message=(
            f"Searching {platforms_str} for '{query}' in '{request.location}'. "
            f"Jobs will appear in the Dashboard feed as they are discovered and scored."
        ),
    )
