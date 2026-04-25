import pandas as pd
from typing import List, Optional
import logging

from services.adzuna_scraper import scrape_adzuna

logger = logging.getLogger(__name__)


# linkedin  → jobspy (works fine from cloud IPs)
# adzuna    → Adzuna API (replaces Indeed/Glassdoor/ZipRecruiter which all
#             block datacenter IPs)
SUPPORTED_PLATFORMS = {"linkedin", "adzuna"}


def _clean(val) -> str:
    s = str(val or "").strip()
    return "" if s == "nan" else s


def _parse_rows(df: pd.DataFrame, platform: str) -> List[dict]:
    """Convert a jobspy DataFrame into our job-dict list."""
    jobs = []
    for _, row in df.iterrows():
        desc = str(row.get("description", "") or "")
        if not desc or desc == "nan":
            parts = []
            if row.get("job_type"):   parts.append(f"Type: {row['job_type']}")
            if row.get("min_amount"): parts.append(f"Salary: ${row.get('min_amount','')}–${row.get('max_amount','')}")
            desc = " | ".join(parts) if parts else "No description available"

        jobs.append({
            "title":       _clean(row.get("title", "")),
            "company":     _clean(row.get("company", "")),
            "location":    _clean(row.get("location", "")),
            "url":         _clean(row.get("job_url", "")),
            "description": desc[:6000],
            "platform":    _clean(row.get("site", "")) or platform,
            "date_posted": _clean(row.get("date_posted", "")),
            "salary_min":  _clean(row.get("min_amount", "")),
            "salary_max":  _clean(row.get("max_amount", "")),
            "job_type":    _clean(row.get("job_type", "")),
        })
    return jobs


def scrape_jobs(
    keywords: str,
    location: str = "Remote",
    platforms: Optional[List[str]] = None,
    results_per_site: int = 10,
    hours_old: int = 72,
    country_indeed: str = "usa",   # kept for API compat; used as Adzuna country
) -> List[dict]:
    """
    Scrape jobs from supported platforms.
    - linkedin  → jobspy (works from cloud IPs)
    - adzuna    → Adzuna API with caching (covers Indeed/Glassdoor/ZipRecruiter
                  data via Adzuna's publisher partnerships)
    One platform failing never prevents results from others.
    """
    try:
        from jobspy import scrape_jobs as _scrape
    except ImportError:
        logger.error("python-jobspy not installed.")
        _scrape = None

    if not platforms:
        platforms = ["linkedin", "adzuna"]
    platforms = [p.lower() for p in platforms if p.lower() in SUPPORTED_PLATFORMS]
    if not platforms:
        platforms = ["adzuna"]

    is_remote = location.strip().lower() in ("remote", "")
    all_jobs: List[dict] = []

    for platform in platforms:
        try:
            # ── Adzuna ───────────────────────────────────────────────────────
            if platform == "adzuna":
                platform_jobs = scrape_adzuna(
                    keywords=keywords,
                    location=location,
                    results_wanted=results_per_site,
                    hours_old=hours_old,
                    country=country_indeed,
                )
                logger.info("[adzuna] Got %d jobs", len(platform_jobs))
                all_jobs.extend(platform_jobs)
                continue

            # ── LinkedIn via jobspy ───────────────────────────────────────────
            if platform == "linkedin" and _scrape:
                kwargs: dict = dict(
                    site_name=["linkedin"],
                    search_term=keywords,
                    results_wanted=min(results_per_site, 10),
                    verbose=0,
                    linkedin_fetch_description=True,
                )
                if is_remote:
                    kwargs["is_remote"] = True
                else:
                    kwargs["location"] = location

                df: pd.DataFrame = _scrape(**kwargs)
                if df is None or df.empty:
                    logger.info("[linkedin] Returned 0 results")
                    continue

                platform_jobs = _parse_rows(df, "linkedin")
                logger.info("[linkedin] Got %d jobs", len(platform_jobs))
                all_jobs.extend(platform_jobs)

        except Exception as e:
            logger.warning("[%s] Scraping failed: %s", platform, e)
            continue

    logger.info("Total across all platforms: %d jobs", len(all_jobs))
    return all_jobs
