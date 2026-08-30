import asyncio
from datetime import datetime, timezone

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, HTTPException
from pymongo.errors import DuplicateKeyError

from config import db
from models.watchlist import WatchlistCreate
from routers.auth import get_current_user
from services import market

router = APIRouter(prefix="/watchlist", tags=["watchlist"])


@router.get("")
async def list_watchlist(user: dict = Depends(get_current_user)):
    items = await db.watchlist.find({"user_id": user["_id"]}).sort("ticker", 1).to_list(200)
    if not items:
        return {"items": []}

    tickers = [item["ticker"] for item in items]
    # Sparklines are BATCHED into a single provider call. Fanning out one
    # request per symbol exhausted Twelve Data's 8-calls-per-minute free tier
    # on a single watchlist load, after which every sparkline came back empty.
    quotes, sparkline_map = await asyncio.gather(
        market.get_quotes(tickers),
        market.get_sparklines(tickers),
    )
    sparklines = [sparkline_map.get(t, []) for t in tickers]

    return {
        "items": [
            {
                "id": str(item["_id"]),
                "ticker": item["ticker"],
                "company": quotes.get(item["ticker"], {}).get("company", item["ticker"]),
                "sector": quotes.get(item["ticker"], {}).get("sector") or "Unknown",
                "price": quotes.get(item["ticker"], {}).get("price"),
                "change": quotes.get(item["ticker"], {}).get("change"),
                "change_percent": quotes.get(item["ticker"], {}).get("change_percent"),
                "sparkline": spark,
            }
            for item, spark in zip(items, sparklines)
        ]
    }


@router.post("", status_code=201)
async def add_to_watchlist(payload: WatchlistCreate, user: dict = Depends(get_current_user)):
    ticker = payload.normalized_ticker()

    # Non-blocking, like adding a position: a provider outage must not stop a
    # user tracking a symbol. Whatever the quote lacks, the frontend fills in
    # from its local reference data.
    resolved = await market.resolve_symbol(ticker)
    quote = resolved["quote"]

    try:
        result = await db.watchlist.insert_one(
            {
                "user_id": user["_id"],
                "ticker": ticker,
                "created_at": datetime.now(timezone.utc),
            }
        )
    except DuplicateKeyError as exc:
        raise HTTPException(
            status_code=409, detail=f"{ticker} is already on your watchlist"
        ) from exc

    return {
        "id": str(result.inserted_id),
        "ticker": ticker,
        "company": quote.get("company", ticker),
        "sector": quote.get("sector") or "Unknown",
        "price": quote.get("price"),
        "change": quote.get("change"),
        "change_percent": quote.get("change_percent"),
        "sparkline": await market.get_sparkline(ticker),
    }


@router.delete("/{item_id}", status_code=204)
async def remove_from_watchlist(item_id: str, user: dict = Depends(get_current_user)):
    try:
        oid = ObjectId(item_id)
    except InvalidId as exc:
        raise HTTPException(status_code=400, detail="Invalid watchlist id") from exc

    result = await db.watchlist.delete_one({"_id": oid, "user_id": user["_id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Watchlist item not found")
