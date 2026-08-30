"""Shared configuration and MongoDB connection for Everest."""
import os
from datetime import datetime, timezone

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv()

MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017/everest")
DB_NAME = "everest"
JWT_SECRET = os.getenv("JWT_SECRET", "change-me-in-production")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_HOURS = 24 * 7

NEWS_API_KEY = os.getenv("NEWS_API_KEY", "")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

_client = AsyncIOMotorClient(MONGO_URI)
db = _client[DB_NAME]


def iso_utc(value: datetime | None) -> str | None:
    """Serialise a datetime as an explicit UTC ISO string.

    MongoDB returns naive datetimes even when tz-aware values were written, so
    a bare .isoformat() produces no offset and browsers parse it as *local*
    time — which renders past events as "in 5 hours". Always go through here.
    """
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat()


async def ensure_indexes() -> None:
    await db.users.create_index("email", unique=True)
    await db.positions.create_index([("user_id", 1), ("mode", 1)])
    await db.options.create_index([("user_id", 1), ("mode", 1)])
    await db.watchlist.create_index([("user_id", 1), ("ticker", 1)], unique=True)
