"""
User profile router:
  GET  /api/user/me              — return profile + stored resume text
  POST /api/user/resume          — upload PDF/TXT/DOCX, store as new Resume row, set active
  GET  /api/user/resume          — return active resume text
  GET  /api/user/resumes         — list all saved resumes
  PATCH /api/user/resume/active  — set active resume by ID
  DELETE /api/user/resume/{id}   — delete a specific resume
"""
import uuid
import io
from fastapi import APIRouter, BackgroundTasks, Depends, UploadFile, File, HTTPException, Form
from pydantic import BaseModel, EmailStr
from typing import Optional, List
from sqlalchemy.orm import Session

from database import get_db
from models import User, Resume
from services.auth_service import get_current_user, verify_password, hash_password

router = APIRouter(prefix="/user", tags=["User Profile"])


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class ProfileResponse(BaseModel):
    id: str
    email: str
    name: str
    match_threshold: int
    has_resume: bool
    is_verified: bool
    created_at: Optional[str]


class UpdateProfileBody(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None


class ChangePasswordBody(BaseModel):
    current_password: str
    new_password: str


class DeleteAccountBody(BaseModel):
    password: str


class ResumeResponse(BaseModel):
    resume_text: Optional[str]


class ResumeSummary(BaseModel):
    id: str
    name: str
    created_at: Optional[str]
    preview: str   # first 120 chars of text
    is_active: bool


class SetActiveBody(BaseModel):
    resume_id: str


# ── Helpers ───────────────────────────────────────────────────────────────────

def _extract_pdf(data: bytes) -> str:
    """
    Try pypdf first (handles most modern PDFs and multi-column layouts well),
    fall back to pdfminer if pypdf yields little text.
    """
    text = ""

    # Primary: pypdf
    try:
        import pypdf
        reader = pypdf.PdfReader(io.BytesIO(data))
        pages = []
        for page in reader.pages:
            pages.append(page.extract_text() or "")
        text = "\n".join(pages)
    except Exception:
        text = ""

    # Fallback: pdfminer (better for some complex layouts)
    if len(text.strip()) < 100:
        try:
            from pdfminer.high_level import extract_text as pdf_extract_text
            text = pdf_extract_text(io.BytesIO(data)) or ""
        except Exception:
            pass

    return text


def _normalize_text(text: str) -> str:
    """Collapse excessive whitespace while preserving paragraph breaks."""
    import re
    # Collapse 3+ newlines to 2
    text = re.sub(r'\n{3,}', '\n\n', text)
    # Collapse multiple spaces/tabs to a single space within lines
    text = re.sub(r'[ \t]+', ' ', text)
    # Strip trailing spaces per line
    text = "\n".join(line.rstrip() for line in text.splitlines())
    return text.strip()


def _extract_text(filename: str, data: bytes) -> str:
    ext = filename.rsplit(".", 1)[-1].lower()
    if ext == "pdf":
        text = _extract_pdf(data)
    elif ext in ("txt", "md"):
        text = data.decode("utf-8", errors="replace")
    elif ext in ("docx",):
        try:
            import zipfile, xml.etree.ElementTree as ET
            with zipfile.ZipFile(io.BytesIO(data)) as z:
                xml_data = z.read("word/document.xml")
            root = ET.fromstring(xml_data)
            text = " ".join(
                el.text for el in root.iter("{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t")
                if el.text
            )
        except Exception:
            text = data.decode("utf-8", errors="replace")
    else:
        text = data.decode("utf-8", errors="replace")
    return _normalize_text(text)


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/me", response_model=ProfileResponse)
def get_profile(current_user: User = Depends(get_current_user)):
    return ProfileResponse(
        id=current_user.id,
        email=current_user.email,
        name=current_user.name,
        match_threshold=current_user.match_threshold,
        has_resume=bool(current_user.resume_text),
        is_verified=bool(current_user.is_verified),
        created_at=str(current_user.created_at) if current_user.created_at else None,
    )


@router.patch("/profile")
def update_profile(
    body: UpdateProfileBody,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update name and/or email. Email change resets verification."""
    if body.name is not None:
        stripped = body.name.strip()
        if not stripped:
            raise HTTPException(status_code=400, detail="Name cannot be empty")
        current_user.name = stripped

    if body.email is not None and body.email != current_user.email:
        existing = db.query(User).filter(
            User.email == body.email, User.id != current_user.id
        ).first()
        if existing:
            raise HTTPException(status_code=409, detail="Email already in use")
        current_user.email = body.email
        current_user.is_verified = False
        # Generate a new verification token and send the email
        from services.auth_service import generate_verification_token
        from routers.auth import _send_verification_email
        raw_token, hashed_token = generate_verification_token()
        current_user.verification_token = hashed_token
        background_tasks.add_task(
            _send_verification_email, current_user.email, current_user.name, raw_token
        )

    db.commit()
    db.refresh(current_user)
    return {
        "name": current_user.name,
        "email": current_user.email,
        "is_verified": bool(current_user.is_verified),
    }


@router.patch("/password")
def change_password(
    body: ChangePasswordBody,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Change password after verifying the current one."""
    if not verify_password(body.current_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    if len(body.new_password) < 6:
        raise HTTPException(status_code=400, detail="New password must be at least 6 characters")
    if body.current_password == body.new_password:
        raise HTTPException(status_code=400, detail="New password must differ from current password")
    current_user.hashed_password = hash_password(body.new_password)
    db.commit()
    return {"message": "Password updated successfully"}


@router.delete("/account")
def delete_account(
    body: DeleteAccountBody,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Permanently delete the account and all associated data."""
    if not verify_password(body.password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Incorrect password")
    db.delete(current_user)
    db.commit()
    return {"message": "Account deleted"}


@router.post("/resume", response_model=ResumeResponse)
async def upload_resume(
    file: UploadFile = File(...),
    name: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    allowed = {"pdf", "txt", "md", "docx"}
    ext = (file.filename or "").rsplit(".", 1)[-1].lower()
    if ext not in allowed:
        raise HTTPException(status_code=400, detail="Unsupported file type. Upload PDF, TXT, DOCX, or MD.")

    data = await file.read()
    if len(data) > 5 * 1024 * 1024:  # 5 MB limit
        raise HTTPException(status_code=400, detail="File too large (max 5 MB)")

    try:
        text = _extract_text(file.filename, data)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Could not extract text: {e}")

    if not text:
        raise HTTPException(status_code=422, detail="No text could be extracted from the file.")

    resume_name = name or (file.filename.rsplit(".", 1)[0] if file.filename else "My Resume")

    # Save as a new Resume row
    new_resume = Resume(
        id=str(uuid.uuid4()),
        user_id=current_user.id,
        name=resume_name,
        resume_text=text,
    )
    db.add(new_resume)

    # Set as active
    current_user.resume_text = text
    current_user.active_resume_id = new_resume.id
    db.commit()

    return ResumeResponse(resume_text=text)


@router.get("/resume", response_model=ResumeResponse)
def get_resume(current_user: User = Depends(get_current_user)):
    return ResumeResponse(resume_text=current_user.resume_text)


@router.get("/resumes", response_model=List[ResumeSummary])
def list_resumes(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    resumes = (
        db.query(Resume)
        .filter(Resume.user_id == current_user.id)
        .order_by(Resume.created_at.desc())
        .all()
    )
    return [
        ResumeSummary(
            id=r.id,
            name=r.name,
            created_at=str(r.created_at) if r.created_at else None,
            preview=r.resume_text[:120] if r.resume_text else "",
            is_active=(r.id == current_user.active_resume_id),
        )
        for r in resumes
    ]


@router.patch("/resume/active")
def set_active_resume(
    body: SetActiveBody,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    resume = db.query(Resume).filter(
        Resume.id == body.resume_id,
        Resume.user_id == current_user.id,
    ).first()
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    current_user.active_resume_id = resume.id
    current_user.resume_text = resume.resume_text
    db.commit()
    return {"status": "ok", "active_resume_id": resume.id}


@router.delete("/resume/{resume_id}")
def delete_resume(
    resume_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    resume = db.query(Resume).filter(
        Resume.id == resume_id,
        Resume.user_id == current_user.id,
    ).first()
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    was_active = (current_user.active_resume_id == resume_id)
    db.delete(resume)

    if was_active:
        # Fall back to most recent remaining resume (if any)
        remaining = (
            db.query(Resume)
            .filter(Resume.user_id == current_user.id, Resume.id != resume_id)
            .order_by(Resume.created_at.desc())
            .first()
        )
        if remaining:
            current_user.active_resume_id = remaining.id
            current_user.resume_text = remaining.resume_text
        else:
            current_user.active_resume_id = None
            current_user.resume_text = None

    db.commit()
    return {"status": "deleted"}
