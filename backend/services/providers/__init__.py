"""Data providers.

`get_provider()` (market data) and `get_news_provider()` (news) are the single
wiring points. Swapping a vendor means adding an implementation and changing
one function — nothing in the services, routers or frontend has vendor
knowledge.
"""
import logging
import os

from .base import (
    MarketDataProvider,
    ProviderAuthError,
    ProviderError,
    ProviderFeatureUnavailable,
    ProviderRateLimited,
)
from .finnhub import FinnhubProvider
from .twelvedata import TwelveDataProvider
from .news_base import NewsProvider
from .newsapi_org import NewsApiOrgProvider
from .newsdata import NewsDataProvider

log = logging.getLogger("everest.providers")

__all__ = [
    "MarketDataProvider",
    "NewsProvider",
    "ProviderError",
    "ProviderAuthError",
    "ProviderRateLimited",
    "ProviderFeatureUnavailable",
    "FinnhubProvider",
    "TwelveDataProvider",
    "NewsDataProvider",
    "NewsApiOrgProvider",
    "get_provider",
    "set_provider",
    "get_history_provider",
    "set_history_provider",
    "get_news_provider",
    "detect_news_vendor",
    "set_news_provider",
]

# --------------------------------------------------------------- market data

_provider: MarketDataProvider | None = None


def get_provider() -> MarketDataProvider:
    """The active market-data provider. Constructed once, lazily."""
    global _provider
    if _provider is None:
        _provider = FinnhubProvider()
    return _provider


def set_provider(provider: MarketDataProvider | None) -> None:
    """Override the active market-data provider. For tests and vendor switching."""
    global _provider
    _provider = provider


# ---------------------------------------------------------------- history

_history_provider = None


def get_history_provider():
    """The active historical-candle provider.

    Separate from the quote provider on purpose: Finnhub serves quotes on the
    free tier but puts candles behind a paid plan, so history is wired to its
    own vendor and either can change without touching the other.

    Falls back to the quote provider when no history key is configured — which
    keeps the code path identical whether or not TWELVEDATA_API_KEY is set. The
    Finnhub candle client raises ProviderFeatureUnavailable, which `market.py`
    turns into an empty series and a chart empty state.
    """
    global _history_provider
    if _history_provider is None:
        candidate = TwelveDataProvider()
        if candidate.configured:
            _history_provider = candidate
            log.info("History provider: %s", candidate.name)
        else:
            _history_provider = get_provider()
            log.info(
                "History provider: falling back to %s — TWELVEDATA_API_KEY is not set, "
                "so historical charts will be empty.",
                _history_provider.name,
            )
    return _history_provider


def set_history_provider(provider) -> None:
    """Override the active history provider. For tests and vendor switching."""
    global _history_provider
    _history_provider = provider


# --------------------------------------------------------------------- news

_news_provider: NewsProvider | None = None


def detect_news_vendor(api_key: str) -> str:
    """Infer the vendor from the key's own shape.

    newsdata.io issues keys prefixed `pub_`; newsapi.org issues bare 32-char
    hex. This is what the original bug came down to — a newsdata.io key being
    posted to newsapi.org, which rejected it with `401 apiKeyInvalid` and left
    "NewsAPI rejected the configured key" on screen. The key was correct; the
    endpoint was not.

    Detecting from the key means configuring news is just setting a key, and
    it cannot silently drift out of sync with the endpoint again. An explicit
    `NEWS_PROVIDER` env var overrides it.
    """
    override = (os.getenv("NEWS_PROVIDER") or "").strip().lower()
    if override in ("newsdata", "newsdata.io"):
        return "newsdata"
    if override in ("newsapi", "newsapi.org"):
        return "newsapi"

    return "newsdata" if (api_key or "").startswith("pub_") else "newsapi"


def get_news_provider() -> NewsProvider:
    """The active news provider, chosen from the configured key."""
    global _news_provider
    if _news_provider is None:
        from config import NEWS_API_KEY

        vendor = detect_news_vendor(NEWS_API_KEY)
        if vendor == "newsdata":
            _news_provider = NewsDataProvider(NEWS_API_KEY)
        else:
            _news_provider = NewsApiOrgProvider(NEWS_API_KEY)

        log.info(
            "News provider: %s (configured=%s)",
            _news_provider.name,
            _news_provider.configured,
        )
    return _news_provider


def set_news_provider(provider: NewsProvider | None) -> None:
    """Override the active news provider. For tests and vendor switching."""
    global _news_provider
    _news_provider = provider
