"""
Auth router: register, login, /me, forgot-password, reset-password
"""
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
import hashlib, secrets

from database import get_db
from limiter import limiter
from config import ACCESS_TOKEN_EXPIRE_MINUTES, COOKIE_SECURE
from services.auth_service import (
    create_user, authenticate_user, create_access_token, get_current_user,
    hash_password, _hash_token,
)
from models import User


def _set_auth_cookie(response: Response, token: str) -> None:
    """Attach the JWT as an httpOnly cookie."""
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        secure=COOKIE_SECURE,       # True in production (HTTPS), False in local dev
        samesite="lax",             # Lax allows top-level navigations; compatible with SPA
        max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        path="/",
    )


def _hash_reset_token(token: str) -> str:
    """One-way hash for reset codes stored in DB — prevents plaintext leakage."""
    return hashlib.sha256(token.encode()).hexdigest()

router = APIRouter(prefix="/auth", tags=["Auth"])


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    name: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    user_id: str
    name: str
    email: str


class UserResponse(BaseModel):
    id: str
    email: str
    name: str
    match_threshold: int
    is_verified: bool
    is_admin: bool


@router.post("/register", response_model=TokenResponse, status_code=201)
@limiter.limit("5/minute")
def register(
    request: Request,
    payload: RegisterRequest,
    response: Response,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    user, raw_token = create_user(db, email=payload.email, name=payload.name, password=payload.password)
    token = create_access_token({"sub": user.id})
    _set_auth_cookie(response, token)
    background_tasks.add_task(_send_verification_email, user.email, user.name, raw_token)
    return TokenResponse(user_id=user.id, name=user.name, email=user.email)


@router.post("/login", response_model=TokenResponse)
@limiter.limit("10/minute")
def login(request: Request, payload: LoginRequest, response: Response, db: Session = Depends(get_db)):
    user = authenticate_user(db, email=payload.email, password=payload.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )
    token = create_access_token({"sub": user.id})
    _set_auth_cookie(response, token)
    return TokenResponse(user_id=user.id, name=user.name, email=user.email)


@router.post("/logout")
def logout(response: Response):
    """Clear the auth cookie."""
    response.delete_cookie(key="access_token", path="/")
    return {"message": "Logged out"}


@router.get("/me", response_model=UserResponse)
def me(current_user: User = Depends(get_current_user)):
    return UserResponse(
        id=current_user.id,
        email=current_user.email,
        name=current_user.name,
        match_threshold=current_user.match_threshold,
        is_verified=bool(current_user.is_verified),
        is_admin=bool(current_user.is_admin),
    )


# ── Email Verification ────────────────────────────────────────────────────────

def _send_verification_email(recipient_email: str, name: str, raw_token: str):
    """Background task: send the email-verification link via SMTP."""
    import smtplib, ssl, logging, os
    from email.mime.text import MIMEText
    from config import SMTP_HOST, SMTP_PORT, SMTP_EMAIL, SMTP_PASSWORD, FRONTEND_URL

    from_email = os.getenv("SMTP_FROM_EMAIL", SMTP_EMAIL)
    logger = logging.getLogger(__name__)

    verify_url = f"{FRONTEND_URL}/verify?token={raw_token}"
    html = f"""
    <div style="font-family:Inter,sans-serif;background:#0a0a0a;color:#e5e2e1;padding:40px;border-radius:12px;max-width:480px;margin:0 auto">
      <h2 style="margin:0 0 16px;font-size:20px;color:white">Verify your email</h2>
      <p style="color:#999;font-size:14px;margin:0 0 24px">Hi {name}, click the button below to verify your WorkfinderX account. This link expires in 24 hours.</p>
      <a href="{verify_url}"
         style="display:inline-block;background:white;color:black;font-weight:700;font-size:14px;
                padding:14px 28px;border-radius:10px;text-decoration:none;margin-bottom:24px">
        Verify Email
      </a>
      <p style="color:#555;font-size:11px;margin:0">
        Or copy this link: <span style="word-break:break-all;color:#888">{verify_url}</span>
      </p>
    </div>
    """
    msg = MIMEText(html, "html")
    msg["Subject"] = "WorkfinderX \u2014 Verify your email"
    msg["From"]    = f"WorkfinderX <{from_email}>"
    msg["To"]      = recipient_email

    try:
        timeout = 10
        if int(SMTP_PORT) == 465:
            ctx = ssl.create_default_context()
            with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, context=ctx, timeout=timeout) as s:
                s.login(SMTP_EMAIL, SMTP_PASSWORD)
                s.sendmail(from_email, recipient_email, msg.as_string())
        else:
            with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=timeout) as s:
                s.ehlo(); s.starttls()
                s.login(SMTP_EMAIL, SMTP_PASSWORD)
                s.sendmail(from_email, recipient_email, msg.as_string())
        logger.info("Verification email sent to %s", recipient_email)
    except Exception as e:
        logger.error("Failed to send verification email to %s: %s", recipient_email, e)


