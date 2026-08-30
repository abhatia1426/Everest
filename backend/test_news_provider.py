"""News pipeline: provider mapping, failure normalisation, and vendor isolation.

Every provider call is mocked; these must pass offline and without a key.

The bug that prompted these: `NEWS_API_KEY` holds a newsdata.io key (prefixed
`pub_`) while the code called newsapi.org, which rejected it with
`401 apiKeyInvalid`. That surfaced in the browser as "NewsAPI rejected the
configured key" — a third-party vendor name and failure mode rendered verbatim
to a user who cannot act on either.

Two guarantees are locked down here:
  1. the right vendor is selected from the key's own shape;
  2. no provider failure ever reaches the client as an error, a vendor name,
     or a raw exception string.
"""
import asyncio
import json

import httpx
import pytest

from services import news
from services.providers import (
    NewsApiOrgProvider,
    NewsDataProvider,
    ProviderAuthError,
    ProviderError,
    ProviderRateLimited,
    detect_news_vendor,
    set_news_provider,
)


class FakeResponse:
    def __init__(self, payload, status=200, text=None):
        self._payload = payload
        self.status_code = status
        self.text = text if text is not None else json.dumps(payload)

    def json(self):
        if self._payload is None:
            raise ValueError("no json")
        return self._payload


class FakeClient:
    """Async context manager standing in for httpx.AsyncClient."""

    def __init__(self, response):
        self._response = response
        self.calls = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_exc):
        return False

    async def get(self, url, params=None):
        self.calls.append({"url": url, "params": params})
        if isinstance(self._response, Exception):
            raise self._response
        return self._response


def newsdata(response, key="pub_testkey"):
    client = FakeClient(response)
    provider = NewsDataProvider(key, client_factory=lambda: client)
    return provider, client


@pytest.fixture(autouse=True)
def reset_provider():
    yield
    set_news_provider(None)


# ------------------------------------------------------- vendor selection

def test_newsdata_key_selects_newsdata(monkeypatch):
    """The exact regression: a `pub_` key must not be sent to newsapi.org."""
    monkeypatch.delenv("NEWS_PROVIDER", raising=False)
    assert detect_news_vendor("pub_96b6b5afee2441288a2ec3abfdc34681") == "newsdata"


def test_bare_hex_key_selects_newsapi(monkeypatch):
    monkeypatch.delenv("NEWS_PROVIDER", raising=False)
    assert detect_news_vendor("1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d") == "newsapi"


def test_explicit_env_override_wins(monkeypatch):
    monkeypatch.setenv("NEWS_PROVIDER", "newsapi")
    assert detect_news_vendor("pub_something") == "newsapi"
    monkeypatch.setenv("NEWS_PROVIDER", "newsdata")
    assert detect_news_vendor("1a2b3c4d") == "newsdata"


# ------------------------------------------------- successful response

SUCCESS = {
    "status": "success",
    "totalResults": 97,
    "results": [
        {
            "title": "Apple beats expectations",
            "description": "Strong quarter for iPhone.",
            "link": "https://example.com/a",
            "source_name": "Reuters",
            "pubDate": "2026-08-07 07:36:41",
            "image_url": "https://example.com/a.png",
        },
        {
            "title": "Analysts cut Apple target",
            "description": "Weakness in services.",
            "link": "https://example.com/b",
            "source_id": "bloomberg",
            "pubDate": "2026-08-07 06:10:00",
            "image_url": None,
        },
    ],
}


def test_successful_response_maps_to_the_app_article_shape():
    provider, _ = newsdata(FakeResponse(SUCCESS))
    articles = asyncio.run(provider.fetch_articles("Apple Inc"))

    assert len(articles) == 2
    assert set(articles[0]) == {"title", "description", "url", "source", "published_at", "image"}
    assert articles[0]["title"] == "Apple beats expectations"
    assert articles[0]["url"] == "https://example.com/a"
    assert articles[0]["source"] == "Reuters"
    assert articles[1]["source"] == "bloomberg", "falls back to source_id"


