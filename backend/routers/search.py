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
from routers.activity import log_activity

router = APIRouter()
logger = logging.getLogger(__name__)

# ── Global concurrency guards ─────────────────────────────────────────────────
# These are shared across ALL users / background tasks.
#
# _SCRAPE_SEM: max simultaneous jobspy scrape sessions.
#   jobspy opens real HTTP connections — too many at once hammers the job boards
#   and exhausts the thread-pool. 8 concurrent searches is plenty for beta scale.
#
# _GEMINI_SEM: max simultaneous Gemini API calls.
#   Free-tier Gemini Flash allows ~15 req/min. Even paid tiers have QPM limits.
#   Cap at 5 so 100 queued users don't all fire Gemini simultaneously and get 429s.
#   Jobs still process — they just wait their turn.
_SCRAPE_SEM: asyncio.Semaphore | None = None
_GEMINI_SEM: asyncio.Semaphore | None = None

def _get_scrape_sem() -> asyncio.Semaphore:
    global _SCRAPE_SEM
    if _SCRAPE_SEM is None:
        _SCRAPE_SEM = asyncio.Semaphore(8)
    return _SCRAPE_SEM

def _get_gemini_sem() -> asyncio.Semaphore:
    global _GEMINI_SEM
    if _GEMINI_SEM is None:
        _GEMINI_SEM = asyncio.Semaphore(5)
    return _GEMINI_SEM


class SearchRequest(BaseModel):
    resume: str = ""
    recipient_email: str
    applicant_name: str = "Applicant"
    keywords: str = ""
    location: str = DEFAULT_LOCATION
    platforms: List[str] = ["linkedin", "indeed"]
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
    return datetime.datetime.utcnow().isoformat() + "Z"


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
        # Gemini Flash supports 1M token context — send the full resume.
        # Previous 3000-char limit was cutting most resumes mid-way through
        # the contact/education section, causing Gemini to see no work experience.
        # Cap at 15000 chars (~3000 words) to cover even 4-page CVs comfortably.
        resume_trim = resume[:15000]
        jd_trim = job["description"][:8000]
        sd = await score_resume(resume_trim, jd_trim)
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
        # Email failure is non-fatal — job is still scored and visible in feed
        logger.warning("Email failed for job %s (still marking scored): %s", job_id, e)
        update_job(job_id, status="scored", error=f"Email failed: {str(e)[:120]}")


async def _scrape_platform(platform: str, request: SearchRequest, loop, scrape_sem: asyncio.Semaphore) -> list:
    """Scrape one platform inside the provided scrape semaphore."""
    async with scrape_sem:
        try:
            return await asyncio.wait_for(
                loop.run_in_executor(None, lambda: scrape_jobs(
                    keywords=request.keywords or request.resume[:80],
                    location=request.location,
                    platforms=[platform],
                    results_per_site=request.results_per_site,
                    hours_old=request.hours_old,
                )),
                timeout=90.0,   # prevent a hung scrape from blocking the pipeline
            )
        except asyncio.TimeoutError:
            logger.warning("Scraping %s timed out after 90s — skipping platform", platform)
            return []


