"""
Retry helper for Gemini API calls.
Retries on 503 UNAVAILABLE and 429 RESOURCE_EXHAUSTED with exponential backoff.
"""
import asyncio
import logging

logger = logging.getLogger(__name__)

_RETRYABLE_CODES = {429, 503}
_MAX_RETRIES = 4
_BASE_DELAY = 5   # seconds


async def gemini_call_with_retry(fn, *args, **kwargs):
    """
    Call a synchronous Gemini SDK function with async exponential-backoff retries.
    
    Usage:
        response = await gemini_call_with_retry(client.models.generate_content, model=..., ...)
    """
    last_exc = None
    for attempt in range(_MAX_RETRIES):
        try:
            return fn(*args, **kwargs)
        except Exception as e:
            msg = str(e)
            # Check for retryable HTTP status codes in the error message
            is_retryable = any(f"{code}" in msg for code in _RETRYABLE_CODES)
            if not is_retryable or attempt == _MAX_RETRIES - 1:
                raise
            delay = _BASE_DELAY * (2 ** attempt)   # 5s, 10s, 20s, 40s
            logger.warning("Gemini %s (attempt %d/%d) — retrying in %ds…", 
                           "503" if "503" in msg else "429", 
                           attempt + 1, _MAX_RETRIES, delay)
            await asyncio.sleep(delay)
            last_exc = e
    raise last_exc
