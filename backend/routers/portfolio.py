import asyncio
import logging
from collections import defaultdict
from datetime import datetime, timezone

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, HTTPException, Query

from config import db
from models.position import PositionCreate
from routers.auth import get_current_user
from services import market

log = logging.getLogger("everest.portfolio")

router = APIRouter(tags=["portfolio"])


async def _enrich(positions: list[dict]) -> list[dict]:
    """Attach live quote data and derived P&L to raw position documents."""
    if not positions:
        return []

    quotes = await market.get_quotes([p["ticker"] for p in positions])
    enriched = []
    for pos in positions:
        quote = quotes.get(pos["ticker"], {})
        live_price = quote.get("price")
        qty = float(pos["qty"])
        avg_cost = float(pos["avg_cost"])
        cost_basis = qty * avg_cost

        # Graceful degradation: with no live quote, value the holding at the
        # user's own cost basis. Totals stay meaningful (unrealised P&L reads
        # 0.00, not -100%) and `price_stale` lets the UI label it honestly.
        price_stale = live_price is None
        price = avg_cost if price_stale else live_price

        market_value = qty * price
        unrealized = market_value - cost_basis

        enriched.append(
            {
                "id": str(pos["_id"]),
                "ticker": pos["ticker"],
                "qty": qty,
                "avg_cost": avg_cost,
                "mode": pos.get("mode", "real"),
                "type": pos.get("type", "stock"),
                "company": quote.get("company", pos["ticker"]),
                "sector": quote.get("sector") or "Unknown",
                "current_price": round(price, 4),
                "price_stale": price_stale,
                "change_percent": quote.get("change_percent"),
                "cost_basis": round(cost_basis, 2),
                "market_value": round(market_value, 2),
                "unrealized_pnl": round(unrealized, 2),
                "pnl_percent": (
                    round((unrealized / cost_basis) * 100, 2) if cost_basis else None
                ),
            }
        )
    return enriched


async def _fetch_positions(user_id: ObjectId, mode: str | None) -> list[dict]:
    query: dict = {"user_id": user_id, "type": "stock"}
    if mode:
        query["mode"] = mode
    return await db.positions.find(query).sort("ticker", 1).to_list(500)


@router.get("/portfolio")
async def list_positions(
    mode: str | None = Query(None, pattern="^(real|paper)$"),
    user: dict = Depends(get_current_user),
):
    raw = await _fetch_positions(user["_id"], mode)
    return {"positions": await _enrich(raw)}


@router.post("/portfolio", status_code=201)
async def add_position(payload: PositionCreate, user: dict = Depends(get_current_user)):
    data = payload.normalized()

    # Non-blocking price lookup. The ticker's format is already validated by
    # the model; a provider outage must never stop a user recording a trade
    # they actually made, so we save regardless and flag the price as stale.
    resolved = await market.resolve_symbol(data["ticker"])
    data["price_stale"] = not resolved["available"]

    existing = await db.positions.find_one(
        {
            "user_id": user["_id"],
            "ticker": data["ticker"],
            "mode": data["mode"],
            "type": "stock",
        }
    )
    if existing:
        # Average into the existing lot rather than creating a duplicate row.
        total_qty = float(existing["qty"]) + data["qty"]
        blended = (
            float(existing["qty"]) * float(existing["avg_cost"])
            + data["qty"] * data["avg_cost"]
        ) / total_qty
        await db.positions.update_one(
            {"_id": existing["_id"]},
            {
                "$set": {
                    "qty": total_qty,
                    "avg_cost": round(blended, 4),
                    "price_stale": data["price_stale"],
                }
            },
        )
        doc = await db.positions.find_one({"_id": existing["_id"]})
    else:
        data["user_id"] = user["_id"]
        data["created_at"] = datetime.now(timezone.utc)
        result = await db.positions.insert_one(data)
        doc = await db.positions.find_one({"_id": result.inserted_id})

    return (await _enrich([doc]))[0]


