"""
Scoring service — called directly by both the /score router and the search pipeline.
Avoids the self-calling HTTP loop that caused silent failures.
"""
import json
import re
from google import genai
from google.genai import types
from config import GOOGLE_API_KEY, GEMINI_MODEL
from services.gemini_retry import gemini_call_with_retry

SCORING_PROMPT = """
You are an expert ATS (Applicant Tracking System) and career coach. Analyze the following resume against the job description.

Return ONLY a valid JSON object with this exact structure — no markdown, no extra text:
{{
  "match_score": <integer 0-100>,
  "reasoning": "<2-3 sentence explanation of the score>",
  "missing_skills": ["<skill1>", "<skill2>", ...]
}}

Rules:
- match_score: 0-100 integer. 75+ means strong candidate.
- reasoning: concise, specific to this role and resume.
- missing_skills: list of concrete skills/technologies from the JD not found in resume. Empty list [] if none.

RESUME:
{resume}

JOB DESCRIPTION:
{job_description}
"""


async def score_resume(resume: str, job_description: str) -> dict:
    """
    Score a resume against a job description using Gemini.

    Returns a dict with keys: match_score (int), reasoning (str), missing_skills (list[str])
    Raises ValueError on Gemini/JSON errors.
    """
    if not GOOGLE_API_KEY:
        raise ValueError("GOOGLE_API_KEY not configured")

    client = genai.Client(api_key=GOOGLE_API_KEY)
    prompt = SCORING_PROMPT.format(resume=resume, job_description=job_description)

    response = await gemini_call_with_retry(
        client.models.generate_content,
        model=GEMINI_MODEL,
        contents=prompt,
        config=types.GenerateContentConfig(
            temperature=0.1,
            response_mime_type="application/json",
        ),
    )
    raw = response.text.strip() if response.text else ""

    # Strip markdown fences if present
    raw = re.sub(r"^```(?:json)?\s*", "", raw)
    raw = re.sub(r"\s*```$", "", raw)

    data = json.loads(raw)
    return {
        "match_score": int(data["match_score"]),
        "reasoning": data.get("reasoning", ""),
        "missing_skills": data.get("missing_skills", []),
    }
