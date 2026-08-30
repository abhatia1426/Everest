from datetime import date, datetime, timezone

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, HTTPException, Query

from config import db
from models.option import OptionCreate
from routers.auth import get_current_user
from services import market

router = APIRouter(prefix="/options", tags=["options"])

CONTRACT_MULTIPLIER = 100


async def _enrich(docs: list[dict]) -> list[dict]:
    if not docs:
        return []

    quotes = await market.get_quotes([d["ticker"] for d in docs])
    today = date.today()
    enriched = []

    for doc in docs:
        underlying = quotes.get(doc["ticker"], {}).get("price")
        expiry = date.fromisoformat(doc["expiry"])
        dte = (expiry - today).days

        qty = float(doc["qty"])
        avg_cost = float(doc["avg_cost"])
        cost_basis = qty * avg_cost * CONTRACT_MULTIPLIER

        per_contract = market.estimate_option_value(doc["type"], float(doc["strike"]), underlying, dte)
        est_value = per_contract * qty * CONTRACT_MULTIPLIER if per_contract is not None else None
        pnl = (est_value - cost_basis) if est_value is not None else None

        enriched.append(
            {
                "id": str(doc["_id"]),
                "ticker": doc["ticker"],
                "strike": float(doc["strike"]),
                "expiry": doc["expiry"],
                "type": doc["type"],
                "qty": qty,
                "avg_cost": avg_cost,
                "mode": doc.get("mode", "real"),
                "company": quotes.get(doc["ticker"], {}).get("company", doc["ticker"]),
                "underlying_price": underlying,
                "est_value": round(est_value, 2) if est_value is not None else None,
                "est_price": per_contract,
                "cost_basis": round(cost_basis, 2),
                "pnl": round(pnl, 2) if pnl is not None else None,
                "pnl_percent": (
                    round((pnl / cost_basis) * 100, 2) if pnl is not None and cost_basis else None
                ),
                "dte": dte,
            }
        )
    return enriched


@router.get("")
async def list_options(
    mode: str | None = Query(None, pattern="^(real|paper)$"),
    ticker: str | None = Query(None),
    user: dict = Depends(get_current_user),
):
    query: dict = {"user_id": user["_id"]}
    if mode:
        query["mode"] = mode
    if ticker:
        query["ticker"] = ticker.upper().strip()

    docs = await db.options.find(query).sort("expiry", 1).to_list(500)
    return {"options": await _enrich(docs)}


@router.post("", status_code=201)
async def add_option(payload: OptionCreate, user: dict = Depends(get_current_user)):
    data = payload.normalized()

    await market.validate_symbol(data["ticker"])

    data["user_id"] = user["_id"]
    data["created_at"] = datetime.now(timezone.utc)
    result = await db.options.insert_one(data)
    doc = await db.options.find_one({"_id": result.inserted_id})
    return (await _enrich([doc]))[0]


@router.delete("/{option_id}", status_code=204)
async def delete_option(option_id: str, user: dict = Depends(get_current_user)):
    try:
        oid = ObjectId(option_id)
    except InvalidId as exc:
        raise HTTPException(status_code=400, detail="Invalid option id") from exc

    result = await db.options.delete_one({"_id": oid, "user_id": user["_id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Option position not found")
