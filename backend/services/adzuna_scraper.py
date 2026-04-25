"""
Adzuna job search API client with in-memory caching and daily call tracking.

Why Adzuna instead of scraping Indeed/Glassdoor/ZipRecruiter directly?
  Those sites block datacenter/cloud IPs. Adzuna has official data partnerships
  with major job boards (including Indeed Publisher API access) and exposes that
  data via a clean REST API that works from any IP.

Caching strategy:
  - Results cached for 6 hours by (keywords, location, country) key.
  - Always fetches 50 results (API max) regardless of results_wanted so the
    cache serves multiple users with similar queries from one API call.
  - Daily call counter hard-caps at 240/day (leaves 10 buffer on the 250 free
    tier). Once the cap is hit the scraper returns [] gracefully.
"""
import logging
import os
import time
import datetime
from typing import Dict, List, Optional, Tuple

import httpx

logger = logging.getLogger(__name__)

# ── Adzuna country codes ──────────────────────────────────────────────────────
_COUNTRY_CODE = {
    "usa":         "us",
    "us":          "us",
    "uk":          "gb",
    "gb":          "gb",
    "canada":      "ca",
    "ca":          "ca",
    "australia":   "au",
    "au":          "au",
    "india":       "in",
    "in":          "in",
    "germany":     "de",
    "de":          "de",
    "france":      "fr",
    "fr":          "fr",
    "netherlands": "nl",
    "nl":          "nl",
    "singapore":   "sg",
    "sg":          "sg",
    "new zealand": "nz",
    "nz":          "nz",
    "brazil":      "br",
    "br":          "br",
    "austria":     "at",
    "at":          "at",
    "belgium":     "be",
    "be":          "be",
    "switzerland": "ch",
    "ch":          "ch",
    "south africa":"za",
    "za":          "za",
    "poland":      "pl",
    "pl":          "pl",
    "italy":       "it",
    "it":          "it",
    "spain":       "es",
    "es":          "es",
}

_BASE_URL = "https://api.adzuna.com/v1/api/jobs"
_CACHE_TTL = 6 * 3600          # 6 hours
_MAX_DAILY_CALLS = 240          # hard cap (free tier = 250)
_RESULTS_PER_CALL = 50          # always fetch max so cache serves more users

# ── In-memory cache ───────────────────────────────────────────────────────────
# (keywords, location, country_code) → (results, fetched_at_epoch)
_cache: Dict[Tuple[str, str, str], Tuple[List[dict], float]] = {}

# ── Daily call counter ────────────────────────────────────────────────────────
_daily: Dict[str, int] = {}     # {"2026-04-24": 12}


def _today() -> str:
    return datetime.date.today().isoformat()


def _calls_today() -> int:
    return _daily.get(_today(), 0)


def _increment_calls():
    today = _today()
    _daily[today] = _daily.get(today, 0) + 1
    # Drop old dates so the dict doesn't grow forever
    for d in list(_daily):
        if d != today:
            del _daily[d]


def _cache_key(keywords: str, location: str, country_code: str) -> Tuple[str, str, str]:
    return (keywords.lower().strip(), location.lower().strip(), country_code)


def _get_cached(key: Tuple) -> Optional[List[dict]]:
    entry = _cache.get(key)
    if entry:
        results, ts = entry
        if time.time() - ts < _CACHE_TTL:
            logger.info("[adzuna] Cache hit for %s", key)
            return results
        del _cache[key]
    return None


def _set_cache(key: Tuple, results: List[dict]):
    _cache[key] = (results, time.time())


def _fetch_from_api(
    keywords: str,
    location: str,
    country_code: str,
    hours_old: int,
) -> List[dict]:
    """Make one API call to Adzuna. Caller is responsible for cache + counter."""
    app_id  = os.environ.get("ADZUNA_APP_ID", "")
    app_key = os.environ.get("ADZUNA_APP_KEY", "")
    if not app_id or not app_key:
        logger.error("[adzuna] ADZUNA_APP_ID / ADZUNA_APP_KEY not set in environment")
        return []

    max_days = max(1, min(hours_old // 24, 30))
    is_remote = location.strip().lower() in ("remote", "")

    params: dict = {
        "app_id":           app_id,
        "app_key":          app_key,
        "results_per_page": _RESULTS_PER_CALL,
        "what":             keywords,
        "sort_by":          "date",
        "max_days_old":     max_days,
        "content-type":     "application/json",
    }
    if is_remote:
        params["where"] = "remote"
    elif location.strip():
        params["where"] = location.strip()

    url = f"{_BASE_URL}/{country_code}/search/1"

    try:
        _increment_calls()
        logger.info(
            "[adzuna] API call #%d today → %s (%s, %s)",
            _calls_today(), url, keywords, location,
        )
        resp = httpx.get(url, params=params, timeout=15)
        resp.raise_for_status()
        data = resp.json()
    except httpx.HTTPStatusError as exc:
        logger.warning("[adzuna] HTTP error: %s", exc)
        return []
    except Exception as exc:
        logger.warning("[adzuna] Request failed: %s", exc)
        return []

    jobs: List[dict] = []
    for item in data.get("results", []):
        company  = item.get("company", {})
        loc      = item.get("location", {})
        salary_min = item.get("salary_min") or ""
        salary_max = item.get("salary_max") or ""

        jobs.append({
            "title":       (item.get("title") or "").strip(),
            "company":     (company.get("display_name") or "").strip() if isinstance(company, dict) else "",
            "location":    (loc.get("display_name") or location).strip() if isinstance(loc, dict) else location,
            "url":         item.get("redirect_url") or "",
            "description": (item.get("description") or "No description available").strip(),
            "platform":    "adzuna",
            "date_posted": item.get("created", ""),
            "salary_min":  str(salary_min) if salary_min else "",
            "salary_max":  str(salary_max) if salary_max else "",
            "job_type":    item.get("contract_time") or item.get("contract_type") or "",
        })

    logger.info("[adzuna] Got %d jobs from API", len(jobs))
    return jobs


def scrape_adzuna(
    keywords: str,
    location: str = "remote",
    results_wanted: int = 10,
    hours_old: int = 72,
    country: str = "usa",
) -> List[dict]:
    """
    Search Adzuna with caching and daily call cap.
    Returns up to results_wanted jobs (sliced from a cached 50-result batch).
    """
    country_code = _COUNTRY_CODE.get(country.lower().strip(), "us")
    key = _cache_key(keywords, location, country_code)

    # 1. Try cache first
    cached = _get_cached(key)
    if cached is not None:
        return cached[:results_wanted]

    # 2. Check daily cap before making an API call
    if _calls_today() >= _MAX_DAILY_CALLS:
        logger.warning(
            "[adzuna] Daily cap reached (%d/%d) — skipping API call",
            _calls_today(), _MAX_DAILY_CALLS,
        )
        return []

    # 3. Fetch from API, cache full 50-result batch
    results = _fetch_from_api(keywords, location, country_code, hours_old)
    if results:
        _set_cache(key, results)

    if _calls_today() >= 200:
        logger.warning("[adzuna] Approaching daily limit: %d/250 calls used", _calls_today())

    return results[:results_wanted]
