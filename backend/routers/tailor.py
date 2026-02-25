"""
Tailoring router — delegates to services/tailor_service.py (Gemini 1.5 Flash).

Output:
  - resume_suggestions: numbered list of specific edits to strengthen the resume for this JD
  - cover_letter:        personalised cover letter
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List
from config import GOOGLE_API_KEY
from services.tailor_service import tailor_documents as _tailor_documents

router = APIRouter()


class TailorRequest(BaseModel):
    resume: str
    job_description: str
    missing_skills: List[str] = []
    applicant_name: str = "Applicant"
    job_title: str = "Position"
    company_name: str = "Company"


class TailorResponse(BaseModel):
    resume_suggestions: str
    cover_letter: str


@router.post("/tailor", response_model=TailorResponse)
async def tailor_documents(request: TailorRequest):
    if not GOOGLE_API_KEY:
        raise HTTPException(status_code=500, detail="GOOGLE_API_KEY not configured — add it to your .env file")
    try:
        result = await _tailor_documents(
            resume=request.resume,
            job_description=request.job_description,
            missing_skills=request.missing_skills,
            applicant_name=request.applicant_name,
            job_title=request.job_title,
            company_name=request.company_name,
        )
        return TailorResponse(**result)
    except ValueError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
