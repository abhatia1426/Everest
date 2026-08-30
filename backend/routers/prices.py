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
