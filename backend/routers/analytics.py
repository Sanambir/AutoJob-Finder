"""
Analytics router — rich stats for the analytics dashboard.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from datetime import datetime, timedelta

from database import get_db
from models import Job
from services.auth_service import get_current_user
from models import User

router = APIRouter()


@router.get("/analytics")
def get_analytics(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    jobs = db.query(Job).filter(Job.user_id == current_user.id).all()

    if not jobs:
        return {
            "total": 0,
            "score_distribution": [],
            "stage_funnel": [],
            "status_breakdown": {},
            "platform_breakdown": [],
            "weekly_trend": [],
        }

    # ── Score distribution ────────────────────────────────────────────────────
    buckets = {"0-20": 0, "21-40": 0, "41-60": 0, "61-80": 0, "81-100": 0}
    for j in jobs:
        if j.match_score is not None:
            s = j.match_score
            if s <= 20:   buckets["0-20"]   += 1
            elif s <= 40: buckets["21-40"]  += 1
            elif s <= 60: buckets["41-60"]  += 1
            elif s <= 80: buckets["61-80"]  += 1
            else:         buckets["81-100"] += 1
    score_distribution = [{"range": k, "count": v} for k, v in buckets.items()]

    # ── Stage funnel ──────────────────────────────────────────────────────────
    stage_order = ["discovered", "applied", "interview", "offer", "rejected"]
    stage_counts = {s: 0 for s in stage_order}
    for j in jobs:
        stage = j.kanban_stage or "discovered"
        if stage in stage_counts:
            stage_counts[stage] += 1
    stage_funnel = [{"stage": s, "count": stage_counts[s]} for s in stage_order]

    # ── Status breakdown ──────────────────────────────────────────────────────
    status_breakdown: dict = {}
    for j in jobs:
        status_breakdown[j.status] = status_breakdown.get(j.status, 0) + 1

    # ── Platform breakdown ────────────────────────────────────────────────────
    platform_counts: dict = {}
    for j in jobs:
        p = j.platform or "unknown"
        platform_counts[p] = platform_counts.get(p, 0) + 1
    platform_breakdown = [
        {"platform": k, "count": v}
        for k, v in sorted(platform_counts.items(), key=lambda x: -x[1])
    ]

    # ── Weekly trend (last 8 weeks) ───────────────────────────────────────────
    now = datetime.utcnow()
    weekly: dict = {}
    for i in range(7, -1, -1):
        week_start = now - timedelta(weeks=i + 1)
        week_end   = now - timedelta(weeks=i)
        label = week_start.strftime("%-m/%-d") if hasattr(week_start, 'strftime') else week_start.strftime("%m/%d")
        weekly[label] = 0
        for j in jobs:
            try:
                created = datetime.fromisoformat(j.created_at.rstrip("Z")) if j.created_at else None
            except (ValueError, AttributeError):
                created = None
            if created and week_start <= created < week_end:
                weekly[label] += 1
    weekly_trend = [{"week": k, "count": v} for k, v in weekly.items()]

    return {
        "total": len(jobs),
        "score_distribution": score_distribution,
        "stage_funnel": stage_funnel,
        "status_breakdown": status_breakdown,
        "platform_breakdown": platform_breakdown,
        "weekly_trend": weekly_trend,
    }
