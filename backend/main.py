"""Everest API - stock trading tracker backend."""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from config import ensure_indexes
from routers import activity, ai, auth, news, options, portfolio, prices, watchlist

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("everest")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    try:
        await ensure_indexes()
        log.info("Everest: MongoDB indexes ready")
    except Exception:  # noqa: BLE001 - API should still boot if Mongo is briefly down
        log.exception("Everest: could not create MongoDB indexes")
    yield


app = FastAPI(
    title="Everest API",
    description="Navigate the markets with confidence.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:4173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(prices.router)
app.include_router(portfolio.router)
app.include_router(watchlist.router)
app.include_router(news.router)
app.include_router(options.router)
app.include_router(ai.router)
app.include_router(activity.router)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Return JSON for unhandled errors instead of Starlette's plain-text body.

    WHY THIS EXISTS: an unhandled exception previously produced the literal
    bytes `Internal Server Error` with a text/plain content type. The frontend
    parses every response body as JSON, so the user was shown

        Unexpected token 'I', "Internal S"... is not valid JSON

    — a parser error that says nothing about what actually broke and sends you
    looking in the wrong layer entirely. A 500 is still a 500; this only makes
    it legible, and makes the API's contract "always JSON" unconditional.

    The exception is logged with its full traceback server-side. The response
    body deliberately does NOT include it: exception text can carry connection
    strings, file paths and query fragments, and this endpoint is reachable by
    any authenticated user.
    """
    log.exception(
        "Unhandled error on %s %s", request.method, request.url.path, exc_info=exc
    )
    return JSONResponse(
        status_code=500,
        content={
            "detail": (
                "Something went wrong on the Everest server. The error has been "
                "logged. Please try again."
            ),
            "error_type": type(exc).__name__,
            "path": request.url.path,
        },
    )


@app.get("/health", tags=["meta"])
async def health():
    return {"status": "ok", "service": "everest"}


@app.get("/health/providers", tags=["meta"])
async def provider_health():
    """Configuration health for every external provider.

    Reports whether each integration is configured and whether its key LOOKS
    right — never the key itself, and never enough of one to reconstruct it.
    Deliberately unauthenticated and secret-free so it can be checked from a
    deploy script or a browser tab when something is not loading.
    """
    from services import market, news
    from services.providers import get_history_provider, get_provider

    quote_provider = get_provider()
    history_provider = get_history_provider()

    return {
        "quotes": {
            "provider": quote_provider.name,
            "configured": getattr(quote_provider, "configured", True),
            **market.provider_status(),
        },
        "history": {
            "provider": history_provider.name,
            "configured": getattr(history_provider, "configured", False),
            # True when history is only falling back to the quote provider,
            # which cannot serve candles on its current plan.
            "usingQuoteProviderFallback": history_provider is quote_provider,
            **market.history_status(),
            **market.credit_status(),
        },
        "news": news.news_diagnostics(),
    }
