"""
APScheduler-based daily auto-search scheduler.
Each user can have one enabled schedule that runs at a configured HH:MM time.
"""
import logging
import datetime
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

logger = logging.getLogger(__name__)
scheduler = BackgroundScheduler(timezone="UTC")


def _run_user_search(user_id: str):
    """Execute the search pipeline for a scheduled user."""
    import asyncio
    from database import SessionLocal
    from models import UserSchedule, User
    from routers.search import SearchRequest, _run_search_pipeline

    db = SessionLocal()
    try:
        sched = db.query(UserSchedule).filter(UserSchedule.user_id == user_id, UserSchedule.enabled == True).first()
        if not sched:
            return
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            return

        request = SearchRequest(
            resume="",  # scheduler runs without a fresh resume — uses last stored keywords
            recipient_email=user.email,
            applicant_name=user.name,
            keywords=sched.keywords,
            location=sched.location,
            platforms=sched.platforms or ["indeed", "linkedin"],
            results_per_site=sched.results_per_site,
            hours_old=sched.hours_old,
            auto_pipeline=sched.auto_pipeline,
            user_id=user_id,
        )

        # Update last_run
        sched.last_run = datetime.datetime.utcnow().isoformat()
        db.commit()

        logger.info("Running scheduled search for user %s", user_id)
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(_run_search_pipeline(request))
        finally:
            loop.close()
    except Exception as e:
        logger.error("Scheduled search failed for user %s: %s", user_id, e)
    finally:
        db.close()


def _job_id(user_id: str) -> str:
    return f"search_{user_id}"


def upsert_schedule(user_id: str, run_time: str, enabled: bool):
    """Add or update a cron job for this user. run_time is 'HH:MM' UTC."""
    job_id = _job_id(user_id)
    if scheduler.get_job(job_id):
        scheduler.remove_job(job_id)
    if enabled:
        hour, minute = run_time.split(":")
        scheduler.add_job(
            _run_user_search,
            CronTrigger(hour=int(hour), minute=int(minute)),
            id=job_id,
            args=[user_id],
            replace_existing=True,
            misfire_grace_time=300,
        )
        logger.info("Scheduled daily search for user %s at %s UTC", user_id, run_time)


def remove_schedule(user_id: str):
    job_id = _job_id(user_id)
    if scheduler.get_job(job_id):
        scheduler.remove_job(job_id)


def load_all_schedules():
    """Load all enabled schedules from DB on startup."""
    from database import SessionLocal
    from models import UserSchedule
    db = SessionLocal()
    try:
        schedules = db.query(UserSchedule).filter(UserSchedule.enabled == True).all()
        for s in schedules:
            upsert_schedule(s.user_id, s.run_time, True)
        logger.info("Loaded %d user schedule(s) from DB", len(schedules))
    finally:
        db.close()
