"""/portfolio/history must say WHICH holdings it lacks history for.

The endpoint deliberately withholds the whole series when any holding is
missing history, because summing the rest understates the book by exactly the
missing positions with no visual cue. That rule is correct and is not under
test here.

What IS under test is the reporting around it. The endpoint previously returned
a bare empty series, so the only honest thing the client could render was "not
enough history yet" — which reads as "your account is too new" when the real
cause is that the provider has no candles for four specific symbols. The names
are computed and logged server-side; these tests pin that they also reach the
client.

Run: .venv/bin/python -m pytest test_portfolio_history_metadata.py -q
"""
import asyncio

import pytest

from routers import portfolio
from services import market


USER = {"_id": "user-1"}


def _positions(*tickers):
    return [{"ticker": t, "qty": 1, "avg_cost": 10.0} for t in tickers]


def _call(monkeypatch, positions, histories):
    async def fake_fetch(_user_id, _mode):
        return positions

    async def fake_histories(tickers, period):
        # Mirrors the real get_histories contract: results are keyed by the
        # upper/stripped symbol, never by whatever casing the caller passed.
        return {
            t.upper().strip(): histories.get(t.upper().strip(), [])
            for t in tickers
            if t and t.strip()
        }

    monkeypatch.setattr(portfolio, "_fetch_positions", fake_fetch)
    monkeypatch.setattr(market, "get_histories", fake_histories)

    return asyncio.run(portfolio.portfolio_history(mode="real", period="1m", user=USER))


CANDLES = [
    {"time": "2026-01-01T00:00:00+00:00", "close": 10.0},
    {"time": "2026-01-02T00:00:00+00:00", "close": 11.0},
]


def test_names_the_holdings_that_have_no_history(monkeypatch):
    body = _call(
        monkeypatch,
        _positions("AAPL", "SNDK", "SOFI"),
        {"AAPL": CANDLES},
    )

    assert body["series"] == []
    assert body["incomplete"] is True
    # The whole point: the client can name them instead of guessing.
    assert body["missing"] == ["SNDK", "SOFI"]
    assert body["holdings_count"] == 3


def test_missing_list_is_sorted_for_a_stable_empty_state(monkeypatch):
    body = _call(
        monkeypatch,
        _positions("TSLA", "AAPL", "SPCX"),
        {},
    )

    # Unsorted, the empty-state sentence would reshuffle between polls.
    assert body["missing"] == ["AAPL", "SPCX", "TSLA"]


def test_complete_history_reports_no_missing_key(monkeypatch):
    body = _call(
        monkeypatch,
        _positions("AAPL", "MSFT"),
        {"AAPL": CANDLES, "MSFT": CANDLES},
    )

    assert body["series"], "a fully-priced book must still plot"
    assert "missing" not in body
    assert "incomplete" not in body


def test_empty_portfolio_is_not_reported_as_missing_history(monkeypatch):
    """No holdings is a different condition from unavailable history."""
    body = _call(monkeypatch, [], {})

    assert body["series"] == []
    assert "missing" not in body


@pytest.mark.parametrize("symbol", ["aapl", "  AAPL  "])
def test_missing_detection_matches_the_normalisation_used_to_sum(monkeypatch, symbol):
    """Lookup keys are upper/stripped when summing, so detection must agree.

    If these two disagreed, a holding could be reported missing while its
    candles were in fact summed — or worse, summed while reported present.
    """
    body = _call(monkeypatch, _positions(symbol), {"AAPL": CANDLES})

    assert body["series"], "AAPL candles should satisfy a differently-cased holding"
    assert "missing" not in body
