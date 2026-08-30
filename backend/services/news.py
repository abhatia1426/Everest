"""News orchestration: query building, provider failure normalisation, sentiment.

The router is deliberately thin. This module decides what to ask for, what a
failure MEANS, and hands back one shape the router serialises unchanged.

FAILURE POLICY
--------------
A news outage is not an application error. The rest of the company detail page
— price, chart, statistics, your position — is perfectly usable without
headlines, so a news failure returns HTTP 200 with an empty article list and a
machine-readable `status`, rather than an error that the UI renders as a
red "Something slipped" panel over a working page.

`status` is the contract with the frontend, and it is vendor-neutral by design:

    ok                     articles present
    no_articles            provider answered, nothing matched
    provider_unavailable   transient: outage, timeout, rate limit
    not_configured         no API key set — an operator problem, not a user one

The frontend maps these to copy. It never sees a vendor name, an HTTP status
from a third party, or an exception string.
"""
import logging

from services import sentiment
from services.providers import (
    ProviderAuthError,
    ProviderError,
    ProviderRateLimited,
    get_news_provider,
)

log = logging.getLogger("everest.news")

MAX_ARTICLES = 10

# newsdata.io issues `pub_`-prefixed keys; newsapi.org issues bare 32-char hex.
# Used only to report whether the configured key LOOKS like the vendor we would
# route it to — never to validate or transmit it.
_KEY_SHAPES = {
    "newsdata.io": lambda key: key.startswith("pub_") and len(key) > 20,
    "newsapi.org": lambda key: key.isalnum() and len(key) >= 32,
}


def news_diagnostics() -> dict:
    """Configuration health for the news provider.

    Mirrors the frontend's `logoDiagnostics()`: answers "is it set up, and does
    it look right" WITHOUT printing, returning, or logging the key itself. The
    original bug was a valid key pointed at the wrong vendor, which no boolean
    could have caught — so `providerSelected` is reported too.
    """
    from config import NEWS_API_KEY

    provider = get_news_provider()
    key = NEWS_API_KEY or ""
    shape = _KEY_SHAPES.get(provider.name)

    report = {
        "newsProviderConfigured": bool(key),
        "newsProviderValidFormat": bool(key and shape and shape(key)),
        "providerSelected": provider.name,
    }

    if not report["newsProviderConfigured"]:
        report["fix"] = "Set NEWS_API_KEY in backend/.env."
    elif not report["newsProviderValidFormat"]:
        report["fix"] = (
            f"The configured key does not look like a {provider.name} key. "
            "newsdata.io keys start with 'pub_'; newsapi.org keys are 32-character hex. "
            "Set NEWS_PROVIDER to override auto-detection."
        )
    return report


def build_query(symbol: str, company: str | None) -> str:
    """What to ask the provider for.

    Company name when we have a real one, falling back to the ticker. Bare
    tickers make poor search terms — "V" or "ON" match almost anything — so the
    name is strongly preferred, and the ticker is only used alone when no
    profile is available.

    Deliberately simple: newsdata.io's free tier does not honour quoted phrase
    or boolean syntax, so constructing `'"Apple Inc" OR "AAPL"'` produced worse
    results than the plain company name, not better.
    """
    name = (company or "").strip()
    if name and name.upper() != symbol.upper():
        return name
    return symbol


def _empty(symbol: str, company: str, status: str, message: str | None = None) -> dict:
    return {
        "ticker": symbol,
        "company": company,
        "articles": [],
        "counts": {"positive": 0, "neutral": 0, "negative": 0},
        "status": status,
        "message": message,
    }


async def get_company_news(symbol: str, company: str | None = None) -> dict:
    """Recent news for one company, with sentiment. Never raises."""
    symbol = symbol.upper().strip()
    display_company = company or symbol

    provider = get_news_provider()

    if not provider.configured:
        # An operator problem. Say so plainly, without naming a vendor.
        return _empty(
            symbol,
            display_company,
            "not_configured",
            "News is not configured on this server.",
        )

    try:
        raw_articles = await provider.fetch_articles(
            build_query(symbol, company), limit=MAX_ARTICLES
        )
    except ProviderAuthError:
        # The full reason is logged; the client is told it is a configuration
        # problem, not that "NewsAPI rejected the configured key".
        log.exception("News provider rejected credentials (provider=%s)", provider.name)
        return _empty(
            symbol,
            display_company,
            "not_configured",
            "News is not configured correctly on this server.",
        )
    except ProviderRateLimited:
        log.warning("News provider rate limited (provider=%s)", provider.name)
        return _empty(
            symbol,
            display_company,
            "provider_unavailable",
            "News is temporarily unavailable. Try again shortly.",
        )
    except ProviderError:
        log.exception("News provider failed (provider=%s)", provider.name)
        return _empty(
            symbol,
            display_company,
            "provider_unavailable",
            "News is temporarily unavailable. Try again shortly.",
        )
    except Exception:  # noqa: BLE001 - a news failure must never break the page
        log.exception("Unexpected news failure (provider=%s)", provider.name)
        return _empty(
            symbol,
            display_company,
            "provider_unavailable",
            "News is temporarily unavailable. Try again shortly.",
        )

    articles = []
    for raw in raw_articles:
        title = raw.get("title") or ""
        description = raw.get("description") or ""
        articles.append({**raw, **sentiment.tag_article(title, description)})

    counts = {"positive": 0, "neutral": 0, "negative": 0}
    for article in articles:
        tag = article.get("sentiment")
        if tag in counts:
            counts[tag] += 1

    if not articles:
        return _empty(symbol, display_company, "no_articles")

    return {
        "ticker": symbol,
        "company": display_company,
        "articles": articles,
        "counts": counts,
        "status": "ok",
        "message": None,
    }
