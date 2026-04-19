import pandas as pd
from typing import List, Optional
import logging

logger = logging.getLogger(__name__)


SUPPORTED_PLATFORMS = {"linkedin", "indeed", "glassdoor", "zip_recruiter"}

# Platforms where hours_old is reliably supported.
# Glassdoor returns "Error encountered in API response" when hours_old is passed.
# ZipRecruiter ignores it and the parameter can cause empty results.
_HOURS_OLD_SUPPORTED = {"linkedin", "indeed"}


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
) -> List[dict]:
    """
    Scrape jobs from multiple platforms independently.
    One platform failing never prevents results from others.
    """
    try:
        from jobspy import scrape_jobs as _scrape
    except ImportError:
        logger.error("python-jobspy not installed. Run: pip install python-jobspy")
        return []

    if not platforms:
        platforms = ["linkedin", "indeed"]
    platforms = [p.lower() for p in platforms if p.lower() in SUPPORTED_PLATFORMS]
    if not platforms:
        platforms = ["indeed"]

    # Detect remote-only searches.
    is_remote = location.strip().lower() in ("remote", "")

    all_jobs: List[dict] = []

    for platform in platforms:
        try:
            kwargs: dict = dict(
                site_name=[platform],
                search_term=keywords,
                results_wanted=results_per_site,
                country_indeed="usa",
                verbose=0,
            )

            if is_remote:
                # Use jobspy's is_remote flag for remote-only searches — more
                # reliable than passing "Remote" as a location string.
                kwargs["is_remote"] = True
            else:
                # For location-based searches: pass the location string and
                # do NOT set is_remote at all. Indeed in jobspy ignores the
                # location parameter when is_remote=False is explicitly set,
                # so omitting it lets the location do the work on all platforms.
                kwargs["location"] = location

            # hours_old causes Glassdoor API errors and ZipRecruiter empty
            # results — only apply it where it's reliably supported.
            if platform in _HOURS_OLD_SUPPORTED:
                kwargs["hours_old"] = hours_old

            # LinkedIn requires extra per-listing HTTP calls to get full JD text.
            # Each call fetches a full HTML page, so memory grows with result count.
            # Cap LinkedIn results at 10 regardless of results_per_site to bound
            # the number of description fetches and keep memory predictable.
            if platform == "linkedin":
                kwargs["linkedin_fetch_description"] = True
                kwargs["results_wanted"] = min(results_per_site, 10)

            df: pd.DataFrame = _scrape(**kwargs)

            if df is None or df.empty:
                logger.info("[%s] Returned 0 results", platform)
                continue

            platform_jobs = _parse_rows(df, platform)
            logger.info("[%s] Got %d jobs", platform, len(platform_jobs))
            all_jobs.extend(platform_jobs)

        except Exception as e:
            # Log but keep going so other platforms still contribute results.
            logger.warning("[%s] Scraping failed: %s", platform, e)
            continue

    logger.info("Total across all platforms: %d jobs", len(all_jobs))
    return all_jobs
