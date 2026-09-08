import asyncio
import json
from datetime import datetime, timezone
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from config import GEMINI_API_KEY, db, iso_utc
from routers.auth import get_current_user
from routers.portfolio import _enrich, _fetch_positions
from services import gemini, market

router = APIRouter(prefix="/ai", tags=["ai"])


class AnalystRequest(BaseModel):
    mode: Literal["real", "paper"] = "real"


class ThesisRequest(BaseModel):
    ticker: str = Field(min_length=1, max_length=10)
    direction: Literal["long", "short"] = "long"
    price_target: Optional[float] = None
    include_news: bool = True


class ScreenerRequest(BaseModel):
    tickers: list[str] = Field(min_length=1, max_length=25)
    style: Literal["growth", "value", "momentum", "dividend"] = "growth"


class EarningsRequest(BaseModel):
    ticker: str = Field(min_length=1, max_length=10)


async def _record_run(user_id, tool: str, result: dict) -> dict:
    ran_at = datetime.now(timezone.utc)
    await db.ai_runs.update_one(
        {"user_id": user_id, "tool": tool},
        {"$set": {"ran_at": ran_at, "result": result}},
        upsert=True,
    )
    return {**result, "ran_at": ran_at.isoformat()}


@router.get("/provider")
async def provider(user: dict = Depends(get_current_user)):
    """What is actually behind the written analysis.

    The UI leads with "Everest AI" and keeps the exact provider and model in a
    secondary tooltip, but it must not HARDCODE either — a pinned model that
    changes in `services/gemini.py` would otherwise leave the tooltip asserting
    something untrue. `configured` lets the workspace show the missing-key state
    before a run is attempted rather than after a 503.
    """
    return {
        "label": "Everest AI",
        "provider": "Google Gemini",
        "model": gemini.MODEL_NAME,
        "configured": bool(GEMINI_API_KEY),
    }


@router.get("/runs")
async def last_runs(user: dict = Depends(get_current_user)):
    docs = await db.ai_runs.find({"user_id": user["_id"]}).to_list(20)
    return {
        "runs": {
            doc["tool"]: {"ran_at": iso_utc(doc["ran_at"]), "result": doc.get("result")}
            for doc in docs
        }
    }


@router.post("/analyst")
async def analyst(payload: AnalystRequest, user: dict = Depends(get_current_user)):
    positions = await _enrich(await _fetch_positions(user["_id"], payload.mode))
    if not positions:
        raise HTTPException(
            status_code=400,
            detail="Add at least one position before running the portfolio analyst.",
        )

    total = sum(p["market_value"] or 0 for p in positions) or 1
    holdings = [
        {
            "ticker": p["ticker"],
            "company": p["company"],
            "sector": p["sector"],
            "weight_percent": round((p["market_value"] or 0) / total * 100, 2),
            "unrealized_pnl": p["unrealized_pnl"],
            "pnl_percent": p["pnl_percent"],
            "day_change_percent": p["change_percent"],
        }
        for p in positions
    ]

    prompt = (
        "Analyse this stock portfolio and return JSON.\n\n"
        f"Total market value: ${total:,.2f}\n"
        f"Holdings:\n{json.dumps(holdings, indent=2)}\n\n"
        "Provide: a 2-3 sentence summary; sector_concentration with each sector's "
        "weight and a one-line comment; risk_flags with severity (low/medium/high), "
        "title and detail covering concentration, correlation and drawdown exposure; "
        "top_performers and detractors ranked by contribution to total P&L, each with "
        "a short note. Be specific and reference the actual numbers."
    )

    result = await gemini.generate_json(prompt, gemini.ANALYST_SCHEMA)
    return await _record_run(user["_id"], "analyst", result)


