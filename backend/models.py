"""
SQLAlchemy ORM models for ResumeFlow AI.
"""
from sqlalchemy import (
    Column, String, Integer, Boolean, Text, ForeignKey, DateTime, JSON
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base


class User(Base):
    __tablename__ = "users"

    id           = Column(String, primary_key=True)
    email        = Column(String, unique=True, nullable=False, index=True)
    name         = Column(String, nullable=False)
    hashed_password = Column(String, nullable=False)
    match_threshold = Column(Integer, default=75)
    created_at   = Column(DateTime(timezone=True), server_default=func.now())

    jobs         = relationship("Job",          back_populates="user", cascade="all, delete-orphan")
    saved_jobs   = relationship("SavedJob",     back_populates="user", cascade="all, delete-orphan")
    schedule     = relationship("UserSchedule", back_populates="user", uselist=False, cascade="all, delete-orphan")


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
    created_at         = Column(String, default="")
    updated_at         = Column(String, default="")

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
