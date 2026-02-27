from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from config import FRONTEND_URL
from database import init_db
from services.scheduler import scheduler, load_all_schedules
from routers import score, tailor, email_router, jobs, pipeline, config_router, search
from routers import auth, saved_jobs, schedule as schedule_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    init_db()
    load_all_schedules()
    scheduler.start()
    yield
    # Shutdown
    scheduler.shutdown(wait=False)


app = FastAPI(
    title="ResumeFlow AI",
    description="Automated job-discovery, matching & document-tailoring API",
    version="3.0.0",
    lifespan=lifespan,
)

# ── CORS ──────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_URL, "http://localhost:5173", "http://localhost:3000", "null", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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


@app.get("/health", tags=["Health"])
async def health():
    return {"status": "ok", "service": "ResumeFlow AI", "version": "3.0.0"}


@app.get("/", tags=["Health"])
async def root():
    return {"message": "ResumeFlow AI v3 is running 🚀", "docs": "/docs"}
