"""The news provider boundary.

Mirrors `base.py` (market data) deliberately: one interface, vendor specifics
isolated behind it, and the same `ProviderError` taxonomy so routers handle
failures from either kind of provider identically.

The migration that prompted this: `routers/news.py` called newsapi.org
directly, formatted newsapi.org's parameters inline, and raised
`HTTPException(502, "NewsAPI rejected the configured key")` — a vendor name and
a vendor failure mode, rendered verbatim in the user's browser. Nothing in the
frontend should ever learn which news vendor is behind the API.
"""
from typing import Optional, Protocol

from .base import ProviderAuthError, ProviderError, ProviderRateLimited

__all__ = [
    "NewsProvider",
    "ProviderError",
    "ProviderAuthError",
    "ProviderRateLimited",
    "NewsArticle",
]

# The canonical article shape every provider maps onto. Keys match what the
# frontend already consumes; adding a provider must never change them.
NewsArticle = dict


class NewsProvider(Protocol):
    """What `services/news.py` requires of a news source."""

    name: str

    @property
    def configured(self) -> bool:
        """False when no usable credential is present."""
        ...

    async def fetch_articles(self, query: str, *, limit: int = 10) -> list[NewsArticle]:
        """Recent articles matching `query`, newest first.

        Returns a list of:

            {
              "title": str,
              "description": str,
              "url": str | None,
              "source": str | None,
              "published_at": str | None,   # ISO 8601, timezone-aware
              "image": str | None,
            }

        An empty list means "nothing matched", which is a valid answer and must
        NOT be conflated with failure. Anything that prevents answering at all
        raises `ProviderError` (or `ProviderAuthError` / `ProviderRateLimited`),
        so the caller can tell "no news about this company" apart from "the
        news vendor is down".

        `published_at` must be timezone-aware ISO 8601. Vendors that emit naive
        local-looking strings are the caller's problem to normalise here, not
        the browser's — a naive stamp is parsed as local time and renders
        recent articles hours adrift.
        """
        ...
