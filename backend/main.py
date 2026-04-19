from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from limiter import limiter
from config import FRONTEND_URL
from database import init_db, migrate_new_columns
from services.scheduler import scheduler, load_all_schedules
from routers import score, tailor, email_router, jobs, pipeline, config_router, search
from routers import auth, saved_jobs, schedule as schedule_router
from routers import user_router, activity as activity_router
from routers import admin as admin_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    init_db()
    migrate_new_columns()
    _reset_orphaned_jobs()
    _bootstrap_admin()
    load_all_schedules()
    scheduler.start()
    yield
    # Shutdown
    scheduler.shutdown(wait=False)


def _bootstrap_admin():
    """Ensure ADMIN_EMAIL user has is_admin=True on every startup."""
    from config import ADMIN_EMAIL
    if not ADMIN_EMAIL:
        return
    from database import SessionLocal
    from models import User
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == ADMIN_EMAIL).first()
        if user and not user.is_admin:
            user.is_admin = True
            db.commit()
            import logging
            logging.getLogger(__name__).info("Admin bootstrapped: %s", ADMIN_EMAIL)
    finally:
        db.close()


def _reset_orphaned_jobs():
    """Reset any jobs stuck in active states from a previous server run."""
    from database import SessionLocal
    from models import Job
    from datetime import datetime
    IN_PROGRESS = ("queued", "scoring", "tailoring", "emailing")
    db = SessionLocal()
    try:
        stuck = db.query(Job).filter(Job.status.in_(IN_PROGRESS)).all()
        for j in stuck:
            j.status = "error"
            j.error = "Server restarted — please run a new search to re-process this job."
            j.updated_at = datetime.utcnow().isoformat() + "Z"
        if stuck:
            db.commit()
            import logging
            logging.getLogger(__name__).warning(
                "Reset %d orphaned in-progress jobs to error on startup.", len(stuck)
            )
    finally:
        db.close()


app = FastAPI(
    title="WorkfinderX",
    description="Automated job-discovery, matching & document-tailoring API",
    version="3.0.0",
    lifespan=lifespan,
)

# ── Rate limiter ───────────────────────────────────────────────────────────────
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# ── CORS ──────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_URL, "http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Security headers ───────────────────────────────────────────────────────────
@app.middleware("http")
async def add_security_headers(request: Request, call_next) -> Response:
    response = await call_next(request)
    response.headers["X-Content-Type-Options"]  = "nosniff"
    response.headers["X-Frame-Options"]          = "DENY"
    response.headers["X-XSS-Protection"]         = "1; mode=block"
    response.headers["Referrer-Policy"]           = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"]        = "camera=(), microphone=(), geolocation=()"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(auth.router,              prefix="/api", tags=["Auth"])
app.include_router(score.router,             prefix="/api", tags=["Scoring"])
app.include_router(tailor.router,            prefix="/api", tags=["Tailoring"])
app.include_router(email_router.router,      prefix="/api", tags=["Email"])
app.include_router(jobs.router,              prefix="/api", tags=["Jobs"])
app.include_router(pipeline.router,          prefix="/api", tags=["Manual Pipeline"])
app.include_router(search.router,            prefix="/api", tags=["Job Search"])
app.include_router(config_router.router,     prefix="/api", tags=["Config"])
app.include_router(saved_jobs.router,        prefix="/api", tags=["Saved Jobs"])
app.include_router(schedule_router.router,   prefix="/api", tags=["Schedule"])
app.include_router(user_router.router,       prefix="/api", tags=["User Profile"])
app.include_router(activity_router.router,   prefix="/api", tags=["Activity"])
app.include_router(admin_router.router,      prefix="/api", tags=["Admin"])


@app.get("/health", tags=["Health"])
async def health():
    return {"status": "ok", "service": "WorkfinderX", "version": "3.0.0"}


@app.get("/", tags=["Health"])
async def root():
    return {"message": "WorkfinderX v3 is running 🚀", "docs": "/docs"}