def test_pubdate_is_made_timezone_aware():
    """newsdata sends "2026-08-07 07:36:41" — naive, so browsers read it as local."""
    provider, _ = newsdata(FakeResponse(SUCCESS))
    published = asyncio.run(provider.fetch_articles("Apple"))[0]["published_at"]

    assert published == "2026-08-07T07:36:41+00:00"
    assert published.endswith("+00:00"), "a naive stamp renders hours adrift in the browser"


def test_unparseable_date_becomes_none_not_a_wrong_date():
    payload = {"status": "success", "results": [{"title": "T", "pubDate": "not a date"}]}
    provider, _ = newsdata(FakeResponse(payload))
    assert asyncio.run(provider.fetch_articles("x"))[0]["published_at"] is None


def test_articles_without_a_headline_are_dropped():
    payload = {"status": "success", "results": [{"title": "", "link": "x"}, {"title": "Real"}]}
    provider, _ = newsdata(FakeResponse(payload))
    articles = asyncio.run(provider.fetch_articles("x"))
    assert [a["title"] for a in articles] == ["Real"]


def test_api_key_is_sent_and_never_returned():
    provider, client = newsdata(FakeResponse(SUCCESS), key="pub_secret")
    articles = asyncio.run(provider.fetch_articles("Apple"))

    assert client.calls[0]["params"]["apikey"] == "pub_secret"
    assert "pub_secret" not in json.dumps(articles)


# ------------------------------------------------------- failure modes

def test_missing_key_raises_before_any_request():
    client = FakeClient(FakeResponse(SUCCESS))
    provider = NewsDataProvider("", client_factory=lambda: client)

    with pytest.raises(ProviderAuthError):
        asyncio.run(provider.fetch_articles("Apple"))
    assert client.calls == [], "no request should be attempted without a key"


def test_invalid_key_raises_permanent_auth_error():
    provider, _ = newsdata(FakeResponse({"status": "error"}, status=401))
    with pytest.raises(ProviderAuthError) as exc:
        asyncio.run(provider.fetch_articles("Apple"))
    assert exc.value.retryable is False


def test_rate_limit_raises_retryable():
    provider, _ = newsdata(FakeResponse({"status": "error"}, status=429))
    with pytest.raises(ProviderRateLimited) as exc:
        asyncio.run(provider.fetch_articles("Apple"))
    assert exc.value.retryable is True


def test_malformed_response_is_rejected_not_silently_empty():
    """A success status whose `results` is not a list is malformed, not empty."""
    provider, _ = newsdata(FakeResponse({"status": "success", "results": {"oops": 1}}))
    with pytest.raises(ProviderError):
        asyncio.run(provider.fetch_articles("Apple"))


def test_non_json_body_raises_provider_error():
    provider, _ = newsdata(FakeResponse(None, status=200, text="<html>gateway</html>"))
    with pytest.raises(ProviderError):
        asyncio.run(provider.fetch_articles("Apple"))


def test_error_payload_with_object_results_does_not_crash():
    """newsdata returns `results` as an OBJECT on errors, a list on success."""
    payload = {"status": "error", "results": {"message": "Invalid API key", "code": "Unauthorized"}}
    provider, _ = newsdata(FakeResponse(payload, status=400))
    with pytest.raises(ProviderError):
        asyncio.run(provider.fetch_articles("Apple"))


def test_timeout_raises_retryable():
    provider, _ = newsdata(httpx.TimeoutException("timed out"))
    with pytest.raises(ProviderError) as exc:
        asyncio.run(provider.fetch_articles("Apple"))
    assert exc.value.retryable is True


def test_empty_results_is_a_valid_answer_not_an_error():
    provider, _ = newsdata(FakeResponse({"status": "success", "results": []}))
    assert asyncio.run(provider.fetch_articles("Apple")) == []


# -------------------------------------------- newsapi.org implementation

def test_newsapi_org_maps_its_own_shape():
    payload = {
        "status": "ok",
        "articles": [
            {
                "title": "Apple rises",
                "description": "d",
                "url": "https://example.com/x",
                "source": {"name": "CNBC"},
                "publishedAt": "2026-08-07T07:36:41Z",
                "urlToImage": "https://example.com/x.png",
            }
        ],
    }
    client = FakeClient(FakeResponse(payload))
    provider = NewsApiOrgProvider("hexkey", client_factory=lambda: client)
    articles = asyncio.run(provider.fetch_articles("Apple"))

    assert articles[0]["source"] == "CNBC"
    assert articles[0]["published_at"] == "2026-08-07T07:36:41Z"


