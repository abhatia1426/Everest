"""Finnhub provider: response mapping and failure semantics.

Every Finnhub call is mocked. These tests must never touch the network — they
have to pass in CI, offline, and without a valid key.

The mapping assertions are not ceremony. Three of Finnhub's conventions differ
from the app's and each one, gotten wrong, produces a plausible-looking wrong
number on a financial screen:

  * an unknown symbol returns HTTP 200 with all-zero fields, which renders as
    "$0.00" if passed through;
  * market cap and volumes are denominated in millions;
  * dividend yield is already a percentage, where the app expects a fraction.
"""
import json
import time

import pytest
import requests

from services.providers import (
    FinnhubProvider,
    ProviderAuthError,
    ProviderError,
    ProviderFeatureUnavailable,
    ProviderRateLimited,
)


class FakeResponse:
    def __init__(self, payload, status=200, headers=None, text=None):
        self._payload = payload
        self.status_code = status
        self.headers = headers or {}
        self.text = text if text is not None else json.dumps(payload)

    def json(self):
        if self._payload is None:
            raise ValueError("no json")
        return self._payload


class FakeSession:
    """Records calls and replays queued responses."""

    def __init__(self, responses):
        self._responses = list(responses) if isinstance(responses, list) else [responses]
        self.calls = []

    def mount(self, *_args, **_kwargs):
        pass

    def get(self, url, params=None, timeout=None):
        self.calls.append({"url": url, "params": params, "timeout": timeout})
        response = self._responses[min(len(self.calls) - 1, len(self._responses) - 1)]
        if isinstance(response, Exception):
            raise response
        return response


def provider(responses):
    return FinnhubProvider(api_key="test-key", session=FakeSession(responses))


# --------------------------------------------------------- valid quote

REAL_QUOTE = {"c": 313.13, "d": 0.72, "dp": 0.2305, "h": 314.81,
              "l": 310.74, "o": 311.835, "pc": 312.41, "t": 1786130559}


def test_valid_quote_maps_every_documented_field():
    result = provider(FakeResponse(REAL_QUOTE)).fetch_quote("AAPL")

    assert result["price"] == 313.13              # c
    assert result["change"] == 0.72               # d
    assert result["change_percent"] == 0.2305     # dp
    assert result["previous_close"] == 312.41     # pc
    assert result["market_timestamp"] == 1786130559  # t
    assert result["open"] == 311.835
    assert result["day_high"] == 314.81
    assert result["day_low"] == 310.74


def test_quote_reports_no_volume_rather_than_guessing():
    """/quote carries no volume field; inventing one would be fabrication."""
    assert provider(FakeResponse(REAL_QUOTE)).fetch_quote("AAPL")["volume"] is None


def test_api_key_is_sent_and_never_returned():
    fake = FakeSession(FakeResponse(REAL_QUOTE))
    result = FinnhubProvider(api_key="secret-key", session=fake).fetch_quote("AAPL")

    assert fake.calls[0]["params"]["token"] == "secret-key"
    assert "secret-key" not in json.dumps(result), "the key must never reach a response body"


# ------------------------------------------------- unknown symbol quirk

def test_unknown_symbol_returns_no_price_not_zero():
    """Finnhub answers HTTP 200 with all zeros for a symbol it does not know.

    Passed through, that renders as a real $0.00 price.
    """
    zero = {"c": 0, "d": None, "dp": None, "h": 0, "l": 0, "o": 0, "pc": 0, "t": 0}
    result = provider(FakeResponse(zero)).fetch_quote("ZZZZINVALID")

    assert result["price"] is None, "a zero quote must never be reported as a price"
    assert result["market_timestamp"] is None


def test_missing_fields_degrade_to_none():
    result = provider(FakeResponse({"c": 100.0, "t": 1786130559})).fetch_quote("AAPL")

    assert result["price"] == 100.0
    for field in ("previous_close", "change", "change_percent", "open", "day_high", "day_low"):
        assert result[field] is None, f"{field} should be None when absent"


def test_non_numeric_fields_do_not_raise():
    noisy = {"c": "313.13", "d": "n/a", "dp": None, "pc": "", "t": 1786130559}
    result = provider(FakeResponse(noisy)).fetch_quote("AAPL")

    assert result["price"] == 313.13
    assert result["change"] is None
    assert result["previous_close"] is None


