"""
Admin router — all endpoints require is_admin=True.
Provides dashboard overview, user management, job monitoring,
system health, and cross-user activity feed.
"""
import os
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy import func, desc
from sqlalchemy.orm import Session

from database import get_db
from models import User, Job, Resume, ActivityLog, SavedJob
from services.auth_service import get_current_user

router = APIRouter(prefix="/admin", tags=["Admin"])


# ── Auth guard ────────────────────────────────────────────────────────────────

def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


# ── Dashboard overview ────────────────────────────────────────────────────────

@router.get("/overview")
def get_overview(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    now = datetime.utcnow()
    week_ago  = (now - timedelta(days=7)).isoformat()
    today_str = now.strftime("%Y-%m-%d")

    # ── User stats ──
    total_users    = db.query(func.count(User.id)).scalar() or 0
    verified_users = db.query(func.count(User.id)).filter(User.is_verified == True).scalar() or 0
    new_users_7d   = db.query(func.count(User.id)).filter(User.created_at >= week_ago).scalar() or 0

    # ── Job stats ──
    total_jobs  = db.query(func.count(Job.id)).scalar() or 0
    emailed     = db.query(func.count(Job.id)).filter(Job.status == "emailed").scalar() or 0
    errors      = db.query(func.count(Job.id)).filter(Job.status == "error").scalar() or 0
    jobs_7d     = db.query(func.count(Job.id)).filter(Job.created_at >= week_ago).scalar() or 0
    jobs_today  = db.query(func.count(Job.id)).filter(Job.created_at >= today_str).scalar() or 0
    avg_score_q = db.query(func.avg(Job.match_score)).filter(Job.match_score.isnot(None)).scalar()
    avg_score   = round(avg_score_q) if avg_score_q else None

    # Jobs by status breakdown
    by_status_rows = db.query(Job.status, func.count(Job.id)).group_by(Job.status).all()
    by_status = {row[0]: row[1] for row in by_status_rows}

    # ── Recent errors ──
    recent_errors = (
        db.query(Job, User.email)
        .join(User, Job.user_id == User.id)
        .filter(Job.status == "error")
        .order_by(desc(Job.updated_at))
        .limit(8)
        .all()
    )

    # ── New users per day (last 7 days for sparkline) ──
    # SQLite: strftime on created_at
    daily_rows = (
        db.query(
            func.strftime("%Y-%m-%d", User.created_at).label("day"),
            func.count(User.id).label("count"),
        )
        .filter(User.created_at >= week_ago)
        .group_by("day")
        .order_by("day")
        .all()
    )
    user_growth = [{"day": r.day, "count": r.count} for r in daily_rows]

    # ── DB size ──
    db_size = 0
    try:
        db_size = os.path.getsize("./workfinderx.db")
    except Exception:
        pass

    return {
        "users": {
            "total": total_users,
            "verified": verified_users,
            "unverified": total_users - verified_users,
            "new_7d": new_users_7d,
            "growth": user_growth,
        },
        "jobs": {
            "total": total_jobs,
            "emailed": emailed,
            "errors": errors,
            "new_7d": jobs_7d,
            "today": jobs_today,
            "avg_score": avg_score,
            "by_status": by_status,
        },
        "db_size_bytes": db_size,
        "recent_errors": [
            {
                "id": j.id,
                "title": j.title,
                "company": j.company,
                "error": (j.error or "")[:200],
                "user_email": email,
                "updated_at": j.updated_at,
            }
            for j, email in recent_errors
        ],
    }


# ── Users ─────────────────────────────────────────────────────────────────────

@router.get("/users")
def list_users(
    search:    Optional[str] = Query(None),
    page:      int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    q = db.query(User)
    if search:
        term = f"%{search}%"
        q = q.filter((User.email.ilike(term)) | (User.name.ilike(term)))

    total = q.count()
    users = q.order_by(desc(User.created_at)).offset((page - 1) * page_size).limit(page_size).all()

    # Batch-fetch job counts so we don't do N+1 queries
    user_ids = [u.id for u in users]
    total_counts = {
        row[0]: row[1]
        for row in db.query(Job.user_id, func.count(Job.id))
        .filter(Job.user_id.in_(user_ids))
        .group_by(Job.user_id)
        .all()
    }
    emailed_counts = {
        row[0]: row[1]
        for row in db.query(Job.user_id, func.count(Job.id))
        .filter(Job.user_id.in_(user_ids), Job.status == "emailed")
        .group_by(Job.user_id)
        .all()
    }
    # Last active = most recent job created_at per user
    last_active_rows = (
        db.query(Job.user_id, func.max(Job.created_at).label("last"))
        .filter(Job.user_id.in_(user_ids))
        .group_by(Job.user_id)
        .all()
    )
    last_active = {row[0]: row[1] for row in last_active_rows}

    return {
        "users": [
            {
                "id": u.id,
                "name": u.name,
                "email": u.email,
                "is_verified": bool(u.is_verified),
                "is_admin": bool(u.is_admin),
                "locked_until": u.locked_until,
                "failed_attempts": u.failed_login_attempts or 0,
                "created_at": str(u.created_at) if u.created_at else None,
                "job_count": total_counts.get(u.id, 0),
                "emails_sent": emailed_counts.get(u.id, 0),
                "last_active": last_active.get(u.id),
            }
            for u in users
        ],
        "total": total,
        "page": page,
        "pages": max(1, -(-total // page_size)),
    }


@router.post("/users/{user_id}/verify")
def force_verify(
    user_id: str,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "User not found")
    user.is_verified = True
    user.verification_token = None
    db.commit()
    return {"message": f"Verified {user.email}"}


@router.post("/users/{user_id}/unlock")
def unlock_user(
    user_id: str,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "User not found")
    user.locked_until = None
    user.failed_login_attempts = 0
    db.commit()
    return {"message": f"Unlocked {user.email}"}


@router.patch("/users/{user_id}/admin")
def toggle_admin(
    user_id: str,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    if user_id == admin.id:
        raise HTTPException(400, "Cannot change your own admin status")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "User not found")
    user.is_admin = not user.is_admin
    db.commit()
    return {"is_admin": bool(user.is_admin), "email": user.email}


@router.delete("/users/{user_id}")
def delete_user(
    user_id: str,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    if user_id == admin.id:
        raise HTTPException(400, "Cannot delete your own account from the admin panel")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "User not found")
    db.delete(user)
    db.commit()
    return {"message": "Deleted"}


# ── Jobs monitor ──────────────────────────────────────────────────────────────

@router.get("/jobs")
def list_all_jobs(
    status:    Optional[str] = Query(None),
    search:    Optional[str] = Query(None),
    page:      int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    q = db.query(Job, User.email).join(User, Job.user_id == User.id)
    if status:
        q = q.filter(Job.status == status)
    if search:
        term = f"%{search}%"
        q = q.filter((Job.title.ilike(term)) | (Job.company.ilike(term)))

    total = q.count()
    rows  = q.order_by(desc(Job.created_at)).offset((page - 1) * page_size).limit(page_size).all()

    return {
        "jobs": [
            {
                "id": j.id,
                "title": j.title,
                "company": j.company,
                "platform": j.platform,
                "location": j.location,
                "status": j.status,
                "match_score": j.match_score,
                "error": (j.error or "")[:300],
                "created_at": j.created_at,
                "updated_at": j.updated_at,
                "user_email": email,
                "user_id": j.user_id,
            }
            for j, email in rows
        ],
        "total": total,
        "page": page,
        "pages": max(1, -(-total // page_size)),
    }


async def _run_pipeline_for_job(job_id: str):
    """Re-run the full score→tailor→email pipeline using data already stored in the job row."""
    from database import SessionLocal
    from routers.search import _pipeline_job
    db = SessionLocal()
    try:
        job = db.query(Job).filter(Job.id == job_id).first()
        if not job:
            return
        job_dict = {
            "title": job.title or "",
            "company": job.company or "",
            "url": job.url or "",
            "description": job.job_description or "",
        }
        resume         = job.resume or ""
        recipient      = job.recipient_email or ""
        applicant_name = job.applicant_name or "Applicant"
        user_id        = job.user_id
    finally:
        db.close()

    await _pipeline_job(job_id, resume, job_dict, recipient, applicant_name, user_id)


@router.post("/jobs/rescore-all")
async def admin_rescore_all(
    background_tasks: BackgroundTasks,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """
    Reset every completed/errored job to queued and re-run the full pipeline.
    Useful after fixing resume extraction or scoring logic.
    """
    target = ["scored", "below_threshold", "emailed", "error"]
    jobs = db.query(Job).filter(Job.status.in_(target)).all()
    count = len(jobs)
    for job in jobs:
        job.status = "queued"
        job.error  = None
    db.commit()

    for job in jobs:
        background_tasks.add_task(_run_pipeline_for_job, job.id)

    return {"queued": count}


@router.post("/jobs/{job_id}/retry")
async def admin_retry_job(
    job_id: str,
    background_tasks: BackgroundTasks,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(404, "Job not found")
    job.status = "queued"
    job.error  = None
    db.commit()
    background_tasks.add_task(_run_pipeline_for_job, job.id)
    return {"message": "Requeued"}


@router.delete("/jobs/{job_id}")
def admin_delete_job(
    job_id: str,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(404, "Job not found")
    db.delete(job)
    db.commit()
    return {"message": "Deleted"}


# ── System health ─────────────────────────────────────────────────────────────

@router.get("/system")
def system_health(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    from config import (
        SMTP_EMAIL, SMTP_PASSWORD, GOOGLE_API_KEY, GEMINI_MODEL,
        FRONTEND_URL, COOKIE_SECURE, SECRET_KEY,
    )
    from services.scheduler import scheduler

    db_size = 0
    try:
        db_size = os.path.getsize("./workfinderx.db")
    except Exception:
        pass

    # Count stuck in-progress jobs (>30 min old)
    thirty_ago = (datetime.utcnow() - timedelta(minutes=30)).isoformat()
    in_progress = ("queued", "scoring", "tailoring", "emailing")
    stuck = (
        db.query(func.count(Job.id))
        .filter(Job.status.in_(in_progress), Job.updated_at < thirty_ago)
        .scalar() or 0
    )

    # Scheduler jobs
    try:
        scheduled_jobs = [
            {"id": j.id, "next_run": str(j.next_run_time)}
            for j in scheduler.get_jobs()
        ]
        scheduler_running = True
    except Exception:
        scheduled_jobs = []
        scheduler_running = False

    return {
        "smtp": {
            "configured": bool(SMTP_EMAIL and SMTP_PASSWORD),
            "host": os.getenv("SMTP_HOST", "—"),
            "port": os.getenv("SMTP_PORT", "—"),
            "from_email": os.getenv("SMTP_FROM_EMAIL", SMTP_EMAIL or "—"),
        },
        "gemini": {
            "configured": bool(GOOGLE_API_KEY),
            "model": GEMINI_MODEL,
            "key_preview": (GOOGLE_API_KEY[:6] + "…") if GOOGLE_API_KEY else None,
        },
        "scheduler": {
            "running": scheduler_running,
            "jobs": scheduled_jobs,
            "stuck_jobs": stuck,
        },
        "security": {
            "cookie_secure": COOKIE_SECURE,
            "frontend_url": FRONTEND_URL,
            "secret_key_default": SECRET_KEY == "change-me-in-production-please",
        },
        "database": {
            "size_bytes": db_size,
            "counts": {
                "users":         db.query(func.count(User.id)).scalar() or 0,
                "jobs":          db.query(func.count(Job.id)).scalar() or 0,
                "resumes":       db.query(func.count(Resume.id)).scalar() or 0,
                "activity_logs": db.query(func.count(ActivityLog.id)).scalar() or 0,
                "saved_jobs":    db.query(func.count(SavedJob.id)).scalar() or 0,
            },
        },
    }


# ── Activity feed (all users) ─────────────────────────────────────────────────

@router.get("/activity")
def admin_activity(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    event_type: Optional[str] = None,
    search: Optional[str] = None,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    q = (
        db.query(ActivityLog, User.email, User.id)
        .join(User, ActivityLog.user_id == User.id)
    )
    if event_type:
        q = q.filter(ActivityLog.event_type.ilike(f"%{event_type}%"))
    if search:
        term = f"%{search}%"
        q = q.filter(
            ActivityLog.message.ilike(term) | User.email.ilike(term)
        )
    total = q.count()
    rows = q.order_by(desc(ActivityLog.created_at)).offset((page - 1) * page_size).limit(page_size).all()
    return {
        "logs": [
            {
                "id": log.id,
                "event_type": log.event_type,
                "message": log.message,
                "job_id": log.job_id,
                "created_at": str(log.created_at),
                "user_email": email,
                "user_id": uid,
            }
            for log, email, uid in rows
        ],
        "total": total,
        "page": page,
        "pages": max(1, -(-total // page_size)),
    }


@router.delete("/activity")
def admin_clear_activity(
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    db.query(ActivityLog).delete()
    db.commit()
    return {"deleted": True}
