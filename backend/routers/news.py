from fastapi import APIRouter, Depends

from routers.auth import get_current_user
from services import market, news

router = APIRouter(prefix="/news", tags=["news"])


@router.get("/{ticker}")
async def get_news(ticker: str, _user: dict = Depends(get_current_user)):
    """Recent news for a ticker, with sentiment.

    Thin by design: query construction, provider selection, failure
    normalisation and sentiment tagging all live in `services/news.py`, so this
    router has no vendor knowledge and no error branches of its own.

    ALWAYS RETURNS 200. A news outage is not a page error — price, chart,
    statistics and holdings on the company detail page are all still usable
    without headlines. The payload's `status` field carries what happened
    (`ok`, `no_articles`, `provider_unavailable`, `not_configured`) so the UI
    can say something accurate instead of rendering a failure banner over a
    working page.
    """
    symbol = ticker.upper().strip()

    # The profile gives a real company name, which is a far better search term
    # than a bare ticker. A profile outage is not fatal — `get_company_news`
    # falls back to the symbol.
    profile = await market.get_profile(symbol)
    company = profile.get("company") or symbol

    return await news.get_company_news(symbol, company)
