"""Adding a position must never be blocked by a market-data outage.

Yahoo rate-limits aggressively (HTTP 429). A user recording a trade they
actually made must still be able to save it; the price is flagged stale and
falls back to their cost basis so totals stay meaningful.

Run: .venv/bin/python -m pytest test_position_degradation.py -q
"""
import asyncio

import pytest
from pydantic import ValidationError

from models.position import PositionCreate
from routers.portfolio import _enrich
from services import market


# ----------------------------------------------------------- ticker format

@pytest.mark.parametrize("symbol", ["A", "F", "AAPL", "GOOGL", "aapl"])
def test_valid_tickers_accepted(symbol):
    assert PositionCreate(ticker=symbol, qty=1, avg_cost=1).ticker == symbol.upper()


@pytest.mark.parametrize("symbol", ["", "TOOLONG", "BRK.B", "12345", "AA PL", "A1"])
def test_malformed_tickers_rejected(symbol):
    with pytest.raises(ValidationError):
        PositionCreate(ticker=symbol, qty=1, avg_cost=1)


def test_format_check_is_provider_independent():
    assert market.is_valid_ticker("AAPL") is True
    assert market.is_valid_ticker("brk") is True
    assert market.is_valid_ticker("TOOLONG") is False
    assert market.is_valid_ticker("BRK.B") is False


# --------------------------------------------------------- resolve_symbol

def test_resolve_symbol_reports_outage_without_raising(monkeypatch):
    async def fake_quotes(tickers):
        return {t: {"ticker": t, "price": None, "error": "429 Too Many Requests"} for t in tickers}

    monkeypatch.setattr(market, "get_quotes", fake_quotes)

    resolved = asyncio.run(market.resolve_symbol("aapl"))
    assert resolved["symbol"] == "AAPL"
    assert resolved["available"] is False
    assert resolved["provider_down"] is True


def test_resolve_symbol_reports_live_price(monkeypatch):
    async def fake_quotes(tickers):
        return {t: {"ticker": t, "price": 231.4} for t in tickers}

    monkeypatch.setattr(market, "get_quotes", fake_quotes)

    resolved = asyncio.run(market.resolve_symbol("AAPL"))
    assert resolved["available"] is True
    assert resolved["provider_down"] is False


def test_strict_validate_still_raises_on_outage(monkeypatch):
    """The strict path other routers rely on must keep its old behaviour."""
    from fastapi import HTTPException

    async def fake_quotes(tickers):
        return {t: {"ticker": t, "price": None, "error": "429"} for t in tickers}

    monkeypatch.setattr(market, "get_quotes", fake_quotes)

    with pytest.raises(HTTPException) as exc:
        asyncio.run(market.validate_symbol("AAPL"))
    assert exc.value.status_code == 503


# ------------------------------------------------------------- enrichment

def _doc(ticker="AAPL", qty=10, avg_cost=180.0):
    return {"_id": "x", "ticker": ticker, "qty": qty, "avg_cost": avg_cost, "mode": "real"}


def test_stale_price_falls_back_to_cost_basis(monkeypatch):
    async def fake_quotes(tickers):
        return {t: {"ticker": t, "price": None, "error": "429"} for t in tickers}

    monkeypatch.setattr(market, "get_quotes", fake_quotes)

    row = asyncio.run(_enrich([_doc()]))[0]

    assert row["price_stale"] is True
    assert row["current_price"] == 180.0, "should stand in the user's cost basis"
    assert row["market_value"] == 1800.00
    assert row["unrealized_pnl"] == 0.00, "must not report a fabricated -100% loss"
    assert row["pnl_percent"] == 0.00


def test_live_price_is_used_when_available(monkeypatch):
    async def fake_quotes(tickers):
        return {t: {"ticker": t, "price": 200.0, "company": "Apple Inc."} for t in tickers}

    monkeypatch.setattr(market, "get_quotes", fake_quotes)

    row = asyncio.run(_enrich([_doc()]))[0]

    assert row["price_stale"] is False
    assert row["current_price"] == 200.0
    assert row["market_value"] == 2000.00
    assert row["unrealized_pnl"] == 200.00


# ------------------------------------------------- attribution's second leg

def test_previous_close_is_carried_through_for_attribution(monkeypatch):
    """AI Insights attributes the day as shares × (price − previous close)."""

    async def fake_quotes(tickers):
        return {t: {"ticker": t, "price": 200.0, "previous_close": 196.5} for t in tickers}

    monkeypatch.setattr(market, "get_quotes", fake_quotes)

    row = asyncio.run(_enrich([_doc()]))[0]

    assert row["previous_close"] == 196.5


def test_previous_close_is_none_rather_than_substituted(monkeypatch):
    """A missing previous close must NOT fall back to cost basis.

    Standing in the cost basis would make the attribution beam report a
    fabricated dollar contribution for a holding it never measured.
    """

    async def fake_quotes(tickers):
        return {t: {"ticker": t, "price": 200.0} for t in tickers}

    monkeypatch.setattr(market, "get_quotes", fake_quotes)

    row = asyncio.run(_enrich([_doc()]))[0]

    assert row["previous_close"] is None
    assert row["current_price"] == 200.0, "the price itself is still live"
