"""Regression tests: a market-data provider outage must not be reported as an
unknown ticker. Yahoo rate-limits (HTTP 429) are common and the difference is
the whole message the user reads.

Run: .venv/bin/python -m pytest test_market_errors.py -q
"""
import asyncio

from services import market


def test_unavailable_reason_flags_rate_limit():
    quote = {"ticker": "AAPL", "price": None, "error": "429 Client Error: Too Many Requests"}
    assert market.quote_unavailable(quote) is True
    assert market.provider_is_down(quote) is True


def test_unavailable_reason_flags_json_decode_failure():
    # A provider serving an HTML error page surfaces as a JSON decode failure.
    quote = {"ticker": "AAPL", "price": None, "error": "Expecting value: line 1 column 1 (char 0)"}
    assert market.provider_is_down(quote) is True


def test_unknown_symbol_is_not_a_provider_outage():
    quote = {"ticker": "NOTAREALTICKER", "price": None}
    assert market.quote_unavailable(quote) is True
    assert market.provider_is_down(quote) is False


def test_healthy_quote_is_available():
    quote = {"ticker": "AAPL", "price": 231.4}
    assert market.quote_unavailable(quote) is False
    assert market.provider_is_down(quote) is False


def test_validate_symbol_raises_503_when_provider_is_down(monkeypatch):
    from fastapi import HTTPException

    async def fake_quotes(tickers):
        return {t: {"ticker": t, "price": None, "error": "429 Too Many Requests"} for t in tickers}

    monkeypatch.setattr(market, "get_quotes", fake_quotes)

    try:
        asyncio.run(market.validate_symbol("AAPL"))
    except HTTPException as exc:
        assert exc.status_code == 503, f"expected 503 for provider outage, got {exc.status_code}"
        assert "AAPL" not in exc.detail or "not" not in exc.detail.lower()
    else:
        raise AssertionError("expected HTTPException")


def test_validate_symbol_raises_404_for_unknown_symbol(monkeypatch):
    from fastapi import HTTPException

    async def fake_quotes(tickers):
        return {t: {"ticker": t, "price": None} for t in tickers}

    monkeypatch.setattr(market, "get_quotes", fake_quotes)

    try:
        asyncio.run(market.validate_symbol("NOTAREAL"))
    except HTTPException as exc:
        assert exc.status_code == 404, f"expected 404 for unknown symbol, got {exc.status_code}"
    else:
        raise AssertionError("expected HTTPException")


def test_profile_degrades_instead_of_raising(monkeypatch):
    """A provider outage must not turn into a 500 for profile consumers."""
    # Patch the PROVIDER, not a vendor module: this test is about the app's
    # degradation policy, which must hold for whichever provider is wired in.
    class BrokenProvider:
        name = "broken"

        def fetch_profile(self, symbol):
            raise ValueError("Expecting value: line 1 column 1 (char 0)")

    from services import providers

    monkeypatch.setattr(providers, "get_provider", lambda: BrokenProvider())
    monkeypatch.setattr(market, "get_provider", lambda: BrokenProvider())

    profile = market._blocking_profile("AAPL")
    assert profile["ticker"] == "AAPL"
    assert profile["company"] == "AAPL"
    assert profile["sector"] is None
    assert "error" in profile
