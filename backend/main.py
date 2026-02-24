from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from config import FRONTEND_URL
from routers import score, tailor, email_router, jobs, pipeline, config_router, search

app = FastAPI(
    title="ResumeFlow AI",
    description="Automated job-discovery, matching & document-tailoring API",
    version="2.0.0",
)

# ── CORS ──────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    # "null" allows file:// origin (browser opens index.html directly)
    allow_origins=[FRONTEND_URL, "http://localhost:5173", "http://localhost:3000", "null", "*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(score.router,         prefix="/api", tags=["Scoring"])
app.include_router(tailor.router,        prefix="/api", tags=["Tailoring"])
app.include_router(email_router.router,  prefix="/api", tags=["Email"])
app.include_router(jobs.router,          prefix="/api", tags=["Jobs"])
app.include_router(pipeline.router,      prefix="/api", tags=["Manual Pipeline"])
app.include_router(search.router,        prefix="/api", tags=["Job Search"])
app.include_router(config_router.router, prefix="/api", tags=["Config"])


@app.get("/health", tags=["Health"])
async def health():
    return {"status": "ok", "service": "ResumeFlow AI", "version": "2.0.0"}


@app.get("/", tags=["Health"])
async def root():
    return {
        "message": "ResumeFlow AI v2 is running 🚀 — Job search + Gemini tailoring",
        "docs": "/docs",
        "health": "/health",
    }
