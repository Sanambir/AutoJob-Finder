"""
Auth helpers: password hashing, JWT creation/decoding, and the FastAPI dependency
that resolves the current user from a Bearer token.
"""
import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
import bcrypt as _bcrypt
from sqlalchemy.orm import Session

from database import get_db
from models import User
from config import SECRET_KEY, ACCESS_TOKEN_EXPIRE_MINUTES

ALGORITHM = "HS256"
bearer_scheme = HTTPBearer(auto_error=False)


# ── Password helpers ──────────────────────────────────────────────────────────

def hash_password(password: str) -> str:
    return _bcrypt.hashpw(password[:72].encode(), _bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return _bcrypt.checkpw(plain[:72].encode(), hashed.encode())
    except Exception:
        return False


# ── JWT helpers ───────────────────────────────────────────────────────────────

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    payload = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    payload["exp"] = expire
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        return None


# ── FastAPI dependency ────────────────────────────────────────────────────────

def get_current_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    """Resolve the current user from the httpOnly cookie (preferred) or Bearer JWT (fallback).
    Raises 401 if missing/invalid."""
    # Cookie takes priority; Bearer header kept as fallback for API clients / tests
    token = request.cookies.get("access_token")
    if not token and credentials:
        token = credentials.credentials
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    payload = decode_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user_id = payload.get("sub")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user


def _hash_token(raw: str) -> str:
    """One-way SHA-256 hash — store the hash, send the raw token."""
    return hashlib.sha256(raw.encode()).hexdigest()


def generate_verification_token() -> tuple[str, str]:
    """Return (raw_token, hashed_token). Send raw to user; store hash in DB."""
    raw = secrets.token_hex(32)
    return raw, _hash_token(raw)


def create_user(db: Session, email: str, name: str, password: str) -> tuple["User", str]:
    """Create and persist a new user. Returns (user, raw_verification_token).
    Raises 409 if email already exists."""
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=409, detail="Email already registered")
    raw_token, hashed_token = generate_verification_token()
    user = User(
        id=str(uuid.uuid4()),
        email=email,
        name=name,
        hashed_password=hash_password(password),
        is_verified=False,
        verification_token=hashed_token,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user, raw_token


_MAX_ATTEMPTS   = 5
_LOCKOUT_MINUTES = 15


def authenticate_user(db: Session, email: str, password: str) -> Optional[User]:
    """
    Return the user if credentials are valid.
    Raises HTTP 429 if the account is locked.
    Returns None on wrong password (increments attempt counter, locks at _MAX_ATTEMPTS).
    """
    from fastapi import HTTPException
    user = db.query(User).filter(User.email == email).first()
    if not user:
        return None

    # ── Check lockout ─────────────────────────────────────────────────────────
    if user.locked_until:
        locked_until_dt = datetime.fromisoformat(user.locked_until)
        if datetime.utcnow() < locked_until_dt:
            remaining = max(1, int((locked_until_dt - datetime.utcnow()).total_seconds() / 60))
            raise HTTPException(
                status_code=429,
                detail=f"Account locked after too many failed attempts. "
                       f"Try again in {remaining} minute(s).",
            )
        # Lock expired — reset counters
        user.locked_until = None
        user.failed_login_attempts = 0

    # ── Verify password ───────────────────────────────────────────────────────
    if not verify_password(password, user.hashed_password):
        user.failed_login_attempts = (user.failed_login_attempts or 0) + 1
        if user.failed_login_attempts >= _MAX_ATTEMPTS:
            user.locked_until = (
                datetime.utcnow() + timedelta(minutes=_LOCKOUT_MINUTES)
            ).isoformat()
            db.commit()
            raise HTTPException(
                status_code=429,
                detail=f"Account locked after {_MAX_ATTEMPTS} failed attempts. "
                       f"Try again in {_LOCKOUT_MINUTES} minutes.",
            )
        db.commit()
        return None

    # ── Success — reset counters ──────────────────────────────────────────────
    user.failed_login_attempts = 0
    user.locked_until = None
    db.commit()
    return user
