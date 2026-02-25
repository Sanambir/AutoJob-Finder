from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List
from config import GOOGLE_API_KEY
from services.scorer import score_resume as _score_resume

router = APIRouter()


class ScoreRequest(BaseModel):
    resume: str
    job_description: str


class ScoreResponse(BaseModel):
    match_score: int
    reasoning: str
    missing_skills: List[str]


@router.post("/score", response_model=ScoreResponse)
async def score_resume(request: ScoreRequest):
    if not GOOGLE_API_KEY:
        raise HTTPException(status_code=500, detail="GOOGLE_API_KEY not configured — add it to your .env file")
    try:
        result = await _score_resume(request.resume, request.job_description)
        return ScoreResponse(**result)
    except ValueError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