def test_newsapi_org_invalid_key_raises_auth_error():
    """The original failure, now a typed error rather than a user-facing string."""
    client = FakeClient(FakeResponse({"status": "error", "code": "apiKeyInvalid"}, status=401))
    provider = NewsApiOrgProvider("wrongkey", client_factory=lambda: client)

    with pytest.raises(ProviderAuthError):
        asyncio.run(provider.fetch_articles("Apple"))


# ------------------------------------ service-level normalisation (the UI contract)

class StubProvider:
    name = "stub"

    def __init__(self, result=None, error=None, configured=True):
        self._result = result if result is not None else []
        self._error = error
        self._configured = configured

    @property
    def configured(self):
        return self._configured

    async def fetch_articles(self, query, *, limit=10):
        if self._error:
            raise self._error
        return self._result


def run_news(provider, symbol="AAPL", company="Apple Inc"):
    set_news_provider(provider)
    return asyncio.run(news.get_company_news(symbol, company))


@pytest.mark.parametrize(
    "provider,expected_status",
    [
        (StubProvider(result=[{"title": "T", "description": "d"}]), "ok"),
        (StubProvider(result=[]), "no_articles"),
        (StubProvider(error=ProviderRateLimited("limit")), "provider_unavailable"),
        (StubProvider(error=ProviderError("boom")), "provider_unavailable"),
        (StubProvider(error=ProviderAuthError("bad key")), "not_configured"),
        (StubProvider(configured=False), "not_configured"),
        (StubProvider(error=RuntimeError("totally unexpected")), "provider_unavailable"),
    ],
)
def test_every_failure_mode_returns_a_normalised_status(provider, expected_status):
    result = run_news(provider)
    assert result["status"] == expected_status
    # Always a complete, serialisable payload — never a partial one.
    assert isinstance(result["articles"], list)
    assert set(result["counts"]) == {"positive", "neutral", "negative"}
    json.dumps(result)


@pytest.mark.parametrize(
    "provider",
    [
        StubProvider(error=ProviderAuthError("newsapi.org rejected the key")),
        StubProvider(error=ProviderError("newsdata.io error: Invalid API key")),
        StubProvider(error=ProviderRateLimited("newsapi.org rate limit")),
    ],
)
def test_no_vendor_name_or_raw_error_reaches_the_client(provider):
    """The specific defect: "NewsAPI rejected the configured key" on screen."""
    body = json.dumps(run_news(provider)).lower()

    for leak in ("newsapi", "newsdata", "apikeyinvalid", "traceback", "401", "http"):
        assert leak not in body, f"provider detail {leak!r} leaked to the client"


def test_service_never_raises_even_on_an_unexpected_error():
    """News must never be able to break the company detail page."""
    result = run_news(StubProvider(error=RuntimeError("kaboom")))
    assert result["status"] == "provider_unavailable"
    assert result["articles"] == []


def test_sentiment_is_applied_and_counted():
    articles = [
        {"title": "Profits surge and beat estimates", "description": "record growth"},
        {"title": "Shares plunge on weak guidance", "description": "loss widens"},
    ]
    result = run_news(StubProvider(result=articles))

    assert result["status"] == "ok"
    assert sum(result["counts"].values()) == 2
    for article in result["articles"]:
        assert "sentiment" in article


# ----------------------------------------------------------- query building

def test_query_prefers_company_name_over_bare_ticker():
    """Single-letter tickers like V or ON are useless as search terms."""
    assert news.build_query("AAPL", "Apple Inc") == "Apple Inc"
    assert news.build_query("V", "Visa Inc") == "Visa Inc"


def test_query_falls_back_to_ticker_when_no_profile():
    assert news.build_query("AAPL", None) == "AAPL"
    assert news.build_query("AAPL", "AAPL") == "AAPL"