# ------------------------------------------------------- failure modes

def test_rate_limit_raises_retryable_error():
    with pytest.raises(ProviderRateLimited) as exc:
        provider(FakeResponse({}, status=429, headers={"Retry-After": "30"})).fetch_quote("AAPL")

    assert exc.value.retryable is True
    assert exc.value.retry_after == 30


def test_invalid_api_key_raises_permanent_error():
    """A bad key fails identically forever, so it must not look transient."""
    response = FakeResponse({"error": "Invalid API key."}, status=401)
    with pytest.raises(ProviderAuthError) as exc:
        provider(response).fetch_quote("AAPL")

    assert exc.value.retryable is False


def test_missing_api_key_fails_before_any_network_call():
    fake = FakeSession(FakeResponse(REAL_QUOTE))
    with pytest.raises(ProviderAuthError):
        FinnhubProvider(api_key="", session=fake).fetch_quote("AAPL")

    assert fake.calls == [], "no request should be attempted without a key"


def test_timeout_is_retryable():
    with pytest.raises(ProviderError) as exc:
        provider(requests.Timeout("timed out")).fetch_quote("AAPL")

    assert exc.value.retryable is True
    assert "timed out" in str(exc.value).lower()


def test_connection_error_is_retryable():
    with pytest.raises(ProviderError) as exc:
        provider(requests.ConnectionError("refused")).fetch_quote("AAPL")
    assert exc.value.retryable is True


def test_server_error_is_retryable():
    with pytest.raises(ProviderError) as exc:
        provider(FakeResponse({}, status=503)).fetch_quote("AAPL")
    assert exc.value.retryable is True


def test_non_json_body_is_reported_as_provider_error():
    with pytest.raises(ProviderError):
        provider(FakeResponse(None, status=200, text="<html>gateway</html>")).fetch_quote("AAPL")


# -------------------------------------------------- candles / plan limit

def test_candles_unavailable_on_free_plan_raises_feature_error():
    """The live condition: /stock/candle returns 403 for free accounts."""
    response = FakeResponse({"error": "You don't have access to this resource."}, status=403)
    with pytest.raises(ProviderFeatureUnavailable) as exc:
        provider(response).fetch_candles("AAPL", "D", 0, 1)

    assert exc.value.retryable is False
    assert exc.value.feature == "historical candles"


def test_candles_map_to_the_app_candle_shape():
    payload = {
        "s": "ok",
        "t": [1786000000, 1786086400],
        "o": [100.0, 102.0],
        "h": [103.0, 104.0],
        "l": [99.0, 101.0],
        "c": [102.0, 103.5],
        "v": [1000, 2000],
    }
    candles = provider(FakeResponse(payload)).fetch_candles("AAPL", "D", 0, 1)

    assert len(candles) == 2
    assert set(candles[0]) == {"time", "open", "high", "low", "close", "volume"}
    assert candles[0]["close"] == 102.0
    assert candles[0]["volume"] == 1000
    assert candles[0]["time"].startswith("20"), "time must be an ISO string"


def test_no_data_window_returns_empty_list():
    assert provider(FakeResponse({"s": "no_data"})).fetch_candles("AAPL", "D", 0, 1) == []


# ----------------------------------------------------- reference units

def test_market_cap_and_volume_are_converted_from_millions():
    """Finnhub reports these in millions; the app expects absolute units."""
    responses = [
        FakeResponse({"name": "Apple Inc", "finnhubIndustry": "Technology",
                      "exchange": "NASDAQ", "currency": "USD",
                      "marketCapitalization": 4_559_367.68, "shareOutstanding": 14_687.36}),
        FakeResponse({"metric": {"10DayAverageTradingVolume": 65.098,
                                 "peTTM": 35.43, "epsTTM": 8.72, "beta": 1.08,
                                 "52WeekHigh": 344.57, "52WeekLow": 205.59}}),
    ]
    reference = provider(responses).fetch_reference("AAPL")

    assert reference["market_cap"] == pytest.approx(4.55936768e12), "should be ~$4.56T, not $4.5M"
    assert reference["shares_outstanding"] == pytest.approx(14_687_360_000)
    assert reference["avg_volume"] == pytest.approx(65_098_000)
    assert reference["pe_ratio"] == 35.43
    assert reference["fifty_two_week_high"] == 344.57


