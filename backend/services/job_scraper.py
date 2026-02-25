import os

import pandas as pd
from typing import List, Optional
import logging

logger = logging.getLogger(__name__)


SUPPORTED_PLATFORMS = {"linkedin", "indeed", "glassdoor", "zip_recruiter"}


def scrape_jobs(
    keywords: str,
    location: str = "Remote",
    platforms: Optional[List[str]] = None,
    results_per_site: int = 10,
    hours_old: int = 72,          # Only jobs posted in last N hours
) -> List[dict]:
    """
    Scrape jobs from multiple platforms. Returns a list of job dicts.
    Each dict: {title, company, location, url, description, platform, date_posted}
    """
    try:
        from jobspy import scrape_jobs as _scrape
    except ImportError:
        logger.error("python-jobspy not installed. Run: pip3 install python-jobspy")
        return []

    # Validate and normalize platform list
    if not platforms:
        platforms = ["indeed", "linkedin", "glassdoor", "zip_recruiter"]
    platforms = [p.lower() for p in platforms if p.lower() in SUPPORTED_PLATFORMS]
    if not platforms:
        platforms = ["indeed"]

    try:
        df: pd.DataFrame = _scrape(
            site_name=platforms,
            search_term=keywords,
            location=location,
            results_wanted=results_per_site,
            hours_old=hours_old,
            country_indeed="USA",
            linkedin_fetch_description=True,   # Needed to get full JD from LinkedIn
        )
    except Exception as e:
        logger.error(f"jobspy scrape failed: {e}")
        return []

    if df is None or df.empty:
        return []

    jobs = []
    for _, row in df.iterrows():
        # Build a clean description — jobspy returns NaN for missing values
        desc = str(row.get("description", "") or "")
        if not desc or desc == "nan":
            # Compose a minimal description from structured fields
            parts = []
            if row.get("job_type"):   parts.append(f"Type: {row['job_type']}")
            if row.get("min_amount"): parts.append(f"Salary: ${row.get('min_amount','')}–${row.get('max_amount','')}")
            desc = " | ".join(parts) if parts else "No description available"

        url = str(row.get("job_url", "") or "")
        if url == "nan":
            url = ""

        jobs.append({
            "title":       str(row.get("title", "")     or "").strip(),
            "company":     str(row.get("company", "")   or "").strip(),
            "location":    str(row.get("location", "")  or "").strip(),
            "url":         url,
            "description": desc[:6000],   # cap at 6k chars to keep Gemini prompt manageable
            "platform":    str(row.get("site", "")      or "").strip(),
            "date_posted": str(row.get("date_posted", "") or "").strip(),
        })

    return jobs
