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
            resume=user.resume_text or "",
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
        # asyncio.run() creates a fresh, isolated event loop for this background
        # thread. _bypass_sem=True tells the pipeline to create local semaphores
        # rather than sharing the global ones bound to FastAPI's main event loop,
        # which would raise RuntimeError across event loops in Python 3.11+.
        asyncio.run(_run_search_pipeline(request, _bypass_sem=True))
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

    # Always schedule the daily expiry check and deadline reminders
    _schedule_system_jobs()


def _schedule_system_jobs():
    """Register system-level scheduled jobs (expiry check, deadline reminders)."""
    if not scheduler.get_job("expiry_check"):
        scheduler.add_job(
            _check_job_expiry,
            CronTrigger(hour=3, minute=0),   # 03:00 UTC daily
            id="expiry_check",
            replace_existing=True,
            misfire_grace_time=600,
        )
        logger.info("Scheduled daily job expiry check at 03:00 UTC")

    if not scheduler.get_job("deadline_reminders"):
        scheduler.add_job(
            _send_deadline_reminders,
            CronTrigger(hour=8, minute=0),   # 08:00 UTC daily
            id="deadline_reminders",
            replace_existing=True,
            misfire_grace_time=600,
        )
        logger.info("Scheduled daily deadline reminders at 08:00 UTC")


def _check_job_expiry():
    """Check job URLs and mark expired ones. Runs daily at 03:00 UTC."""
    import time
    import urllib.request
    from database import SessionLocal
    from models import Job as JobModel

    db = SessionLocal()
    try:
        # Only check non-expired jobs with a URL, created in the last 60 days
        cutoff = (datetime.datetime.utcnow() - datetime.timedelta(days=60)).isoformat()
        jobs = (
            db.query(JobModel)
            .filter(
                JobModel.url != "",
                JobModel.url.isnot(None),
                JobModel.is_expired == False,
                JobModel.created_at >= cutoff,
            )
            .limit(200)   # cap per run to avoid overloading
            .all()
        )
        expired_count = 0
        for job in jobs:
            try:
                req = urllib.request.Request(
                    job.url,
                    headers={"User-Agent": "Mozilla/5.0"},
                    method="HEAD",
                )
                with urllib.request.urlopen(req, timeout=8) as resp:
                    if resp.status == 404:
                        job.is_expired = True
                        expired_count += 1
            except urllib.error.HTTPError as e:
                if e.code == 404:
                    job.is_expired = True
                    expired_count += 1
            except Exception:
                pass   # network errors → skip, try again tomorrow
            time.sleep(0.5)   # be polite to external servers

        if expired_count:
            db.commit()
        logger.info("Expiry check: marked %d/%d jobs as expired", expired_count, len(jobs))
    except Exception as e:
        logger.error("Expiry check failed: %s", e)
    finally:
        db.close()


def _send_deadline_reminders():
    """Email users about jobs whose deadline is tomorrow. Runs daily at 08:00 UTC."""
    import smtplib, ssl, os
    from email.mime.text import MIMEText
    from database import SessionLocal
    from models import Job as JobModel, User as UserModel
    from config import SMTP_HOST, SMTP_PORT, SMTP_EMAIL, SMTP_PASSWORD

    tomorrow = (datetime.datetime.utcnow() + datetime.timedelta(days=1)).strftime("%Y-%m-%d")
    from_email = os.getenv("SMTP_FROM_EMAIL", SMTP_EMAIL)

    db = SessionLocal()
    try:
        jobs = (
            db.query(JobModel)
            .filter(JobModel.deadline == tomorrow)
            .all()
        )
        # Group by user
        user_jobs: dict = {}
        for job in jobs:
            user_jobs.setdefault(job.user_id, []).append(job)

        for user_id, user_job_list in user_jobs.items():
            user = db.query(UserModel).filter(UserModel.id == user_id).first()
            if not user:
                continue
            job_lines = "\n".join(
                f"  • {j.title} at {j.company}" for j in user_job_list
            )
            html = f"""
            <div style="font-family:Inter,sans-serif;background:#0a0a0a;color:#e5e2e1;padding:40px;border-radius:12px;max-width:480px;margin:0 auto">
              <h2 style="margin:0 0 16px;font-size:20px;color:white">Application Deadline Tomorrow</h2>
              <p style="color:#999;font-size:14px;margin:0 0 16px">Hi {user.name}, the following applications are due <strong style="color:white">tomorrow</strong>:</p>
              <div style="background:#1a1a1a;border:1px solid rgba(255,255,255,0.1);border-radius:10px;padding:16px;margin-bottom:24px;font-size:14px;color:#ccc;white-space:pre-line">{job_lines}</div>
              <p style="color:#555;font-size:12px;margin:0">Log in to WorkfinderX to manage your applications.</p>
            </div>
            """
            msg = MIMEText(html, "html")
            msg["Subject"] = f"WorkfinderX — {len(user_job_list)} application deadline(s) tomorrow"
            msg["From"]    = f"WorkfinderX <{from_email}>"
            msg["To"]      = user.email
            try:
                timeout = 10
                if int(SMTP_PORT) == 465:
                    ctx = ssl.create_default_context()
                    with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, context=ctx, timeout=timeout) as s:
                        s.login(SMTP_EMAIL, SMTP_PASSWORD)
                        s.sendmail(from_email, user.email, msg.as_string())
                else:
                    with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=timeout) as s:
                        s.ehlo(); s.starttls()
                        s.login(SMTP_EMAIL, SMTP_PASSWORD)
                        s.sendmail(from_email, user.email, msg.as_string())
                logger.info("Deadline reminder sent to %s", user.email)
            except Exception as e:
                logger.error("Failed to send deadline reminder to %s: %s", user.email, e)
    except Exception as e:
        logger.error("Deadline reminders failed: %s", e)
    finally:
        db.close()