def test_dividend_yield_is_converted_from_percent_to_fraction():
    """Finnhub gives 0.3457 meaning 0.35%; the app's normaliser expects a fraction.

    Passing it through unchanged renders AAPL's dividend yield as 34.57%.
    """
    responses = [
        FakeResponse({"name": "Apple Inc"}),
        FakeResponse({"metric": {"dividendYieldIndicatedAnnual": 0.3457}}),
    ]
    reference = provider(responses).fetch_reference("AAPL")

    assert reference["dividend_yield"] == pytest.approx(0.003457)
    # What the (unchanged) frontend will display:
    displayed = reference["dividend_yield"] * 100
    assert displayed == pytest.approx(0.3457), f"UI would show {displayed:.2f}%"


def test_reference_survives_partial_endpoint_failure():
    """Fundamentals being unavailable must not lose the company name."""
    responses = [
        FakeResponse({"name": "Apple Inc", "finnhubIndustry": "Technology"}),
        FakeResponse({"error": "no access"}, status=403),
    ]
    reference = provider(responses).fetch_reference("AAPL")

    assert reference["company"] == "Apple Inc"
    assert reference["sector"] == "Technology"
    assert reference["pe_ratio"] is None


def test_profile_reports_no_summary_rather_than_inventing_one():
    """Finnhub's free profile has no business description."""
    result = provider(FakeResponse({"name": "Apple Inc", "finnhubIndustry": "Technology"})).fetch_profile("AAPL")

    assert result["company"] == "Apple Inc"
    assert result["summary"] is None


# ------------------------------------------- integration with market.py

def test_stale_cache_is_served_when_provider_starts_failing(monkeypatch):
    """The end-to-end guarantee: a good quote survives a later outage."""
    import asyncio

    from services import market

    market._cache.clear()
    market._inflight.clear()
    market._circuit.record_success()

    healthy = {
        "price": 313.13, "previous_close": 312.41, "change": 0.72,
        "change_percent": 0.2305, "open": 311.8, "day_high": 314.8,
        "day_low": 310.7, "volume": None, "market_timestamp": 1786130559,
    }
    monkeypatch.setattr(market, "_blocking_reference", lambda s: {"company": "Apple Inc"})
    monkeypatch.setattr(market, "_blocking_price", lambda s: healthy)

    first = asyncio.run(market.get_quotes(["AAPL"]))["AAPL"]
    assert first["price"] == 313.13
    assert first["stale"] is False

    # Provider now fails; age the cache past freshness.
    def rate_limited(_symbol):
        raise ProviderRateLimited("Finnhub rate limit reached.")

    monkeypatch.setattr(market, "_blocking_price", rate_limited)
    stamp, value = market._cache["quote:AAPL"]
    market._cache["quote:AAPL"] = (stamp - (market._QUOTE_FRESH_TTL + 5), value)

    second = asyncio.run(market.get_quotes(["AAPL"]))["AAPL"]
    assert second["price"] == 313.13, "last good price is still shown"
    assert second["stale"] is True, "but never labelled live"
    assert second["source"] == "cache"

    market._cache.clear()
    market._circuit.record_success()


def test_permanent_failures_do_not_trip_the_circuit_breaker(monkeypatch):
    """A bad key must stay visible, not be hidden behind a cool-off timer."""
    import asyncio

    from services import market

    market._cache.clear()
    market._inflight.clear()
    market._circuit.record_success()

    def bad_key(_symbol):
        raise ProviderAuthError("Finnhub rejected the API key.")

    monkeypatch.setattr(market, "_blocking_reference", lambda s: {})
    monkeypatch.setattr(market, "_blocking_price", bad_key)

    for symbol in ("AAPL", "MSFT", "NVDA", "TSLA", "AMZN"):
        asyncio.run(market.get_quotes([symbol]))

    assert market._circuit.is_open is False, "auth failure must not look like an outage"

    market._cache.clear()
    market._circuit.record_success()
