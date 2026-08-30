"""Twelve Data historical candles: mapping and failure semantics.

All calls mocked — these must pass offline and without a key.

Three of Twelve Data's conventions differ from what the charts expect, and each
one silently produces an empty or wrong chart rather than an error:

  * bars come back NEWEST FIRST;
  * every numeric field is a STRING;
  * failures are returned as HTTP 200 with an error body.
"""
import json

import pytest
import requests

from services.providers import (
    ProviderAuthError,
    ProviderError,
    ProviderRateLimited,
    TwelveDataProvider,
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


class FakeSession:
    def __init__(self, response):
        self._response = response
        self.calls = []

    def mount(self, *_a, **_kw):
        pass

    def get(self, url, params=None, timeout=None):
        self.calls.append({"url": url, "params": params})
        if isinstance(self._response, Exception):
            raise self._response
        return self._response


def provider(response, key="td-test-key"):
    session = FakeSession(response)
    return TwelveDataProvider(api_key=key, session=session), session


VALUES_NEWEST_FIRST = {
    "meta": {"symbol": "AAPL", "interval": "1day"},
    "status": "ok",
    "values": [
        {"datetime": "2026-08-06", "open": "312.0", "high": "315.5", "low": "311.0",
         "close": "313.2", "volume": "51000000"},
        {"datetime": "2026-08-05", "open": "308.0", "high": "312.0", "low": "307.5",
         "close": "311.4", "volume": "48000000"},
        {"datetime": "2026-08-04", "open": "305.0", "high": "309.0", "low": "304.0",
         "close": "308.1", "volume": "44000000"},
    ],
}


# ------------------------------------------------------------ valid candles

def test_valid_candles_map_to_the_app_shape():
    p, _ = provider(FakeResponse(VALUES_NEWEST_FIRST))
    candles = p.fetch_candles("AAPL", "1day", 0, 86400 * 3)

    assert len(candles) == 3
    for candle in candles:
        assert set(candle) == {"time", "open", "high", "low", "close", "volume"}


def test_string_numerics_are_coerced():
    """Every field arrives as a string; unconverted, the chart plots nothing."""
    p, _ = provider(FakeResponse(VALUES_NEWEST_FIRST))
    candle = p.fetch_candles("AAPL", "1day", 0, 86400 * 3)[-1]

    assert isinstance(candle["close"], float) and candle["close"] == 313.2
    assert isinstance(candle["open"], float)
    assert isinstance(candle["volume"], int) and candle["volume"] == 51_000_000


def test_candles_are_returned_oldest_first():
    """Twelve Data sends newest-first; the charts assume the opposite."""
    p, _ = provider(FakeResponse(VALUES_NEWEST_FIRST))
    times = [c["time"] for c in p.fetch_candles("AAPL", "1day", 0, 86400 * 3)]

    assert times == sorted(times), "candles must be ascending in time"
    assert times[0].startswith("2026-08-04")
    assert times[-1].startswith("2026-08-06")


def test_timestamps_are_timezone_aware():
    p, _ = provider(FakeResponse(VALUES_NEWEST_FIRST))
    when = p.fetch_candles("AAPL", "1day", 0, 86400)[0]["time"]
    assert when.endswith("+00:00"), "a naive stamp is re-read as local time by the browser"


def test_intraday_datetime_format_is_handled():
    payload = {"status": "ok", "values": [
        {"datetime": "2026-08-06 15:30:00", "open": "1", "high": "2", "low": "0.5", "close": "1.5",
         "volume": "10"}]}
    p, _ = provider(FakeResponse(payload))
    assert p.fetch_candles("AAPL", "5min", 0, 3600)[0]["time"] == "2026-08-06T15:30:00+00:00"


@pytest.mark.parametrize(
    "resolution,expected",
    [("1min", "1min"), ("5min", "5min"), ("15min", "15min"),
     ("1h", "1h"), ("1day", "1day"), ("1week", "1week")],
)
def test_every_period_map_interval_is_supported(resolution, expected):
    """The semantic tokens in market.PERIOD_MAP must all translate."""
    p, session = provider(FakeResponse(VALUES_NEWEST_FIRST))
    p.fetch_candles("AAPL", resolution, 0, 86400)
    assert session.calls[0]["params"]["interval"] == expected


def test_period_map_tokens_all_resolve():
    from services import market

    p, session = provider(FakeResponse(VALUES_NEWEST_FIRST))
    for period, (resolution, lookback) in market.PERIOD_MAP.items():
        session.calls.clear()
        p.fetch_candles("AAPL", resolution, 0, lookback)
        assert session.calls, f"{period} produced no request"
        assert session.calls[0]["params"]["interval"], f"{period} mapped to an empty interval"


def test_api_key_is_sent_and_never_returned():
    p, session = provider(FakeResponse(VALUES_NEWEST_FIRST), key="td-secret")
    candles = p.fetch_candles("AAPL", "1day", 0, 86400)

    assert session.calls[0]["params"]["apikey"] == "td-secret"
    assert "td-secret" not in json.dumps(candles)


# -------------------------------------------------------------- empty data

def test_missing_values_key_is_empty_not_an_error():
    p, _ = provider(FakeResponse({"status": "ok"}))
    assert p.fetch_candles("AAPL", "1day", 0, 86400) == []


def test_empty_values_list_is_empty():
    p, _ = provider(FakeResponse({"status": "ok", "values": []}))
    assert p.fetch_candles("AAPL", "1day", 0, 86400) == []


def test_rows_without_a_close_are_skipped_not_fatal():
    payload = {"status": "ok", "values": [
        {"datetime": "2026-08-06", "close": "313.2"},
        {"datetime": "2026-08-05"},                      # no close
        {"datetime": "not-a-date", "close": "1.0"},      # unparseable time
        "garbage",                                        # not even a dict
    ]}
    p, _ = provider(FakeResponse(payload))
    candles = p.fetch_candles("AAPL", "1day", 0, 86400)
    assert len(candles) == 1 and candles[0]["close"] == 313.2


# ---------------------------------------------------------- provider errors

def test_missing_key_raises_before_any_request():
    session = FakeSession(FakeResponse(VALUES_NEWEST_FIRST))
    p = TwelveDataProvider(api_key="", session=session)

    with pytest.raises(ProviderAuthError):
        p.fetch_candles("AAPL", "1day", 0, 86400)
    assert session.calls == [], "no request should be attempted without a key"


def test_error_body_on_http_200_is_detected():
    """Twelve Data returns failures with a 200 status line."""
    p, _ = provider(FakeResponse({"code": 401, "status": "error", "message": "bad key"}))
    with pytest.raises(ProviderAuthError) as exc:
        p.fetch_candles("AAPL", "1day", 0, 86400)
    assert exc.value.retryable is False


def test_quota_exhausted_is_rate_limited():
    p, _ = provider(FakeResponse({"code": 429, "status": "error", "message": "run out of credits"}))
    with pytest.raises(ProviderRateLimited):
        p.fetch_candles("AAPL", "1day", 0, 86400)


def test_unknown_symbol_is_not_retryable():
    p, _ = provider(FakeResponse({"code": 400, "status": "error", "message": "symbol not found"}))
    with pytest.raises(ProviderError) as exc:
        p.fetch_candles("ZZZZZ", "1day", 0, 86400)
    assert exc.value.retryable is False, "a bad symbol will fail identically on retry"


def test_http_429_is_rate_limited():
    p, _ = provider(FakeResponse({}, status=429))
    with pytest.raises(ProviderRateLimited):
        p.fetch_candles("AAPL", "1day", 0, 86400)


def test_server_error_is_retryable():
    p, _ = provider(FakeResponse({}, status=503))
    with pytest.raises(ProviderError) as exc:
        p.fetch_candles("AAPL", "1day", 0, 86400)
    assert exc.value.retryable is True


def test_timeout_is_retryable():
    p, _ = provider(requests.Timeout("timed out"))
    with pytest.raises(ProviderError) as exc:
        p.fetch_candles("AAPL", "1day", 0, 86400)
    assert exc.value.retryable is True


# --------------------------------------------------------- malformed input

def test_non_json_body_raises():
    p, _ = provider(FakeResponse(None, status=200, text="<html>gateway</html>"))
    with pytest.raises(ProviderError):
        p.fetch_candles("AAPL", "1day", 0, 86400)


def test_values_of_the_wrong_type_raises():
    p, _ = provider(FakeResponse({"status": "ok", "values": {"oops": 1}}))
    with pytest.raises(ProviderError):
        p.fetch_candles("AAPL", "1day", 0, 86400)


def test_non_dict_payload_raises():
    p, _ = provider(FakeResponse(["not", "a", "dict"]))
    with pytest.raises(ProviderError):
        p.fetch_candles("AAPL", "1day", 0, 86400)


# ------------------------------------------- integration with market layer

def test_history_failure_degrades_to_an_empty_series(monkeypatch):
    """A history outage must not break the page — the chart shows its own state."""
    import asyncio

    from services import market

    def boom(*_a, **_kw):
        raise ProviderRateLimited("quota exhausted")

    monkeypatch.setattr(market, "get_history_provider", lambda: type("P", (), {"fetch_candles": staticmethod(boom)})())
    market._cache.clear()

    assert asyncio.run(market.get_history("AAPL", "1m")) == []
    market._cache.clear()


def test_sparkline_survives_history_failure(monkeypatch):
    import asyncio

    from services import market

    monkeypatch.setattr(market, "_blocking_history", lambda *a, **k: [])
    market._cache.clear()
    assert asyncio.run(market.get_sparkline("AAPL")) == []
    market._cache.clear()


# ===================================================================
# Regression: provider activation, caching, and batching
# ===================================================================
#
# These cover the exact failure that left charts empty AFTER the key was added:
# a stale process, a fan-out that blew the per-minute call limit, and the risk
# that an empty result recorded while throttled outlives the throttling.

import asyncio as _asyncio

from services import market as _market
from services.providers import set_history_provider


class StubHistoryProvider:
    """Records calls so batching and caching can be asserted."""

    name = "stub-history"

    def __init__(self, candles=None, error=None, batch=True):
        self._candles = candles if candles is not None else []
        self._error = error
        self.calls = []
        if not batch:
            # Simulate a provider with no batch endpoint. Shadowing on the
            # INSTANCE is what `getattr(provider, "fetch_candles_batch", None)`
            # sees, so this exercises the real fallback branch.
            self.fetch_candles_batch = None

    def fetch_candles_batch(self, symbols, resolution, start, end):
        self.calls.append(tuple(symbols))
        if self._error:
            raise self._error
        return {s: list(self._candles) for s in symbols}

    def fetch_candles(self, symbol, resolution, start, end):
        self.calls.append((symbol,))
        if self._error:
            raise self._error
        return list(self._candles)


CANDLES = [
    {"time": "2026-08-05T00:00:00+00:00", "open": 1.0, "high": 2.0, "low": 0.5, "close": 1.5, "volume": 10},
    {"time": "2026-08-06T00:00:00+00:00", "open": 1.5, "high": 2.5, "low": 1.0, "close": 2.0, "volume": 20},
]


@pytest.fixture(autouse=True)
def _clean_history_state():
    """Each test starts with an empty cache, no cool-off, and a full credit budget.

    The credit window is module state shared across the process, so without
    this reset an early test exhausts the budget and every later one silently
    receives zero results — which looks exactly like the bug under test.
    """
    def reset():
        _market._cache.clear()
        _market._history_backoff_until = 0.0
        _market._credit_window_start = 0.0
        _market._credits_spent = 0

    reset()
    yield
    reset()
    set_history_provider(None)


def test_configured_provider_returns_candles():
    """Twelve Data configured -> candles reach the caller."""
    set_history_provider(StubHistoryProvider(CANDLES))
    assert len(_asyncio.run(_market.get_history("AAPL", "1m"))) == 2


def test_empty_provider_response_is_empty_not_an_error():
    set_history_provider(StubHistoryProvider([]))
    assert _asyncio.run(_market.get_history("AAPL", "1m")) == []


def test_provider_failure_degrades_to_empty():
    set_history_provider(StubHistoryProvider(error=ProviderError("boom")))
    assert _asyncio.run(_market.get_history("AAPL", "1m")) == []


def test_batch_fetches_symbols_in_one_call():
    """Symbols within the credit budget must cost ONE provider call, not N."""
    stub = StubHistoryProvider(CANDLES)
    set_history_provider(stub)

    symbols = [f"S{i}" for i in range(_market._SYMBOLS_PER_WINDOW)]
    result = _asyncio.run(_market.get_histories(symbols, "1w"))

    assert len(stub.calls) == 1, f"expected 1 batched call, got {len(stub.calls)}"
    assert len(stub.calls[0]) == len(symbols)
    assert all(len(candles) == 2 for candles in result.values())


def test_batch_falls_back_to_per_symbol_when_unsupported():
    stub = StubHistoryProvider(CANDLES, batch=False)
    set_history_provider(stub)

    result = _asyncio.run(_market.get_histories(["AAPL", "MSFT"], "1w"))
    assert len(result) == 2
    assert len(stub.calls) == 2, "a provider without batching must still work"


def test_empty_result_is_not_cached():
    """THE TRAP: an empty recorded while rate-limited must not outlive it.

    If empties were cached, the chart would stay blank for the whole history
    TTL after the quota recovered — which is indistinguishable from the
    provider still being broken.
    """
    failing = StubHistoryProvider(error=ProviderRateLimited("throttled"))
    set_history_provider(failing)
    assert _asyncio.run(_market.get_histories(["AAPL"], "1w")) == {"AAPL": []}

    assert _market._get_cached("hist:AAPL:1w", _market._HISTORY_TTL) is None, (
        "an empty history must never be cached"
    )

    # Provider recovers; the cool-off is what gates the retry, not a cached empty.
    _market._history_backoff_until = 0.0
    set_history_provider(StubHistoryProvider(CANDLES))
    assert len(_asyncio.run(_market.get_histories(["AAPL"], "1w"))["AAPL"]) == 2


def test_successful_result_is_cached_and_reused():
    stub = StubHistoryProvider(CANDLES)
    set_history_provider(stub)

    _asyncio.run(_market.get_histories(["AAPL"], "1w"))
    _asyncio.run(_market.get_histories(["AAPL"], "1w"))

    assert len(stub.calls) == 1, "a cached symbol must not be refetched"


def test_only_uncached_symbols_are_requested():
    stub = StubHistoryProvider(CANDLES)
    set_history_provider(stub)

    _asyncio.run(_market.get_histories(["AAPL"], "1w"))
    stub.calls.clear()
    _asyncio.run(_market.get_histories(["AAPL", "MSFT"], "1w"))

    assert stub.calls == [("MSFT",)], "only the missing symbol should be fetched"


def test_rate_limit_triggers_a_cool_off_that_short_circuits():
    """While throttled we must not spend the next minute's quota retrying."""
    stub = StubHistoryProvider(error=ProviderRateLimited("throttled"))
    set_history_provider(stub)

    _asyncio.run(_market.get_histories(["AAPL"], "1w"))
    assert _market.history_status()["rate_limited"] is True

    stub.calls.clear()
    _asyncio.run(_market.get_histories(["MSFT"], "1w"))
    assert stub.calls == [], "no provider call should be made while backing off"


def test_cool_off_expires():
    _market._note_history_throttled()
    assert _market.history_status()["rate_limited"] is True

    _market._history_backoff_until -= _market._HISTORY_BACKOFF_SECONDS + 1
    assert _market.history_status()["rate_limited"] is False


def test_sparklines_are_batched_and_downsampled():
    long_history = [
        {"time": f"2026-08-{(i % 28) + 1:02d}T00:00:00+00:00", "open": 1.0, "high": 2.0,
         "low": 0.5, "close": float(i), "volume": 1}
        for i in range(200)
    ]
    stub = StubHistoryProvider(long_history)
    set_history_provider(stub)

    sparklines = _asyncio.run(_market.get_sparklines(["AMD", "GOOGL", "META"], points=30))

    assert len(stub.calls) == 1, "one call for the whole watchlist"
    for points in sparklines.values():
        assert len(points) == 30
        assert all(isinstance(v, float) for v in points)


def test_candle_shape_matches_what_the_frontend_expects():
    """The chart reads time/open/high/low/close/volume — nothing else."""
    set_history_provider(StubHistoryProvider(CANDLES))
    candles = _asyncio.run(_market.get_history("AAPL", "1m"))

    for candle in candles:
        assert set(candle) == {"time", "open", "high", "low", "close", "volume"}
        assert candle["time"].endswith("+00:00"), "timestamps must be timezone-aware"
        assert isinstance(candle["close"], float)
        assert isinstance(candle["volume"], int)


def test_credit_budget_limits_how_many_symbols_are_requested():
    """Twelve Data charges one credit PER SYMBOL, 8 per minute on the free tier.

    Requesting more than the window allows returns 429 for the whole batch AND
    still consumes budget, so the client self-limits instead.
    """
    stub = StubHistoryProvider(CANDLES)
    set_history_provider(stub)

    fifteen = [f"SYM{i:02d}" for i in range(15)]
    result = _asyncio.run(_market.get_histories(fifteen, "1w"))

    assert len(stub.calls[0]) == _market._SYMBOLS_PER_WINDOW, (
        "must not request more symbols than the credit window allows"
    )
    # Deferred symbols are reported empty rather than wrong.
    assert sum(1 for c in result.values() if c) == _market._SYMBOLS_PER_WINDOW
    assert len(result) == 15


def test_deferred_symbols_are_not_cached_so_the_next_window_retries_them():
    """A symbol we could not afford must not be cached as empty."""
    stub = StubHistoryProvider(CANDLES)
    set_history_provider(stub)

    fifteen = [f"SYM{i:02d}" for i in range(15)]
    _asyncio.run(_market.get_histories(fifteen, "1w"))

    deferred = fifteen[_market._SYMBOLS_PER_WINDOW:]
    for symbol in deferred:
        assert _market._get_cached(f"hist:{symbol}:1w", 10_000) is None, (
            f"{symbol} was deferred, not answered — it must stay uncached"
        )

    # New credit window: the remainder is fetched.
    _market._credit_window_start = 0.0
    _market._credits_spent = 0
    stub.calls.clear()
    _asyncio.run(_market.get_histories(fifteen, "1w"))
    assert set(stub.calls[0]) == set(deferred[: _market._SYMBOLS_PER_WINDOW])


def test_history_ttl_scales_with_resolution():
    """A closed daily bar is immutable; the newest intraday bar is not."""
    assert _market._history_ttl("1day") > _market._history_ttl("1h")
    assert _market._history_ttl("1h") > _market._history_ttl("1min")


def test_credit_status_reports_remaining_budget():
    _market._credit_window_start = 0.0
    _market._credits_spent = 0
    assert _market.credit_status()["credits_available"] == _market._CREDITS_PER_MINUTE

    _market._spend_credits(2)
    assert _market.credit_status()["credits_available"] == _market._CREDITS_PER_MINUTE - 2
