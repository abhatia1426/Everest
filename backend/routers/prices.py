from fastapi import APIRouter, Depends, HTTPException, Query

from routers.auth import get_current_user
from services import market

router = APIRouter(tags=["market"])


@router.get("/prices")
async def get_prices(
    tickers: str = Query(..., description="Comma separated symbols, e.g. AAPL,MSFT"),
    _user: dict = Depends(get_current_user),
):
    symbols = [t for t in (s.strip() for s in tickers.split(",")) if t]
    if not symbols:
        raise HTTPException(status_code=400, detail="At least one ticker is required")
    if len(symbols) > 50:
        raise HTTPException(status_code=400, detail="Maximum 50 tickers per request")

    quotes = await market.get_quotes(symbols)
    return {"quotes": quotes}


@router.get("/prices/sessions")
async def get_session_closes(
    tickers: str = Query(..., description="Comma separated symbols, e.g. AAPL,MSFT"),
    days: int = Query(31, ge=2, le=120),
    _user: dict = Depends(get_current_user),
):
    """Recent DAILY closes for several symbols, in ONE provider call.

    WHY THIS EXISTS, given `/prices/{ticker}/history` already returns candles.

    The watchlist monitor needs a 30-SESSION series per symbol: the sparkline,
    the 30-day range rail, the momentum comparison and the "unusual move
    against its own normal day" test are all statements about daily sessions.
    The only per-symbol series the watchlist already carries is
    `sparkline` — 30 points downsampled from a ONE-WEEK, 15-minute history.
    Those points are intraday bars, so a "30-day low" computed from them would
    be a low over five days quoted as a low over thirty. That is a wrong
    number, not a rough one.

    Fanning `/prices/{ticker}/history?period=3m` out per symbol is the other
    obvious route and it is the exact failure `market.get_histories` was
    written to prevent: Twelve Data's free tier allows 8 API CALLS per minute,
    so a fourteen-symbol watchlist would exhaust the quota on one page load and
    every series after the eighth would come back empty.

    So this delegates to `get_histories`, which batches the uncached symbols
    into a single request, serves cached ones without touching the provider at
    all (daily bars carry a 6-hour TTL), and defers anything the current credit
    window cannot afford rather than spending budget it does not have. A symbol
    the provider could not supply comes back as an empty list — never
    interpolated, never padded — and the UI renders its unavailable state.
    """
    symbols = [t for t in (s.strip().upper() for s in tickers.split(",")) if t]
    if not symbols:
        raise HTTPException(status_code=400, detail="At least one ticker is required")
    if len(symbols) > 50:
        raise HTTPException(status_code=400, detail="Maximum 50 tickers per request")

    # "3m" is the shortest period on a 1-day resolution, so it is the cheapest
    # window that answers a 30-session question — and it shares its cache entry
    # with anything else already asking for three months of daily bars.
    histories = await market.get_histories(symbols, "3m")

    sessions = {}
    for symbol in symbols:
        candles = histories.get(symbol) or []
        closes = [
            {"time": c["time"], "close": c["close"]}
            for c in candles
            if isinstance(c, dict) and isinstance(c.get("close"), (int, float))
        ]
        sessions[symbol] = closes[-days:]

    return {"days": days, "sessions": sessions}


@router.get("/prices/{ticker}/history")
async def get_price_history(
    ticker: str,
    period: str = Query("1w"),
    _user: dict = Depends(get_current_user),
):
    if period.lower() not in market.PERIOD_MAP:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported period. Use one of: {', '.join(market.PERIOD_MAP)}",
        )
    candles = await market.get_history(ticker, period)
    return {"ticker": ticker.upper(), "period": period.lower(), "candles": candles}


@router.get("/profile/{ticker}")
async def get_profile(ticker: str, _user: dict = Depends(get_current_user)):
    return await market.get_profile(ticker)