@router.post("/thesis")
async def thesis(payload: ThesisRequest, user: dict = Depends(get_current_user)):
    symbol = payload.ticker.upper().strip()

    quote = await market.validate_symbol(symbol)

    news_block = ""
    if payload.include_news:
        try:
            from routers.news import get_news  # local import: news is optional

            news = await get_news(symbol, user)
            headlines = [
                f"- [{a['sentiment']}] {a['title']}" for a in news["articles"][:8]
            ]
            if headlines:
                news_block = "Recent headlines:\n" + "\n".join(headlines) + "\n\n"
        except HTTPException:
            news_block = ""

    target_block = (
        f"The user's price target is ${payload.price_target:,.2f}.\n"
        if payload.price_target
        else ""
    )

    prompt = (
        f"Build a {payload.direction} thesis for {symbol} ({quote.get('company')}) and return JSON.\n\n"
        f"Current price: ${quote.get('price')}\n"
        f"Day change: {quote.get('change_percent')}%\n"
        f"Sector: {quote.get('sector')}\n"
        f"Market cap: {quote.get('market_cap')}\n"
        f"P/E: {quote.get('pe_ratio')}\n"
        f"52w range: {quote.get('fifty_two_week_low')} - {quote.get('fifty_two_week_high')}\n"
        f"{target_block}\n{news_block}"
        "Provide 3-5 bull_case points, 3-5 bear_case points, 3-4 key_risks, and a "
        "confidence integer from 1-10 for the stated direction with a one-sentence "
        "confidence_rationale. Each point should be one specific sentence."
    )

    result = await gemini.generate_json(prompt, gemini.THESIS_SCHEMA)
    result.setdefault("ticker", symbol)
    result.setdefault("direction", payload.direction)
    return await _record_run(user["_id"], "thesis", result)


@router.post("/screener")
async def screener(payload: ScreenerRequest, user: dict = Depends(get_current_user)):
    symbols = sorted({t.upper().strip() for t in payload.tickers if t.strip()})
    quotes = await market.get_quotes(symbols)

    rows = [
        {
            "ticker": symbol,
            "company": q.get("company"),
            "sector": q.get("sector"),
            "price": q.get("price"),
            "change_percent": q.get("change_percent"),
            "market_cap": q.get("market_cap"),
            "pe_ratio": q.get("pe_ratio"),
            "fifty_two_week_high": q.get("fifty_two_week_high"),
            "fifty_two_week_low": q.get("fifty_two_week_low"),
        }
        for symbol, q in quotes.items()
    ]

    prompt = (
        f"Rank these tickers for a {payload.style} investing style and return JSON.\n\n"
        f"{json.dumps(rows, indent=2)}\n\n"
        "Return every ticker in `ranked`, ordered best-fit first, with rank starting "
        "at 1, a score from 0-100, a two-sentence rationale tied to the style, and a "
        "verdict of exactly one of: Strong fit, Fit, Watch, Avoid. Also give a "
        "2-sentence summary of the overall set."
    )

    result = await gemini.generate_json(prompt, gemini.SCREENER_SCHEMA)
    result.setdefault("style", payload.style)
    return await _record_run(user["_id"], "screener", result)


@router.post("/earnings")
async def earnings(payload: EarningsRequest, user: dict = Depends(get_current_user)):
    symbol = payload.ticker.upper().strip()

    quote = await market.validate_symbol(symbol)

    profile = await market.get_profile(symbol)

    prompt = (
        f"Write an earnings preparation brief for {symbol} ({quote.get('company')}) "
        "and return JSON.\n\n"
        f"Sector: {quote.get('sector')} | Industry: {profile.get('industry')}\n"
        f"Price: ${quote.get('price')} | Market cap: {quote.get('market_cap')} | "
        f"P/E: {quote.get('pe_ratio')}\n"
        f"Business: {(profile.get('summary') or '')[:900]}\n\n"
        "Provide: next_report (your best estimate of the next reporting window, and "
        "say so if uncertain); analyst_expectations as metric/expectation pairs "
        "(revenue, EPS, key segment growth, guidance); a last_quarter_recap paragraph; "
        "4-6 key_metrics_to_watch; and 3-5 catalysts. If your knowledge may be stale, "
        "say so inside next_report rather than inventing a date."
    )

    result = await gemini.generate_json(prompt, gemini.EARNINGS_SCHEMA)
    result.setdefault("ticker", symbol)
    return await _record_run(user["_id"], "earnings", result)


class CompareRequest(BaseModel):
    tickers: list[str] = Field(min_length=2, max_length=4)


class RiskRequest(BaseModel):
    mode: Literal["real", "paper"] = "real"


