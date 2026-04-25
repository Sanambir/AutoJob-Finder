"""
Custom Indeed scraper — bypasses IP-based blocking.

How it works:
  Indeed embeds all job-card data in a JSON blob (window.mosaic.providerData)
  inside the search results HTML. This is rendered server-side for SEO and is
  served to plain HTTP clients (no JavaScript needed). Datacenter IPs can
  fetch it fine with browser-like headers — the aggressive bot detection only
  kicks in on repeat rapid requests, not on individual search page loads.

  For full job descriptions we fetch each job's detail page individually.
  If that is blocked we fall back to the RSS snippet from the card.

Why not jobspy for Indeed?
  jobspy makes repeated search-page requests in a scraping pattern that
  Indeed's bot detection catches on datacenter/cloud IPs. One page load per
  search (our approach) is far less suspicious.
"""
import json
import logging
import re
import time
import random
from typing import List, Optional
from urllib.parse import urlencode

import httpx

logger = logging.getLogger(__name__)

# ── Country → Indeed domain ───────────────────────────────────────────────────
_COUNTRY_DOMAIN = {
    "usa":         "www.indeed.com",
    "us":          "www.indeed.com",
    "uk":          "uk.indeed.com",
    "gb":          "uk.indeed.com",
    "canada":      "ca.indeed.com",
    "ca":          "ca.indeed.com",
    "australia":   "au.indeed.com",
    "au":          "au.indeed.com",
    "india":       "in.indeed.com",
    "in":          "in.indeed.com",
    "germany":     "de.indeed.com",
    "de":          "de.indeed.com",
    "france":      "fr.indeed.com",
    "fr":          "fr.indeed.com",
    "netherlands": "www.indeed.nl",
    "nl":          "www.indeed.nl",
    "singapore":   "sg.indeed.com",
    "sg":          "sg.indeed.com",
    "new zealand": "nz.indeed.com",
    "nz":          "nz.indeed.com",
}

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": (
        "text/html,application/xhtml+xml,application/xml;"
        "q=0.9,image/avif,image/webp,*/*;q=0.8"
    ),
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "DNT": "1",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
}


def _strip_html(html: str) -> str:
    text = re.sub(r"<[^>]+>", " ", html)
    text = text.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
    text = text.replace("&nbsp;", " ").replace("&#39;", "'").replace("&quot;", '"')
    text = re.sub(r"&[a-z]+;", "", text)
    return re.sub(r"\s+", " ", text).strip()


def _parse_mosaic(html: str) -> Optional[list]:
    """
    Extract job cards from Indeed's server-side mosaic JSON blob.
    Indeed embeds: window.mosaic.providerData["mosaic-provider-jobcards"] = {...}
    """
    match = re.search(
        r'window\.mosaic\.providerData\["mosaic-provider-jobcards"\]\s*=\s*(\{.*?\});',
        html,
        re.DOTALL,
    )
    if not match:
        logger.debug("[indeed] mosaic JSON not found in page HTML")
        return None

    try:
        data = json.loads(match.group(1))
        return data.get("results") or data.get("metaData", {}).get("results")
    except json.JSONDecodeError as exc:
        logger.debug("[indeed] Failed to parse mosaic JSON: %s", exc)
        return None


