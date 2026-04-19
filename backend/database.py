"""
SQLite database setup via SQLAlchemy.
Creates workfinderx.db in the backend directory on first run.
"""
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

import os

# In Docker (Coolify), the DB lives in the named volume mounted at /app/data.
# Locally it falls back to ./workfinderx.db so local dev is unchanged.
_DB_PATH = os.getenv("DB_PATH", "./workfinderx.db")
DATABASE_URL = f"sqlite:///{_DB_PATH}"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},  # needed for SQLite + FastAPI
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    """FastAPI dependency — yields a DB session and closes it after the request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Create all tables. Called at app startup."""
    from models import User, Job, SavedJob, UserSchedule  # noqa: F401 — registers models
    Base.metadata.create_all(bind=engine)


def migrate_new_columns():
    """Add any columns that are missing from existing tables (SQLite ALTER TABLE)."""
    import sqlite3, logging
    log = logging.getLogger(__name__)
    conn = sqlite3.connect(_DB_PATH)
    cur = conn.cursor()

    # ── jobs table ────────────────────────────────────────────────────────────
    cur.execute("PRAGMA table_info(jobs)")
    existing_jobs = {row[1] for row in cur.fetchall()}
    for col_name, col_type in [
        ("notes",      "TEXT"),
        ("salary_min", "TEXT"),
        ("salary_max", "TEXT"),
        ("job_type",   "TEXT"),
    ]:
        if col_name not in existing_jobs:
            cur.execute(f"ALTER TABLE jobs ADD COLUMN {col_name} {col_type}")
            log.info("DB migration: added jobs.%s", col_name)

    # ── users table ───────────────────────────────────────────────────────────
    cur.execute("PRAGMA table_info(users)")
    existing_users = {row[1] for row in cur.fetchall()}
    for col_name, col_type in [
        ("failed_login_attempts", "INTEGER DEFAULT 0"),
        ("locked_until",          "TEXT"),
        ("is_verified",           "INTEGER DEFAULT 0 NOT NULL"),
        ("verification_token",    "TEXT"),
        ("is_admin",              "INTEGER DEFAULT 0 NOT NULL"),
    ]:
        if col_name not in existing_users:
            cur.execute(f"ALTER TABLE users ADD COLUMN {col_name} {col_type}")
            log.info("DB migration: added users.%s", col_name)

    conn.commit()
    conn.close()