@router.post("/compare")
async def compare(payload: CompareRequest, user: dict = Depends(get_current_user)):
    """Side-by-side comparison of 2-4 symbols across valuation and risk."""
    symbols = []
    for raw in payload.tickers:
        symbol = raw.upper().strip()
        if symbol and symbol not in symbols:
            symbols.append(symbol)

    if len(symbols) < 2:
        raise HTTPException(status_code=400, detail="Provide at least two distinct tickers.")

    quotes = await market.get_quotes(symbols)
    profiles = await asyncio.gather(*(market.get_profile(s) for s in symbols))

    rows = []
    for symbol, profile in zip(symbols, profiles):
        quote = quotes.get(symbol, {})
        rows.append(
            {
                "ticker": symbol,
                "company": quote.get("company") or profile.get("company"),
                "sector": quote.get("sector") or profile.get("sector"),
                "industry": quote.get("industry") or profile.get("industry"),
                "price": quote.get("price"),
                "change_percent": quote.get("change_percent"),
                "market_cap": quote.get("market_cap"),
                "pe_ratio": quote.get("pe_ratio"),
                "forward_pe": quote.get("forward_pe"),
                "eps": quote.get("eps"),
                "beta": quote.get("beta"),
                "dividend_yield": quote.get("dividend_yield"),
                "fifty_two_week_high": quote.get("fifty_two_week_high"),
                "fifty_two_week_low": quote.get("fifty_two_week_low"),
            }
        )

    missing = [row["ticker"] for row in rows if row["price"] is None]

    prompt = (
        "Compare these securities and return JSON.\n\n"
        f"{json.dumps(rows, indent=2, default=str)}\n\n"
        + (
            f"Live market data is unavailable for: {', '.join(missing)}. For those, "
            "say so explicitly in the relevant cells rather than estimating a number.\n\n"
            if missing
            else ""
        )
        + "Produce `rows`, one per dimension, covering exactly: Valuation, "
        "Performance, Sector & Business, Fundamentals, Risk. Each row holds one "
        "assessment per ticker with a short `value` (the figure or a dash when "
        "unknown) and a one-sentence `note`. Add 3-5 `risks` that apply across "
        "the set, a 2-3 sentence `summary`, and a `verdict` naming which is "
        "better suited to which kind of investor. Never invent a figure that is "
        "absent from the data above."
    )

    result = await gemini.generate_json(prompt, gemini.COMPARE_SCHEMA)
    result["tickers"] = symbols
    result["unavailable"] = missing
    return await _record_run(user["_id"], "compare", result)


@router.post("/risk")
async def risk(payload: RiskRequest, user: dict = Depends(get_current_user)):
    """Concentration, volatility, sector exposure and diversification review."""
    positions = await _enrich(await _fetch_positions(user["_id"], payload.mode))
    if not positions:
        raise HTTPException(
            status_code=400,
            detail="Add at least one position before running the risk analyzer.",
        )

    total = sum(p["market_value"] or 0 for p in positions) or 1
    quotes = await market.get_quotes([p["ticker"] for p in positions])

    holdings = []
    by_sector: dict[str, float] = {}
    for position in positions:
        quote = quotes.get(position["ticker"], {})
        weight = round((position["market_value"] or 0) / total * 100, 2)
        by_sector[position["sector"]] = by_sector.get(position["sector"], 0) + weight
        holdings.append(
            {
                "ticker": position["ticker"],
                "sector": position["sector"],
                "weight_percent": weight,
                "beta": quote.get("beta"),
                "pe_ratio": quote.get("pe_ratio"),
                "fifty_two_week_high": quote.get("fifty_two_week_high"),
                "fifty_two_week_low": quote.get("fifty_two_week_low"),
                "price_stale": position.get("price_stale", False),
            }
        )

    stale = [h["ticker"] for h in holdings if h["price_stale"]]

    prompt = (
        "Assess the risk profile of this portfolio and return JSON.\n\n"
        f"Holdings:\n{json.dumps(holdings, indent=2, default=str)}\n\n"
        f"Sector weights:\n{json.dumps(by_sector, indent=2)}\n\n"
        + (
            f"Live prices are unavailable for {', '.join(stale)}; those weights are "
            "derived from cost basis. Mention that limitation rather than treating "
            "them as market values.\n\n"
            if stale
            else ""
        )
        + "Return `factors` covering exactly: Concentration, Sector Exposure, "
        "Volatility, Diversification. Each needs a `level` of low/moderate/high, "
        "a one-sentence `finding`, and `evidence` citing the actual weights or "
        "betas above. Add an `overall_level`, a 2-3 sentence `summary`, and 3-5 "
        "`diversification_notes` describing what the portfolio lacks. Reference "
        "only figures present in the data; never estimate a missing one."
    )

    result = await gemini.generate_json(prompt, gemini.RISK_SCHEMA)
    result["mode"] = payload.mode
    result["sector_weights"] = by_sector
    return await _record_run(user["_id"], "risk", result)