@router.get("/verify-email")
def verify_email(token: str, db: Session = Depends(get_db)):
    """Verify a user's email address using the token from the link."""
    hashed = _hash_token(token)
    user = db.query(User).filter(User.verification_token == hashed).first()
    if not user:
        raise HTTPException(status_code=400, detail="Invalid or expired verification link")
    user.is_verified = True
    user.verification_token = None
    db.commit()
    return {"message": "Email verified! You're all set."}


@router.post("/resend-verification")
@limiter.limit("3/10minute")
def resend_verification(
    request: Request,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Resend the verification email for the logged-in user."""
    if current_user.is_verified:
        return {"message": "Email is already verified"}
    from services.auth_service import generate_verification_token
    raw_token, hashed_token = generate_verification_token()
    current_user.verification_token = hashed_token
    db.commit()
    background_tasks.add_task(_send_verification_email, current_user.email, current_user.name, raw_token)
    return {"message": "Verification email sent"}


# ── Password Reset ───────────────────────────────────────────────────────────

class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    email: EmailStr
    code: str
    new_password: str


@router.post("/forgot-password")
@limiter.limit("3/10minute")
def forgot_password(
    request: Request,
    payload: ForgotPasswordRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """Send a 6-digit reset code to the user's email."""
    user = db.query(User).filter(User.email == payload.email).first()
    if not user:
        # Don't reveal whether email exists
        return {"message": "If an account exists for that email, a reset code has been sent."}

    code = str(secrets.randbelow(900000) + 100000)  # 6-digit code
    user.password_reset_token = _hash_reset_token(code)  # store hash, send raw
    user.reset_token_expiry = datetime.utcnow() + timedelta(minutes=15)
    db.commit()

    # Send in background so endpoint returns immediately
    background_tasks.add_task(_send_reset_email, user.email, code)

    return {"message": "If an account exists for that email, a reset code has been sent."}


def _send_reset_email(recipient_email: str, code: str):
    """Background task: send the 6-digit reset code via SMTP."""
    import smtplib, ssl, logging
    from email.mime.text import MIMEText
    from config import SMTP_HOST, SMTP_PORT, SMTP_EMAIL, SMTP_PASSWORD
    # Use SMTP_FROM_EMAIL if defined, otherwise fall back to SMTP_EMAIL
    import os
    from_email = os.getenv("SMTP_FROM_EMAIL", SMTP_EMAIL)

    logger = logging.getLogger(__name__)

    html = f"""
    <div style="font-family:Inter,sans-serif;background:#0a0a0a;color:#e5e2e1;padding:40px;border-radius:12px;max-width:480px;margin:0 auto">
      <h2 style="margin:0 0 16px;font-size:20px;color:white">Password Reset</h2>
      <p style="color:#999;font-size:14px;margin:0 0 24px">Use this code to reset your WorkfinderX password. It expires in 15 minutes.</p>
      <div style="background:#1a1a1a;border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:24px;text-align:center;margin-bottom:24px">
        <span style="font-size:32px;font-weight:800;letter-spacing:6px;color:white">{code}</span>
      </div>
      <p style="color:#555;font-size:11px;margin:0">If you didn't request this, ignore this email.</p>
    </div>
    """
    msg = MIMEText(html, "html")
    msg["Subject"] = f"WorkfinderX \u2014 Password Reset Code: {code}"
    msg["From"] = f"WorkfinderX <{from_email}>"
    msg["To"] = recipient_email

    try:
        timeout = 10
        if int(SMTP_PORT) == 465:
            ctx = ssl.create_default_context()
            with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, context=ctx, timeout=timeout) as s:
                s.login(SMTP_EMAIL, SMTP_PASSWORD)
                s.sendmail(from_email, recipient_email, msg.as_string())
        else:
            with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=timeout) as s:
                s.ehlo()
                s.starttls()
                s.login(SMTP_EMAIL, SMTP_PASSWORD)
                s.sendmail(from_email, recipient_email, msg.as_string())
        logger.info("Password reset email sent to %s", recipient_email)
    except Exception as e:
        logger.error("Failed to send reset email to %s: %s", recipient_email, e)


@router.post("/reset-password")
def reset_password(payload: ResetPasswordRequest, db: Session = Depends(get_db)):
    """Validate the 6-digit code and set a new password."""
    user = db.query(User).filter(User.email == payload.email).first()
    if not user:
        raise HTTPException(status_code=400, detail="Invalid email or code")

    if not user.password_reset_token or user.password_reset_token != _hash_reset_token(payload.code):
        raise HTTPException(status_code=400, detail="Invalid or expired reset code")

    if user.reset_token_expiry and datetime.utcnow() > user.reset_token_expiry:
        raise HTTPException(status_code=400, detail="Reset code has expired")

    if len(payload.new_password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    user.hashed_password = hash_password(payload.new_password)
    user.password_reset_token = None
    user.reset_token_expiry = None
    db.commit()

    return {"message": "Password updated successfully. You can now log in."}