def _fetch_full_description(client: httpx.Client, domain: str, jobkey: str) -> Optional[str]:
    """
    Fetch the full job description from the job detail page.
    Returns None if blocked or parsing fails — caller falls back to snippet.
    """
    url = f"https://{domain}/viewjob?jk={jobkey}"
    try:
        time.sleep(random.uniform(0.3, 0.9))
        resp = client.get(url, follow_redirects=True, timeout=12)
        if resp.status_code != 200:
            return None

        html = resp.text

        # Strategy 1: JSON blob — newer Indeed pages
        match = re.search(
            r'"jobDescriptionText"\s*:\s*"((?:[^"\\]|\\.)*)"',
            html,
            re.DOTALL,
        )
        if match:
            raw = (
                match.group(1)
                .replace("\\n", "\n")
                .replace("\\t", " ")
                .replace('\\"', '"')
                .replace("\\\\", "\\")
            )
            return _strip_html(raw)[:6000]

        # Strategy 2: <div id="jobDescriptionText">
        match = re.search(
            r'id=["\']jobDescriptionText["\'][^>]*>(.*?)</div>',
            html,
            re.DOTALL | re.IGNORECASE,
        )
        if match:
            return _strip_html(match.group(1))[:6000]

        # Strategy 3: schema.org JSON-LD
        match = re.search(
            r'"description"\s*:\s*"((?:[^"\\]|\\.)*)"',
            html,
            re.DOTALL,
        )
        if match:
            raw = match.group(1).replace("\\n", "\n").replace('\\"', '"')
            return _strip_html(raw)[:6000]

        return None
    except Exception as exc:
        logger.debug("[indeed] Detail page fetch failed for %s: %s", jobkey, exc)
        return None


def scrape_indeed(
    keywords: str,
    location: str = "remote",
    results_wanted: int = 10,
    hours_old: int = 72,
    country: str = "usa",
) -> List[dict]:
    """
    Scrape Indeed jobs via the search results page mosaic JSON.
    Uses the country-specific Indeed domain so international searches work.
    """
    domain = _COUNTRY_DOMAIN.get(country.lower().strip(), "www.indeed.com")
    is_remote = location.strip().lower() in ("remote", "")
    fromage = max(1, min(hours_old // 24, 14))

    params: dict = {
        "q": keywords,
        "sort": "date",
        "fromage": fromage,
        "limit": min(results_wanted, 25),
    }
    if is_remote:
        params["remotejob"] = "032b3046-06a3-4876-8dfd-474eb5e7ed11"
    else:
        params["l"] = location

    search_url = f"https://{domain}/jobs?" + urlencode(params)
    logger.info("[indeed] Fetching %s", search_url)

    try:
        with httpx.Client(headers=_HEADERS, follow_redirects=True, timeout=20) as client:
            resp = client.get(search_url)

            if resp.status_code != 200:
                logger.warning("[indeed] Search page returned %d", resp.status_code)
                return []

            results = _parse_mosaic(resp.text)
            if not results:
                logger.warning("[indeed] No job cards found in mosaic JSON — page may have changed or CAPTCHA triggered")
                return []

            jobs: List[dict] = []
            for card in results[:results_wanted]:
                jobkey   = card.get("jobkey", "")
                title    = card.get("displayTitle") or card.get("title", "")
                company  = card.get("company", "")
                loc      = card.get("formattedLocation") or card.get("location", location)
                snippet  = _strip_html(card.get("snippet", ""))
                pub_date = card.get("pubDate", "")  # epoch ms or string

                # Build the job URL
                job_url = f"https://{domain}/viewjob?jk={jobkey}" if jobkey else ""

                # Try full description; fall back to snippet from mosaic card
                description = snippet
                if jobkey:
                    full = _fetch_full_description(client, domain, jobkey)
                    if full and len(full) > len(snippet):
                        description = full

                if not description:
                    description = "No description available"

                # Salary from card if present
                salary_info = card.get("salarySnippet") or {}
                salary_text = salary_info.get("text", "") if isinstance(salary_info, dict) else ""

                jobs.append({
                    "title":       title.strip(),
                    "company":     company.strip(),
                    "location":    loc,
                    "url":         job_url,
                    "description": description,
                    "platform":    "indeed",
                    "date_posted": str(pub_date),
                    "salary_min":  salary_text,
                    "salary_max":  "",
                    "job_type":    "",
                })

            logger.info("[indeed] Returning %d jobs from %s", len(jobs), domain)
            return jobs

    except httpx.HTTPStatusError as exc:
        logger.warning("[indeed] HTTP error: %s", exc)
        return []
    except Exception as exc:
        logger.warning("[indeed] Unexpected error: %s", exc)
        return []
