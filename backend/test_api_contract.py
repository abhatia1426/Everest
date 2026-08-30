"""The API's response contract: every response is JSON, in every failure mode.

These exist because of a real outage. A refactor of services/market.py dropped
the module-level `PERIOD_MAP` constant, so `get_history` raised

    NameError: name 'PERIOD_MAP' is not defined

and three endpoints — /watchlist, /portfolio/history and
/prices/{ticker}/history — returned Starlette's plain-text `Internal Server
Error`. The frontend parses every body as JSON, so the user saw a JSON syntax
error and no indication that the server had crashed at all.

Two classes of test guard against a repeat:

  1. the module's public surface is present and importable, so a deleted
     constant fails here instead of at request time;
  2. an unhandled exception still produces a JSON body.

Run: .venv/bin/python -m pytest test_api_contract.py -q
"""
import asyncio
import json

import pytest
from fastapi.testclient import TestClient

from services import market


# ------------------------------------------------------- module surface

def test_period_map_exists_and_is_populated():
    """The exact regression: this constant vanished in a refactor."""
    assert hasattr(market, "PERIOD_MAP"), "market.PERIOD_MAP is missing"
    assert market.PERIOD_MAP, "market.PERIOD_MAP must not be empty"


@pytest.mark.parametrize("period", ["1h", "1d", "1w", "1m", "3m", "6m", "1y", "all"])
def test_every_supported_period_maps_to_a_provider_pair(period):
    """The frontend's range selectors send exactly these values.

    The KEYS are the app's contract and must never change. The values are
    provider-specific — (resolution, lookback-seconds) for Finnhub, previously
    (period, interval) strings for yfinance — so only their shape is asserted.
    """
    assert period in market.PERIOD_MAP, f"period {period!r} is not supported"
    resolution, lookback = market.PERIOD_MAP[period]
    assert isinstance(resolution, str) and resolution
    assert isinstance(lookback, int) and lookback > 0


@pytest.mark.parametrize(
    "name",
    [
        # Referenced by routers; deleting any of these breaks a live endpoint.
        "PERIOD_MAP",
        "get_quotes",
        "get_history",
        "get_sparkline",
        "get_profile",
        "resolve_symbol",
        "validate_symbol",
        "quote_unavailable",
        "provider_is_down",
        "is_valid_ticker",
        "estimate_option_value",
        "provider_status",
    ],
)
def test_public_surface_is_intact(name):
    assert hasattr(market, name), f"services.market.{name} is missing"


def test_routers_import_cleanly():
    """A NameError at module scope must surface here, not on a user request."""
    import importlib

    for module in (
        "routers.prices",
        "routers.portfolio",
        "routers.watchlist",
        "routers.options",
        "routers.activity",
    ):
        importlib.import_module(module)


# ------------------------------------------------- history path end-to-end

def test_get_history_does_not_raise_on_unknown_period(monkeypatch):
    """An unmapped period must fall back, not explode."""
    monkeypatch.setattr(market, "_blocking_history", lambda *a, **k: [])
    result = asyncio.run(market.get_history("AAPL", "not-a-period"))
    assert result == []


def test_get_history_survives_provider_failure(monkeypatch):
    """Provider outage is the normal case in development."""
    def boom(*_args, **_kwargs):
        raise RuntimeError("Expecting value: line 1 column 1 (char 0)")

    monkeypatch.setattr(market, "_blocking_history", boom)

    with pytest.raises(RuntimeError):
        # The service itself propagates; the ROUTER is what must not 500 in
        # plain text — covered by the JSON-contract tests below.
        asyncio.run(market.get_history("AAPL", "1m"))


def test_sparkline_is_empty_not_broken_when_history_is_empty(monkeypatch):
    monkeypatch.setattr(market, "_blocking_history", lambda *a, **k: [])
    assert asyncio.run(market.get_sparkline("AAPL")) == []


# --------------------------------------------------- JSON error contract

@pytest.fixture
def client():
    from main import app

    # raise_server_exceptions=False so the handler runs, as it does in
    # production, instead of the exception propagating into the test.
    return TestClient(app, raise_server_exceptions=False)


def test_unhandled_exception_returns_json_not_plain_text(client):
    """The specific failure the user reported."""
    from main import app

    @app.get("/__boom_test__")
    async def _boom():
        raise RuntimeError("simulated failure")

    response = client.get("/__boom_test__")

    assert response.status_code == 500
    assert response.headers["content-type"].startswith("application/json")

    # Must parse. Before the fix the body was literally `Internal Server Error`.
    body = json.loads(response.content)
    assert "detail" in body
    assert body["error_type"] == "RuntimeError"
    assert body["path"] == "/__boom_test__"


