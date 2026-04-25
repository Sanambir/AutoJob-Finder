"""
Custom Indeed scraper using the public RSS feed.

Why not jobspy for Indeed?
  jobspy makes direct search-page requests which Indeed blocks from datacenter
  IPs (cloud servers). The RSS feed is a public, machine-readable endpoint that
  Indeed doesn't IP-block. We fetch job listings from RSS, then try to grab the
  full description from each job's detail page using a browser-like session.
  If the detail page is blocked we fall back to the RSS snippet.
"""
import logging
import re
import time
import random
import xml.etree.ElementTree as ET
from typing import List, Optional
from urllib.parse import urlencode

import httpx

logger = logging.getLogger(__name__)

# Browser-like headers so individual job pages don't get flagged
_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "DNT": "1",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
}


def _strip_html(html: str) -> str:
    """Remove HTML tags and decode common entities."""
    text = re.sub(r"<[^>]+>", " ", html)
    text = text.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
    text = text.replace("&nbsp;", " ").replace("&#39;", "'").replace("&quot;", '"')
    text = re.sub(r"&[a-z]+;", "", text)
    return re.sub(r"\s+", " ", text).strip()


def _extract_location_from_snippet(snippet: str, fallback: str) -> str:
    """Pull location out of Indeed's RSS description HTML."""
    # Indeed RSS description HTML usually has "location" as bold label
    match = re.search(
        r"<b>(?:Location|location)[:\s]*</b>\s*([^<\n]+)", snippet, re.IGNORECASE
    )
    if match:
        return match.group(1).strip()
    # Sometimes it's plain text: "Location: New York, NY"
    match = re.search(r"[Ll]ocation[:\s]+([A-Za-z ,]+?)(?:<|\n|$)", snippet)
    if match:
        return match.group(1).strip()
    return fallback


def _fetch_full_description(client: httpx.Client, job_url: str) -> Optional[str]:
    """
    Fetch the full job description from an Indeed job page.
    Indeed embeds job data in a JSON blob inside the page HTML.
    Returns None if the page is blocked or parsing fails.
    """
    try:
        # Small delay to avoid triggering rate limits
        time.sleep(random.uniform(0.4, 1.2))
        resp = client.get(job_url, follow_redirects=True, timeout=12)
        if resp.status_code != 200:
            logger.debug("[indeed] Detail page returned %d for %s", resp.status_code, job_url)
            return None

        html = resp.text

        # Strategy 1: JSON blob — newer Indeed pages embed all job data as JSON.
        # The description field is HTML-escaped inside the JSON string.
        match = re.search(
            r'"jobDescriptionText"\s*:\s*"((?:[^"\\]|\\.)*)"\s*[,}]',
            html,
            re.DOTALL,
        )
        if match:
            raw = match.group(1)
            # Unescape JSON string escapes
            raw = raw.replace("\\n", "\n").replace("\\t", " ").replace('\\"', '"').replace("\\\\", "\\")
            return _strip_html(raw)[:6000]

        # Strategy 2: <div id="jobDescriptionText"> — older Indeed layout
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

        logger.debug("[indeed] Could not find description on detail page")
        return None

    except Exception as exc:
        logger.debug("[indeed] Detail page fetch failed: %s", exc)
        return None


def scrape_indeed(
    keywords: str,
    location: str = "remote",
    results_wanted: int = 10,
    hours_old: int = 72,
) -> List[dict]:
    """
    Scrape Indeed via the public RSS feed.
    Falls back to RSS snippet if individual job pages can't be fetched.
    """
    is_remote = location.strip().lower() in ("remote", "")
    fromage = max(1, min(hours_old // 24, 14))  # RSS supports max ~14 days

    params: dict = {
        "q": keywords,
        "sort": "date",
        "fromage": fromage,
        "limit": min(results_wanted, 25),
    }
    if is_remote:
        params["l"] = "remote"
        params["remotejob"] = "032b3046-06a3-4876-8dfd-474eb5e7ed11"
    else:
        params["l"] = location

    rss_url = "https://www.indeed.com/rss?" + urlencode(params)
    logger.info("[indeed-rss] Fetching %s", rss_url)

    try:
        with httpx.Client(headers=_HEADERS, follow_redirects=True, timeout=15) as client:
            rss_resp = client.get(rss_url)
            rss_resp.raise_for_status()

            try:
                root = ET.fromstring(rss_resp.content)
            except ET.ParseError as exc:
                logger.warning("[indeed-rss] XML parse error: %s", exc)
                return []

            channel = root.find("channel")
            if channel is None:
                logger.warning("[indeed-rss] No <channel> in RSS response")
                return []

            items = channel.findall("item")[:results_wanted]
            if not items:
                logger.info("[indeed-rss] RSS returned 0 items")
                return []

            jobs: List[dict] = []

            for item in items:
                title_el   = item.find("title")
                link_el    = item.find("link")
                pubdate_el = item.find("pubDate")
                desc_el    = item.find("description")

                if title_el is None or link_el is None:
                    continue

                raw_title = title_el.text or ""
                # Indeed RSS titles are "Job Title - Company Name"
                if " - " in raw_title:
                    title, company = raw_title.rsplit(" - ", 1)
                else:
                    title, company = raw_title, ""

                job_url    = link_el.text or ""
                date_str   = pubdate_el.text or "" if pubdate_el is not None else ""
                snippet_html = desc_el.text or "" if desc_el is not None else ""
                snippet    = _strip_html(snippet_html)
                job_loc    = _extract_location_from_snippet(snippet_html, location)

                # Try to fetch the full description; fall back to RSS snippet
                full_desc = _fetch_full_description(client, job_url) if job_url else None
                description = full_desc if (full_desc and len(full_desc) > len(snippet)) else snippet

                if not description:
                    description = "No description available"

                jobs.append({
                    "title":       title.strip(),
                    "company":     company.strip(),
                    "location":    job_loc,
                    "url":         job_url,
                    "description": description,
                    "platform":    "indeed",
                    "date_posted": date_str,
                    "salary_min":  "",
                    "salary_max":  "",
                    "job_type":    "",
                })

            logger.info("[indeed-rss] Returning %d jobs", len(jobs))
            return jobs

    except httpx.HTTPStatusError as exc:
        logger.warning("[indeed-rss] HTTP error: %s", exc)
        return []
    except Exception as exc:
        logger.warning("[indeed-rss] Unexpected error: %s", exc)
        return []
