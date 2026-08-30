"""newsdata.io implementation of the news provider interface.

WHY THIS PROVIDER EXISTS: the configured `NEWS_API_KEY` is a newsdata.io key —
they are prefixed `pub_` — while the code was calling newsapi.org, which
correctly rejected it with `401 apiKeyInvalid`. The key was never wrong; it was
being presented to the wrong vendor. See `__init__.get_news_provider` for how
the right implementation is now selected from the key itself.

VENDOR QUIRKS ABSORBED HERE
--------------------------
1. `pubDate` is `"2026-08-07 07:36:41"` — no timezone, no `T`. Passed through,
   the browser parses it as LOCAL time, so an article published five minutes
   ago renders hours in the past or future depending on the reader. Normalised
   to timezone-aware ISO 8601.
2. Errors arrive as HTTP 4xx with `{"status": "error", "results": {...}}` —
   note `results` is an object on errors and a list on success, so naive
   iteration over it raises.
3. Free-tier search does not honour quoted phrases the way newsapi.org does,
   so query construction is kept simple rather than pretending to support
   boolean phrase syntax.
"""
import logging
from datetime import datetime, timezone
from typing import Any, Optional

import httpx

from .base import ProviderAuthError, ProviderError, ProviderRateLimited

log = logging.getLogger("everest.newsdata")

BASE_URL = "https://newsdata.io/api/1/latest"
_HTTP_TIMEOUT = 12.0


def _iso(raw: Any) -> Optional[str]:
    """newsdata's `pubDate` -> timezone-aware ISO 8601.

    Their stamps are UTC but written without an offset. Attaching UTC
    explicitly is what stops the browser reading them as local time.
    """
    if not raw:
        return None
    text = str(raw).strip()
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d"):
        try:
            parsed = datetime.strptime(text, fmt)
            return parsed.replace(tzinfo=timezone.utc).isoformat()
        except ValueError:
            continue
    # Unrecognised shape: return None rather than a string the UI will
    # mis-date. A missing timestamp degrades visibly; a wrong one does not.
    return None


class NewsDataProvider:
    """newsdata.io-backed `NewsProvider`."""

    name = "newsdata.io"

    def __init__(self, api_key: str, client_factory=None):
        self._api_key = api_key or ""
        # Injectable so tests never touch the network.
        self._client_factory = client_factory or (
            lambda: httpx.AsyncClient(timeout=_HTTP_TIMEOUT)
        )

    @property
    def configured(self) -> bool:
        return bool(self._api_key)

    async def fetch_articles(self, query: str, *, limit: int = 10) -> list[dict]:
        if not self._api_key:
            raise ProviderAuthError("No news API key is configured.")

        params = {
            "apikey": self._api_key,
            "q": query,
            "language": "en",
        }

        try:
            async with self._client_factory() as client:
                response = await client.get(BASE_URL, params=params)
        except httpx.TimeoutException as exc:
            raise ProviderError("News provider timed out.", retryable=True) from exc
        except httpx.HTTPError as exc:
            raise ProviderError(f"Could not reach the news provider: {exc}", retryable=True) from exc

        status = response.status_code

        if status in (401, 403):
            raise ProviderAuthError("The news provider rejected the API key.", status=status)
        if status == 429:
            raise ProviderRateLimited("News provider rate limit reached.")
        if status >= 500:
            raise ProviderError(
                f"News provider server error (HTTP {status}).", retryable=True, status=status
            )

        try:
            payload = response.json()
        except ValueError as exc:
            raise ProviderError("News provider returned a non-JSON body.", retryable=True) from exc

        if not isinstance(payload, dict):
            raise ProviderError("News provider returned an unexpected payload.", retryable=True)

        if payload.get("status") == "error" or status >= 400:
            # Quirk 2: `results` is an object here, not a list.
            detail = payload.get("results")
            message = (
                detail.get("message")
                if isinstance(detail, dict)
                else payload.get("message") or "unknown error"
            )
            raise ProviderError(f"News provider error: {message}", retryable=status != 400)

        results = payload.get("results")
        if not isinstance(results, list):
            # A success status with no list is malformed, not an empty result.
            raise ProviderError("News provider returned a malformed result set.", retryable=True)

        articles = []
        for raw in results[:limit]:
            if not isinstance(raw, dict):
                continue
            title = raw.get("title") or ""
            if not title:
                continue  # an article with no headline is not renderable
            articles.append(
                {
                    "title": title,
                    "description": raw.get("description") or "",
                    "url": raw.get("link"),
                    "source": raw.get("source_name") or raw.get("source_id"),
                    "published_at": _iso(raw.get("pubDate")),
                    "image": raw.get("image_url"),
                }
            )
        return articles
