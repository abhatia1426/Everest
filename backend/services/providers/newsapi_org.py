"""newsapi.org implementation of the news provider interface.

Retained — and kept working — because newsapi.org is the vendor the project was
originally built against, and a key of that kind should continue to work if one
is configured. `get_news_provider` selects between this and newsdata.io from
the key's own shape, so switching vendors is a matter of changing the key.
"""
import logging
from typing import Optional

import httpx

from .base import ProviderAuthError, ProviderError, ProviderRateLimited

log = logging.getLogger("everest.newsapi")

BASE_URL = "https://newsapi.org/v2/everything"
_HTTP_TIMEOUT = 12.0


class NewsApiOrgProvider:
    """newsapi.org-backed `NewsProvider`."""

    name = "newsapi.org"

    def __init__(self, api_key: str, client_factory=None):
        self._api_key = api_key or ""
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
            "q": query,
            "language": "en",
            "sortBy": "publishedAt",
            "pageSize": limit,
            "apiKey": self._api_key,
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

        if payload.get("status") == "error":
            raise ProviderError(
                f"News provider error: {payload.get('message') or 'unknown error'}",
                retryable=True,
            )

        raw_articles = payload.get("articles")
        if not isinstance(raw_articles, list):
            raise ProviderError("News provider returned a malformed result set.", retryable=True)

        articles = []
        for raw in raw_articles[:limit]:
            if not isinstance(raw, dict):
                continue
            title = raw.get("title") or ""
            if not title:
                continue
            source = raw.get("source")
            articles.append(
                {
                    "title": title,
                    "description": raw.get("description") or "",
                    "url": raw.get("url"),
                    "source": source.get("name") if isinstance(source, dict) else None,
                    # newsapi.org already emits timezone-aware ISO 8601.
                    "published_at": raw.get("publishedAt"),
                    "image": raw.get("urlToImage"),
                }
            )
        return articles
