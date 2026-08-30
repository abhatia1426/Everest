"""Regression tests for the quote pipeline's performance and honesty guarantees.

The behaviours here are the ones that made the app feel broken before:
concurrent requests serialising behind a global lock, a dead provider being
retried on every navigation, and cached prices being presented as current.

Run: .venv/bin/python -m pytest test_quote_pipeline.py -q
"""
import asyncio
import time

import pytest

from services import market


@pytest.fixture(autouse=True)
def clean_state():
    """Each test starts with an empty cache and a closed circuit."""
    market._cache.clear()
    market._inflight.clear()
    market._circuit.record_success()
    yield
    market._cache.clear()
    market._inflight.clear()
    market._circuit.record_success()


def _quote(symbol, price=100.0):
    return {
        "ticker": symbol,
        "price": price,
        "previous_close": 99.0,
        "change": 1.0,
        "change_percent": 1.01,
        "fetched_at": time.time(),
        "source": "live",
        "stale": False,
    }


# --------------------------------------------------------------- caching

def test_fresh_cache_makes_no_provider_call(monkeypatch):
    calls = []

    def fake_quote(symbol):
        calls.append(symbol)
        return _quote(symbol)

    monkeypatch.setattr(market, "_blocking_quote", fake_quote)

    asyncio.run(market.get_quotes(["AAPL"]))
    asyncio.run(market.get_quotes(["AAPL"]))

    assert calls == ["AAPL"], "second call inside the freshness window must not hit the provider"


def test_stale_cache_is_served_immediately_and_labelled(monkeypatch):
    monkeypatch.setattr(market, "_blocking_quote", lambda s: _quote(s))
    asyncio.run(market.get_quotes(["AAPL"]))

    # Age the entry past FRESH but inside the stale window.
    stamp, value = market._cache["quote:AAPL"]
    market._cache["quote:AAPL"] = (stamp - (market._QUOTE_FRESH_TTL + 5), value)

    result = asyncio.run(market.get_quotes(["AAPL"]))["AAPL"]

    assert result["price"] == 100.0, "a cached price is still shown"
    assert result["stale"] is True, "but it must never claim to be fresh"
    assert result["source"] == "cache"
    assert result["cache_age_seconds"] > market._QUOTE_FRESH_TTL


def test_quote_past_stale_window_is_not_served_as_a_price(monkeypatch):
    """The core honesty guarantee: an old price is never presented as current."""
    monkeypatch.setattr(market, "_blocking_quote", lambda s: _quote(s))
    asyncio.run(market.get_quotes(["AAPL"]))

    stamp, value = market._cache["quote:AAPL"]
    market._cache["quote:AAPL"] = (stamp - (market._QUOTE_STALE_TTL + 60), value)

    # Provider down AND the cache is beyond its usable life.
    monkeypatch.setattr(
        market, "_blocking_quote", lambda s: {"ticker": s, "price": None, "error": "429 Too Many Requests"}
    )
    for _ in range(market._CIRCUIT_FAILURE_THRESHOLD):
        market._circuit.record_failure()

    result = asyncio.run(market.get_quotes(["AAPL"]))["AAPL"]
    assert result["price"] is None, "an expired quote must be reported unavailable, not shown"
    assert result["source"] == "unavailable"


# --------------------------------------------------------- deduplication

def test_concurrent_requests_for_one_symbol_make_one_provider_call(monkeypatch):
    calls = []

    def slow_quote(symbol):
        calls.append(symbol)
        time.sleep(0.2)
        return _quote(symbol)

    monkeypatch.setattr(market, "_blocking_quote", slow_quote)

    async def hammer():
        return await asyncio.gather(*(market.get_quotes(["AAPL"]) for _ in range(6)))

    asyncio.run(hammer())
    assert len(calls) == 1, f"expected 1 de-duplicated provider call, got {len(calls)}"


