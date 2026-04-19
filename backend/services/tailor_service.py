"""
Tailoring service — called directly by the search pipeline and /tailor router.
"""
from typing import List
from google import genai
from google.genai import types
from config import GOOGLE_API_KEY, GEMINI_MODEL
from services.gemini_retry import gemini_call_with_retry
import asyncio

# Module-level singleton — created once, reused for every call
_client = genai.Client(api_key=GOOGLE_API_KEY) if GOOGLE_API_KEY else None

SUGGESTIONS_PROMPT = """You are an elite resume coach and ATS specialist. Analyze the resume against the job description and produce a numbered list of **specific, actionable edits** the applicant should make to improve their match score.

Rules:
- Be concrete: quote or reference actual resume text, then say exactly how to rewrite it
- Focus on: keyword alignment, quantified achievements, missing skills, section order, and tone
- Include 5–10 suggestions
- Mention missing skills ({missing_skills}) the applicant should highlight if they have any relevant experience
- Do NOT rewrite the full resume — only targeted suggestions
- Format: numbered list, each item one short paragraph

RESUME:
{resume}

JOB DESCRIPTION:
{job_description}

Write the suggestions now:"""


COVER_LETTER_PROMPT = """Write a compelling, tailored cover letter for {name} applying for {job_title} at {company}.

Rules:
- 3–4 paragraphs: strong hook, relevant experience aligned to the JD, value proposition, call-to-action
- Mirror keywords and tone from the job description
- Sound enthusiastic and human — avoid corporate boilerplate
- Do NOT open with "I am writing to express my interest…"
- Address "Hiring Manager" unless a name is given
- Keep it under 350 words

JOB DESCRIPTION:
{job_description}

APPLICANT RESUME (first 1500 chars):
{resume_snippet}

Write the cover letter now:"""


async def tailor_documents(
    resume: str,
    job_description: str,
    missing_skills: List[str],
    applicant_name: str,
    job_title: str,
    company_name: str,
) -> dict:
    """
    Generate resume suggestions and cover letter using Gemini.

    Returns dict with keys: resume_suggestions (str), cover_letter (str)
    Raises ValueError on missing API key or Gemini errors.
    """
    if not _client:
        raise ValueError("GOOGLE_API_KEY not configured")

    cfg = types.GenerateContentConfig(temperature=0.4)
    missing = ", ".join(missing_skills) if missing_skills else "none identified"

    # Run both Gemini calls concurrently — cuts tailoring time roughly in half
    async def _suggestions():
        r = await gemini_call_with_retry(
            _client.models.generate_content,
            model=GEMINI_MODEL,
            contents=SUGGESTIONS_PROMPT.format(
                resume=resume[:3000],
                job_description=job_description[:2500],
                missing_skills=missing,
            ),
            config=cfg,
        )
        return (r.text or "").strip()

    async def _cover_letter():
        r = await gemini_call_with_retry(
            _client.models.generate_content,
            model=GEMINI_MODEL,
            contents=COVER_LETTER_PROMPT.format(
                name=applicant_name,
                job_title=job_title,
                company=company_name,
                job_description=job_description[:2000],
                resume_snippet=resume[:2000],
            ),
            config=cfg,
        )
        return (r.text or "").strip()

    # Run sequentially — asyncio.gather would fire 2 concurrent Gemini calls per job,
    # doubling API pressure and causing 429s despite the per-job semaphore in search.py
    suggestions = await _suggestions()
    cover_letter = await _cover_letter()

    return {
        "resume_suggestions": suggestions,
        "cover_letter": cover_letter,
    }
