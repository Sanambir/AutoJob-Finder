"""
User profile router:
  GET  /api/user/me       — return profile + stored resume text
  POST /api/user/resume   — upload PDF/TXT resume, extract text, store on user
  GET  /api/user/resume   — return stored resume text
"""
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from pydantic import BaseModel
from typing import Optional
from sqlalchemy.orm import Session
import io

from database import get_db
from models import User
from services.auth_service import get_current_user

router = APIRouter(prefix="/user", tags=["User Profile"])


class ProfileResponse(BaseModel):
    id: str
    email: str
    name: str
    match_threshold: int
    has_resume: bool


class ResumeResponse(BaseModel):
    resume_text: Optional[str]


def _extract_pdf(data: bytes) -> str:
    from pdfminer.high_level import extract_text as pdf_extract_text
    return pdf_extract_text(io.BytesIO(data)) or ""


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
            ns = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
            text = " ".join(el.text for el in root.iter("{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t") if el.text)
        except Exception:
            text = data.decode("utf-8", errors="replace")
    else:
        text = data.decode("utf-8", errors="replace")
    return text.strip()


@router.get("/me", response_model=ProfileResponse)
def get_profile(current_user: User = Depends(get_current_user)):
    return ProfileResponse(
        id=current_user.id, email=current_user.email, name=current_user.name,
        match_threshold=current_user.match_threshold,
        has_resume=bool(current_user.resume_text),
    )


@router.post("/resume", response_model=ResumeResponse)
async def upload_resume(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    allowed = {"pdf", "txt", "md", "docx"}
    ext = (file.filename or "").rsplit(".", 1)[-1].lower()
    if ext not in allowed:
        raise HTTPException(status_code=400, detail=f"Unsupported file type. Upload PDF, TXT, DOCX, or MD.")

    data = await file.read()
    if len(data) > 5 * 1024 * 1024:  # 5 MB limit
        raise HTTPException(status_code=400, detail="File too large (max 5 MB)")

    try:
        text = _extract_text(file.filename, data)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Could not extract text: {e}")

    if not text:
        raise HTTPException(status_code=422, detail="No text could be extracted from the file.")

    current_user.resume_text = text
    db.commit()
    return ResumeResponse(resume_text=text)


@router.get("/resume", response_model=ResumeResponse)
def get_resume(current_user: User = Depends(get_current_user)):
    return ResumeResponse(resume_text=current_user.resume_text)