@router.delete("/portfolio/{position_id}", status_code=204)
async def delete_position(position_id: str, user: dict = Depends(get_current_user)):
    try:
        oid = ObjectId(position_id)
    except InvalidId as exc:
        raise HTTPException(status_code=400, detail="Invalid position id") from exc

    result = await db.positions.delete_one({"_id": oid, "user_id": user["_id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Position not found")


@router.get("/pnl")
async def get_pnl(
    mode: str = Query("real", pattern="^(real|paper)$"),
    user: dict = Depends(get_current_user),
):
    positions = await _enrich(await _fetch_positions(user["_id"], mode))

    total_value = sum(p["market_value"] or 0 for p in positions)
    total_cost = sum(p["cost_basis"] or 0 for p in positions)
    unrealized = total_value - total_cost

    realized_docs = await db.trades.find(
        {"user_id": user["_id"], "mode": mode}
    ).to_list(1000)
    realized = sum(float(t.get("realized_pnl", 0)) for t in realized_docs)

    by_sector: dict[str, float] = defaultdict(float)
    for pos in positions:
        by_sector[pos["sector"]] += pos["market_value"] or 0

    day_change = sum(
        (p["market_value"] or 0) * (p["change_percent"] or 0) / 100 for p in positions
    )

    return {
        "mode": mode,
        "total_value": round(total_value, 2),
        "total_cost": round(total_cost, 2),
        "unrealized_pnl": round(unrealized, 2),
        "unrealized_percent": round((unrealized / total_cost) * 100, 2) if total_cost else 0,
        "realized_pnl": round(realized, 2),
        "day_change": round(day_change, 2),
        "day_change_percent": round((day_change / total_value) * 100, 2) if total_value else 0,
        "position_count": len(positions),
        "allocation": [
            {"sector": sector, "value": round(value, 2)}
            for sector, value in sorted(by_sector.items(), key=lambda kv: -kv[1])
        ],
        "positions": positions,
    }


@router.get("/portfolio/history")
async def portfolio_history(
    mode: str = Query("real", pattern="^(real|paper)$"),
    period: str = Query("1m"),
    user: dict = Depends(get_current_user),
):
    """Reconstruct portfolio value over time from each holding's price history.

    Quantities are treated as constant (current holdings applied backwards),
    which is the standard "what would this basket have been worth" view.
    """
    positions = await _fetch_positions(user["_id"], mode)
    if not positions:
        return {"mode": mode, "period": period, "series": []}

    # Batched: one provider call for the whole book rather than one per
    # holding, which an eight-position portfolio could not fit inside the
    # provider's per-minute call limit.
    histories = await market.get_histories([p["ticker"] for p in positions], period)

    # ALL-OR-NOTHING, deliberately.
    #
    # This series is a SUM across holdings. If history is missing for even one
    # position — a provider credit limit, an unlisted symbol — summing the rest
    # produces a chart that is not "incomplete" but WRONG: it understates the
    # portfolio by exactly the missing holdings, with no visual cue that
    # anything is absent. An empty series renders "not enough history yet",
    # which is honest. A short chart that silently omits a third of the book is
    # not.
    missing = [
        p["ticker"] for p in positions if not histories.get(p["ticker"].upper().strip())
    ]
    if missing:
        log.info(
            "portfolio/history: withholding series for %s — no history for %d of %d "
            "holdings (%s)",
            mode,
            len(missing),
            len(positions),
            ", ".join(missing),
        )
        return {"mode": mode, "period": period, "series": [], "incomplete": True}

    totals: dict[str, float] = defaultdict(float)
    for pos in positions:
        candles = histories.get(pos["ticker"].upper().strip(), [])
        qty = float(pos["qty"])
        for candle in candles:
            totals[candle["time"]] += candle["close"] * qty

    series = [
        {"time": time, "value": round(value, 2)} for time, value in sorted(totals.items())
    ]
    return {"mode": mode, "period": period, "series": series}
