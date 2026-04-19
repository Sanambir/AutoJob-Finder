"""
SQLAlchemy ORM models for WorkfinderX.
"""
from sqlalchemy import (
    Column, String, Integer, Boolean, Text, ForeignKey, DateTime, JSON, Float
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid
from database import Base


class User(Base):
    __tablename__ = "users"

    id           = Column(String, primary_key=True)
    email        = Column(String, unique=True, nullable=False, index=True)
    name         = Column(String, nullable=False)
    hashed_password = Column(String, nullable=False)
    match_threshold = Column(Integer, default=75)
    resume_text     = Column(Text, nullable=True)   # active resume text (kept for compat)
    active_resume_id = Column(String, nullable=True)  # FK to Resume.id (set after table created)
    password_reset_token  = Column(String, nullable=True)
    reset_token_expiry    = Column(DateTime(timezone=True), nullable=True)
    failed_login_attempts = Column(Integer, default=0, nullable=False)
    locked_until          = Column(String, nullable=True)   # ISO UTC datetime string
    is_verified           = Column(Boolean, default=False, nullable=False)
    verification_token    = Column(String, nullable=True)   # SHA-256 hash of raw token
    is_admin              = Column(Boolean, default=False, nullable=False)
    created_at   = Column(DateTime(timezone=True), server_default=func.now())

    jobs         = relationship("Job",          back_populates="user", cascade="all, delete-orphan")
    saved_jobs   = relationship("SavedJob",     back_populates="user", cascade="all, delete-orphan")
    schedule     = relationship("UserSchedule", back_populates="user", uselist=False, cascade="all, delete-orphan")
    resumes      = relationship("Resume",       back_populates="user", cascade="all, delete-orphan", foreign_keys="Resume.user_id")
    activity_logs = relationship("ActivityLog", back_populates="user", cascade="all, delete-orphan")


class Resume(Base):
    __tablename__ = "resumes"

    id          = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id     = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    name        = Column(String, nullable=False, default="My Resume")
    resume_text = Column(Text, nullable=False)
    created_at  = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="resumes", foreign_keys=[user_id])


class Job(Base):
    __tablename__ = "jobs"

    id                 = Column(String, primary_key=True)
    user_id            = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    title              = Column(String, default="")
    company            = Column(String, default="")
    url                = Column(String, default="")
    platform           = Column(String, default="")
    location           = Column(String, default="")
    date_posted        = Column(String, default="")
    resume             = Column(Text, default="")
    job_description    = Column(Text, default="")
    applicant_name     = Column(String, default="Applicant")
    recipient_email    = Column(String, default="")
    status             = Column(String, default="pending")
    match_score        = Column(Integer, nullable=True)
    reasoning          = Column(Text, nullable=True)
    missing_skills     = Column(JSON, default=list)
    resume_suggestions = Column(Text, nullable=True)
    cover_letter       = Column(Text, nullable=True)
    error              = Column(Text, nullable=True)
    kanban_stage       = Column(String, default="discovered")  # discovered|applied|interview|offer|rejected
    notes              = Column(Text, nullable=True)
    salary_min         = Column(String, nullable=True)
    salary_max         = Column(String, nullable=True)
    job_type           = Column(String, nullable=True)
    created_at         = Column(String, nullable=True)
    updated_at         = Column(String, nullable=True)

    user        = relationship("User",     back_populates="jobs")
    saved_by    = relationship("SavedJob", back_populates="job", cascade="all, delete-orphan")


class SavedJob(Base):
    __tablename__ = "saved_jobs"

    id      = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    job_id  = Column(String, ForeignKey("jobs.id"),  nullable=False)

    user = relationship("User", back_populates="saved_jobs")
    job  = relationship("Job",  back_populates="saved_by")


class UserSchedule(Base):
    __tablename__ = "user_schedules"

    id               = Column(Integer, primary_key=True, autoincrement=True)
    user_id          = Column(String, ForeignKey("users.id"), unique=True, nullable=False)
    keywords         = Column(String, default="")
    location         = Column(String, default="Remote")
    platforms        = Column(JSON,   default=lambda: ["indeed", "linkedin"])
    results_per_site = Column(Integer, default=10)
    hours_old        = Column(Integer, default=72)
    auto_pipeline    = Column(Boolean, default=True)
    run_time         = Column(String, default="09:00")   # HH:MM local time
    enabled          = Column(Boolean, default=False)
    last_run         = Column(String, nullable=True)

    user = relationship("User", back_populates="schedule")


class ActivityLog(Base):
    __tablename__ = "activity_logs"

    id         = Column(Integer, primary_key=True, autoincrement=True)
    user_id    = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    event_type = Column(String, nullable=False)   # search, scored, emailed, error, login, etc.
    message    = Column(String, nullable=False)
    job_id     = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="activity_logs")