def test_error_body_does_not_leak_exception_text(client):
    """Exception strings can carry connection strings and file paths."""
    from main import app

    @app.get("/__leak_test__")
    async def _leak():
        raise RuntimeError("mongodb://user:hunter2@cluster.internal/everest")

    body = json.loads(client.get("/__leak_test__").content)
    assert "hunter2" not in json.dumps(body)
    assert "mongodb://" not in json.dumps(body)


def test_health_endpoint_is_json(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


# ------------------------------------ the four operating modes, end to end

def _healthy_quote(symbol, price=178.5):
    import time as _time

    return {
        "ticker": symbol,
        "company": f"{symbol} Inc.",
        "sector": "Technology",
        "price": price,
        "previous_close": price - 2.0,
        "change": 2.0,
        "change_percent": 1.13,
        "open": price - 1.0,
        "day_high": price + 1.0,
        "day_low": price - 3.0,
        "volume": 51_000_000,
        "fetched_at": _time.time(),
        "market_timestamp": _time.time(),
        "source": "live",
        "stale": False,
    }


def _candles(n=30):
    return [
        {
            "time": f"2026-07-{(i % 28) + 1:02d}T00:00:00",
            "open": 100.0 + i,
            "high": 101.0 + i,
            "low": 99.0 + i,
            "close": 100.5 + i,
            "volume": 1_000_000,
        }
        for i in range(n)
    ]


@pytest.mark.parametrize(
    "scenario,quote_factory,history_factory",
    [
        # Normal operation: provider healthy, fresh prices, real candles.
        ("normal", lambda s: _healthy_quote(s), lambda *a, **k: _candles()),
        # Stale: a real price, correctly flagged as cached rather than live.
        (
            "stale",
            lambda s: {**_healthy_quote(s), "stale": True, "source": "cache",
                       "cache_age_seconds": 240.0},
            lambda *a, **k: _candles(),
        ),
        # Provider failure: no price at all, and no history.
        (
            "provider_down",
            lambda s: {"ticker": s, "price": None, "source": "unavailable",
                       "stale": True, "error": "429 Too Many Requests"},
            lambda *a, **k: [],
        ),
    ],
)
def test_market_layer_returns_serialisable_data_in_every_mode(
    monkeypatch, scenario, quote_factory, history_factory
):
    """Whatever the provider does, what we hand the router must serialise."""
    monkeypatch.setattr(market, "_blocking_quote", quote_factory)
    monkeypatch.setattr(market, "_blocking_history", history_factory)
    market._cache.clear()
    market._circuit.record_success()

    quotes = asyncio.run(market.get_quotes(["AAPL", "MSFT", "NVDA", "TSLA"]))
    history = asyncio.run(market.get_history("AAPL", "1m"))
    sparkline = asyncio.run(market.get_sparkline("AAPL"))

    # The real assertion: json.dumps is exactly what FastAPI will attempt, and
    # a non-serialisable value here is a 500 with a plain-text body.
    for payload in (quotes, history, sparkline):
        json.dumps(payload)

    assert set(quotes) == {"AAPL", "MSFT", "NVDA", "TSLA"}, f"{scenario}: missing symbols"

    for symbol, quote in quotes.items():
        assert quote["ticker"] == symbol
        if scenario == "provider_down":
            assert quote["price"] is None, "a failed quote must not carry a price"
        else:
            assert isinstance(quote["price"], (int, float))
            # Honesty: a cached price must never claim to be live.
            assert quote.get("stale") is (scenario == "stale")


def test_stale_quote_is_never_labelled_live(monkeypatch):
    monkeypatch.setattr(market, "_blocking_quote", lambda s: _healthy_quote(s))
    market._cache.clear()
    market._circuit.record_success()

    asyncio.run(market.get_quotes(["AAPL"]))
    stamp, value = market._cache["quote:AAPL"]
    market._cache["quote:AAPL"] = (stamp - (market._QUOTE_FRESH_TTL + 30), value)

    quote = asyncio.run(market.get_quotes(["AAPL"]))["AAPL"]
    assert quote["stale"] is True
    assert quote["source"] == "cache"
    assert quote["price"] is not None, "a stale price is still shown, just labelled"
