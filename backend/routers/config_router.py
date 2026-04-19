"""
Config router — per-user match threshold stored in DB.
"""
import os
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from models import User
from services.auth_service import get_current_user

router = APIRouter()


class ConfigResponse(BaseModel):
    match_threshold: int
    smtp_configured: bool


class ConfigUpdate(BaseModel):
    match_threshold: int


@router.get("/config", response_model=ConfigResponse)
def get_config(current_user: User = Depends(get_current_user)):
    smtp_configured = bool(os.getenv("SMTP_EMAIL") and os.getenv("SMTP_PASSWORD"))
    return ConfigResponse(
        match_threshold=current_user.match_threshold,
        smtp_configured=smtp_configured,
    )


@router.patch("/config", response_model=ConfigResponse)
def update_config(
    payload: ConfigUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    value = max(0, min(100, payload.match_threshold))
    current_user.match_threshold = value
    db.commit()
    smtp_configured = bool(os.getenv("SMTP_EMAIL") and os.getenv("SMTP_PASSWORD"))
    return ConfigResponse(match_threshold=value, smtp_configured=smtp_configured)
