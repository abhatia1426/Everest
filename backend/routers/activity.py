from fastapi import APIRouter, Depends, Query

from config import db, iso_utc
from routers.auth import get_current_user

router = APIRouter(tags=["activity"])


@router.get("/activity")
async def get_activity(
    limit: int = Query(10, ge=1, le=50),
    user: dict = Depends(get_current_user),
):
    """Recent account activity, merged from what the user has actually done.

    There is no separate event log; this reads the `created_at` already stored
    on positions, options and watchlist entries. That keeps the feed truthful —
    every row corresponds to a real record — at the cost of only covering
    creations. If edits and deletions need to appear later, the right change is
    a dedicated events collection written on each mutation, which this endpoint
    can then read instead without the frontend noticing.
    """
    query = {"user_id": user["_id"]}
    projection_sort = [("created_at", -1)]

    positions, options, watchlist = (
        await db.positions.find(query).sort(projection_sort).to_list(limit),
        await db.options.find(query).sort(projection_sort).to_list(limit),
        await db.watchlist.find(query).sort(projection_sort).to_list(limit),
    )

    events = []

    for doc in positions:
        if not doc.get("created_at"):
            continue
        events.append(
            {
                "id": str(doc["_id"]),
                "type": "position_added",
                "ticker": doc.get("ticker"),
                "at": iso_utc(doc["created_at"]),
                "mode": doc.get("mode", "real"),
                "detail": {"qty": doc.get("qty"), "avg_cost": doc.get("avg_cost")},
            }
        )

    for doc in options:
        if not doc.get("created_at"):
            continue
        events.append(
            {
                "id": str(doc["_id"]),
                "type": "option_added",
                "ticker": doc.get("ticker"),
                "at": iso_utc(doc["created_at"]),
                "mode": doc.get("mode", "real"),
                "detail": {
                    "type": doc.get("type"),
                    "strike": doc.get("strike"),
                    "expiry": doc.get("expiry"),
                    "qty": doc.get("qty"),
                },
            }
        )

    for doc in watchlist:
        if not doc.get("created_at"):
            continue
        events.append(
            {
                "id": str(doc["_id"]),
                "type": "watchlist_added",
                "ticker": doc.get("ticker"),
                "at": iso_utc(doc["created_at"]),
                "mode": None,
                "detail": {},
            }
        )

    events.sort(key=lambda event: event["at"], reverse=True)
    return {"events": events[:limit]}