def test_symbols_are_fetched_in_parallel_not_serially(monkeypatch):
    def slow_quote(symbol):
        time.sleep(0.3)
        return _quote(symbol)

    monkeypatch.setattr(market, "_blocking_quote", slow_quote)

    started = time.monotonic()
    asyncio.run(market.get_quotes(["AAPL", "MSFT", "NVDA", "TSLA"]))
    elapsed = time.monotonic() - started

    # Serial would be ~1.2s. Parallel should land near one round trip.
    assert elapsed < 0.8, f"symbols appear to be fetched serially ({elapsed:.2f}s for 4)"


def test_one_slow_symbol_does_not_block_an_unrelated_one(monkeypatch):
    """The old global lock made every caller wait for every other caller."""
    def variable_quote(symbol):
        time.sleep(0.5 if symbol == "SLOW" else 0.01)
        return _quote(symbol)

    monkeypatch.setattr(market, "_blocking_quote", variable_quote)

    async def scenario():
        slow = asyncio.create_task(market.get_quotes(["SLOW"]))
        await asyncio.sleep(0.05)
        started = time.monotonic()
        await market.get_quotes(["FAST"])
        fast_elapsed = time.monotonic() - started
        await slow
        return fast_elapsed

    assert asyncio.run(scenario()) < 0.3, "an unrelated symbol was blocked behind a slow one"


# ------------------------------------------------------- circuit breaker

def test_circuit_opens_after_repeated_provider_failures(monkeypatch):
    monkeypatch.setattr(
        market,
        "_blocking_quote",
        lambda s: {"ticker": s, "price": None, "error": "Expecting value: line 1 column 1 (char 0)"},
    )

    for i in range(market._CIRCUIT_FAILURE_THRESHOLD):
        asyncio.run(market.get_quotes([f"SYM{i}"]))

    assert market._circuit.is_open is True
    assert market.provider_status()["circuit_open"] is True


def test_open_circuit_stops_calling_the_provider(monkeypatch):
    calls = []

    def failing(symbol):
        calls.append(symbol)
        return {"ticker": symbol, "price": None, "error": "429 Too Many Requests"}

    monkeypatch.setattr(market, "_blocking_quote", failing)

    for i in range(market._CIRCUIT_FAILURE_THRESHOLD):
        asyncio.run(market.get_quotes([f"SYM{i}"]))

    before = len(calls)
    for _ in range(5):
        asyncio.run(market.get_quotes(["AAPL", "MSFT"]))

    assert len(calls) == before, "an open circuit must not issue further provider calls"


def test_circuit_recovers_after_cool_off(monkeypatch):
    for _ in range(market._CIRCUIT_FAILURE_THRESHOLD):
        market._circuit.record_failure()
    assert market._circuit.is_open is True

    market._circuit.opened_at -= market._CIRCUIT_OPEN_SECONDS + 1
    assert market._circuit.is_open is False, "circuit must half-open once cool-off elapses"


def test_healthy_response_resets_the_failure_count(monkeypatch):
    market._circuit.record_failure()
    market._circuit.record_failure()

    monkeypatch.setattr(market, "_blocking_quote", lambda s: _quote(s))
    asyncio.run(market.get_quotes(["AAPL"]))

    assert market._circuit.failures == 0


# ------------------------------------------------------------ provenance

def test_quote_carries_provenance(monkeypatch):
    monkeypatch.setattr(market, "_blocking_quote", lambda s: _quote(s))
    quote = asyncio.run(market.get_quotes(["AAPL"]))["AAPL"]

    for field in ("fetched_at", "source", "stale"):
        assert field in quote, f"quote is missing provenance field {field!r}"


def test_reference_fields_are_cached_separately_from_price(monkeypatch):
    """A price refresh must not re-download the company profile."""
    reference_calls = []

    def fake_reference(symbol):
        reference_calls.append(symbol)
        return {"company": "Apple Inc.", "sector": "Technology"}

    monkeypatch.setattr(market, "_blocking_reference", fake_reference)
    monkeypatch.setattr(
        market, "_blocking_price", lambda s: {"price": 100.0, "previous_close": 99.0}
    )

    market._blocking_quote("AAPL")
    market._blocking_quote("AAPL")
    market._blocking_quote("AAPL")

    assert len(reference_calls) == 1, "reference data should be fetched once, not per price refresh"