async def _run_search_pipeline(request: SearchRequest, _bypass_sem: bool = False):
    loop = asyncio.get_running_loop()

    # Use global shared semaphores for web-request paths (shared across all users).
    # Scheduler path passes _bypass_sem=True to get fresh semaphores — the
    # scheduler runs in its own isolated event loop and cannot share Semaphore
    # objects with the main FastAPI event loop without risking RuntimeError.
    scrape_sem = asyncio.Semaphore(8) if _bypass_sem else _get_scrape_sem()
    gemini_sem = asyncio.Semaphore(5) if _bypass_sem else _get_gemini_sem()

    # Scrape all platforms in parallel (each waits for a slot in scrape_sem).
    # Previously they ran sequentially — now LinkedIn + Indeed run at the same time.
    try:
        platform_results = await asyncio.gather(
            *[_scrape_platform(p, request, loop, scrape_sem) for p in request.platforms],
            return_exceptions=True,
        )
        raw_jobs = []
        for result in platform_results:
            if isinstance(result, list):
                raw_jobs.extend(result)
            elif isinstance(result, Exception):
                logger.warning("Platform scraping failed: %s", result)
    except Exception as e:
        logger.error("Job scraping failed: %s", e)
        raw_jobs = []

    if not raw_jobs:
        logger.info("No jobs found for query.")
        return

    logger.info("Scraped %d jobs, starting pipeline…", len(raw_jobs))
    log_activity(request.user_id, "search", f"Found {len(raw_jobs)} jobs for '{request.keywords or 'resume match'}'")

    # Deduplicate: skip jobs with same title+company already in DB for this user
    from models import Job as JobModel
    db_dedup = SessionLocal()
    try:
        existing = db_dedup.query(JobModel.title, JobModel.company).filter(JobModel.user_id == request.user_id).all()
        seen = {(r.title.lower().strip(), r.company.lower().strip()) for r in existing}
    finally:
        db_dedup.close()

    unique_jobs = [j for j in raw_jobs if (j["title"].lower().strip(), j["company"].lower().strip()) not in seen]
    if len(unique_jobs) < len(raw_jobs):
        logger.info("Deduplication: %d already seen, %d new", len(raw_jobs) - len(unique_jobs), len(unique_jobs))
    raw_jobs = unique_jobs
    if not raw_jobs:
        logger.info("All scraped jobs already in DB — nothing new to process.")
        return

    # Register all jobs in DB
    job_ids = []
    for job in raw_jobs:
        job_id = create_job_record(request.user_id, {
            "title": job["title"], "company": job["company"], "url": job["url"],
            "resume": request.resume, "job_description": job["description"],
            "recipient_email": request.recipient_email, "applicant_name": request.applicant_name,
            "status": "queued", "platform": job.get("platform", ""),
            "location": job.get("location", ""), "date_posted": job.get("date_posted", ""),
            "salary_min": job.get("salary_min", ""), "salary_max": job.get("salary_max", ""),
            "job_type": job.get("job_type", ""),
        })
        job_ids.append((job_id, job))

    async def process_one(job_id, job):
        try:
            # Gemini semaphore — global for web requests, local for scheduler.
            # Prevents too many simultaneous Gemini calls (rate limit protection).
            async with gemini_sem:
                if request.auto_pipeline:
                    await _pipeline_job(job_id, request.resume, job, request.recipient_email, request.applicant_name, request.user_id)
                else:
                    update_job(job_id, status="scoring")
                    try:
                        resume_trim = request.resume[:15000]
                        jd_trim = job["description"][:8000]
                        sd = await score_resume(resume_trim, jd_trim)
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
        except Exception as e:
            # Catch anything that escaped inner try/excepts so it cannot
            # cancel the remaining jobs in asyncio.gather
            logger.error("Unexpected pipeline error for job %s: %s", job_id, e)
            update_job(job_id, status="error", error=f"Pipeline error: {str(e)[:200]}")

    # return_exceptions=True ensures one failure never cancels the other jobs
    results = await asyncio.gather(
        *[process_one(jid, j) for jid, j in job_ids],
        return_exceptions=True,
    )
    errors = [r for r in results if isinstance(r, Exception)]
    if errors:
        logger.error("%d job(s) hit unhandled exceptions: %s", len(errors), errors)

    logger.info("Pipeline complete for user %s — %d jobs processed", request.user_id, len(job_ids))
    log_activity(request.user_id, "pipeline", f"Pipeline complete — {len(job_ids)} jobs processed")


@router.post("/search", response_model=SearchResponse)
async def search_jobs(
    request: SearchRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not request.keywords and not current_user.resume_text:
        raise HTTPException(status_code=400, detail="Provide keywords or upload a resume first")

    # Always load the full resume text from the DB — never trust what the
    # frontend sends (it only has the 120-char preview from the resumes list).
    request.resume = current_user.resume_text or ""
    request.user_id = current_user.id
    background_tasks.add_task(_run_search_pipeline, request)

    return SearchResponse(
        total_found=0, above_threshold=0, jobs=[],
        message=f"Searching {', '.join(request.platforms)} for '{request.keywords or 'jobs matching your resume'}' in '{request.location}'. Jobs will appear in the feed as they are discovered and scored.",
    )