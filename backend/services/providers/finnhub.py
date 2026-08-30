"""Finnhub implementation of the market-data provider interface.

Finnhub is a documented, versioned REST API with real credentials and published
rate limits — a materially different proposition from scraping Yahoo's private
endpoints, which was unversioned, uncontracted, and blocked this machine
outright.

VENDOR QUIRKS THIS MODULE ABSORBS
--------------------------------
1. AN UNKNOWN SYMBOL RETURNS HTTP 200 WITH ZEROS.

       GET /quote?symbol=ZZZZINVALID
       {"c":0,"d":null,"dp":null,"h":0,"l":0,"o":0,"pc":0,"t":0}

   Passed through naively this renders as "$0.00", a real-looking price for a
   security that does not exist. `t == 0` (no trade timestamp) is the reliable
   discriminator and is treated as "unknown symbol", not as a price.

2. MILLIONS, NOT UNITS. `marketCapitalization`, `shareOutstanding` and the
   average-volume metrics are denominated in millions. AAPL comes back as
   4_559_367.68 meaning $4.56T.

3. DIVIDEND YIELD IS ALREADY A PERCENTAGE. Finnhub returns 0.3457 meaning
   0.35%, where yfinance returned the fraction 0.003457. The rest of the app
   (including the frontend's normaliser, which must not change) expects the
   fraction, so it is divided by 100 here — at the boundary, once.

4. NO INTRADAY VOLUME. `/quote` carries no volume field at all, so `volume` is
   None rather than a guess. Average volume comes from `/stock/metric`.

5. CANDLES ARE A PAID FEATURE. `/stock/candle` returns 403 on the free tier.
   That raises `ProviderFeatureUnavailable`, which degrades charts to empty
   without affecting quotes.

The API key is read from the environment and never leaves this process.
"""
import logging
import os
import time
from datetime import datetime, timezone
from typing import Any, Optional

import requests
from requests.adapters import HTTPAdapter

from .base import (
    ProviderAuthError,
    ProviderError,
    ProviderFeatureUnavailable,
    ProviderRateLimited,
)

log = logging.getLogger("everest.finnhub")

BASE_URL = "https://finnhub.io/api/v1"

# Per-request ceiling. `market.py` applies its own, shorter, overall budget;
# this exists so a hung socket cannot occupy a pool thread indefinitely.
_HTTP_TIMEOUT = 6.0

# Finnhub's free tier allows 60 calls/minute. The pool is sized to match
# market.py's bounded concurrency so connections are reused rather than
# renegotiating TLS per symbol.
_POOL_SIZE = 16

MILLION = 1_000_000


def _f(value: Any) -> Optional[float]:
    """Coerce to float, mapping absent/blank/non-numeric to None."""
    if value is None or value == "":
        return None
    try:
        result = float(value)
    except (TypeError, ValueError):
        return None
    return None if result != result else result  # drop NaN


def _scaled(value: Any, factor: int) -> Optional[float]:
    number = _f(value)
    return None if number is None else number * factor


class FinnhubProvider:
    """Finnhub-backed `MarketDataProvider`."""

    name = "finnhub"

    def __init__(self, api_key: Optional[str] = None, session: Optional[requests.Session] = None):
        # Read at construction, not import, so tests can inject a key and a
        # missing key fails loudly at the first call rather than at import.
        self._api_key = api_key if api_key is not None else os.getenv("FINNHUB_API_KEY", "")

        self._session = session or requests.Session()
        adapter = HTTPAdapter(pool_connections=_POOL_SIZE, pool_maxsize=_POOL_SIZE)
        self._session.mount("https://", adapter)

        # Logged once rather than per failed request: a plan limitation is a
        # standing fact, and repeating it every 30s buries everything else.
        self._warned_features: set[str] = set()

    @property
    def configured(self) -> bool:
        return bool(self._api_key)

    # ------------------------------------------------------------ transport

    def _get(self, path: str, params: dict, *, feature: str) -> dict:
        """One GET, with vendor error semantics mapped onto ProviderError."""
        if not self._api_key:
            raise ProviderAuthError(
                "FINNHUB_API_KEY is not configured. Market data is unavailable."
            )

        try:
            response = self._session.get(
                f"{BASE_URL}{path}",
                params={**params, "token": self._api_key},
                timeout=_HTTP_TIMEOUT,
            )
        except requests.Timeout as exc:
            raise ProviderError(f"Finnhub timed out after {_HTTP_TIMEOUT}s", retryable=True) from exc
        except requests.RequestException as exc:
            raise ProviderError(f"Could not reach Finnhub: {exc}", retryable=True) from exc

        status = response.status_code

        if status == 401 or status == 403 and "api key" in response.text.lower():
            raise ProviderAuthError("Finnhub rejected the API key.", status=status)

        if status == 403:
            # Endpoint exists; this plan cannot call it.
            if feature not in self._warned_features:
                self._warned_features.add(feature)
                log.warning(
                    "Finnhub: '%s' is not available on this plan (HTTP 403). "
                    "That feature will degrade; quotes are unaffected.",
                    feature,
                )
            raise ProviderFeatureUnavailable(
                f"Finnhub plan does not include {feature}.", feature=feature
            )

        if status == 429:
            retry_after = response.headers.get("Retry-After")
            raise ProviderRateLimited(
                "Finnhub rate limit reached.",
                retry_after=int(retry_after) if retry_after and retry_after.isdigit() else None,
            )

        if status >= 500:
            raise ProviderError(f"Finnhub server error (HTTP {status}).", retryable=True, status=status)

        if status != 200:
            raise ProviderError(
                f"Unexpected Finnhub response (HTTP {status}).", retryable=True, status=status
            )

        try:
            payload = response.json()
        except ValueError as exc:
            raise ProviderError("Finnhub returned a non-JSON body.", retryable=True) from exc

        if isinstance(payload, dict) and payload.get("error"):
            raise ProviderError(f"Finnhub error: {payload['error']}", retryable=True)

        return payload if isinstance(payload, dict) else {"data": payload}

    # --------------------------------------------------------------- quotes

    def fetch_quote(self, symbol: str) -> dict:
        """GET /quote — c, d, dp, pc, o, h, l, t."""
        data = self._get("/quote", {"symbol": symbol}, feature="quote")

        market_timestamp = int(_f(data.get("t")) or 0)
        price = _f(data.get("c"))

        # Quirk 1: unknown symbols come back as a well-formed all-zero quote.
        # A zero timestamp means no trade was ever reported, which no listed
        # security has. Treated as "unknown", never as a $0.00 price.
        if not market_timestamp or price in (None, 0):
            return {
                "price": None,
                "previous_close": None,
                "change": None,
                "change_percent": None,
                "open": None,
                "day_high": None,
                "day_low": None,
                "volume": None,
                "market_timestamp": None,
            }

        return {
            "price": price,
            "previous_close": _f(data.get("pc")),
            "change": _f(data.get("d")),
            "change_percent": _f(data.get("dp")),
            "open": _f(data.get("o")),
            "day_high": _f(data.get("h")),
            "day_low": _f(data.get("l")),
            # Quirk 4: /quote carries no volume. None, not a guess.
            "volume": None,
            "market_timestamp": market_timestamp,
        }

    # ------------------------------------------------------------ reference

    def fetch_reference(self, symbol: str) -> dict:
        """GET /stock/profile2 + /stock/metric, with units normalised."""
        profile: dict = {}
        metric: dict = {}

        try:
            profile = self._get("/stock/profile2", {"symbol": symbol}, feature="company profile")
        except ProviderFeatureUnavailable:
            pass  # reference data is optional; a quote is still useful without it

        try:
            payload = self._get(
                "/stock/metric", {"symbol": symbol, "metric": "all"}, feature="fundamentals"
            )
            metric = payload.get("metric") or {}
        except ProviderFeatureUnavailable:
            pass

        return {
            "company": profile.get("name") or symbol,
            # Finnhub has no sector taxonomy; finnhubIndustry is the closest
            # equivalent and is what the UI's sector grouping consumes.
            "sector": profile.get("finnhubIndustry"),
            "industry": profile.get("finnhubIndustry"),
            "exchange": profile.get("exchange"),
            "currency": profile.get("currency", "USD"),
            # Quirk 2: millions -> units.
            "market_cap": _scaled(profile.get("marketCapitalization"), MILLION),
            "shares_outstanding": _scaled(profile.get("shareOutstanding"), MILLION),
            "avg_volume": _scaled(metric.get("10DayAverageTradingVolume"), MILLION),
            "pe_ratio": _f(metric.get("peTTM")),
            "forward_pe": _f(metric.get("peNormalizedAnnual")),
            "eps": _f(metric.get("epsTTM")),
            "beta": _f(metric.get("beta")),
            "fifty_two_week_high": _f(metric.get("52WeekHigh")),
            "fifty_two_week_low": _f(metric.get("52WeekLow")),
            # Quirk 3: Finnhub reports a percentage; the app expects a fraction.
            "dividend_yield": (
                None
                if _f(metric.get("dividendYieldIndicatedAnnual")) is None
                else _f(metric.get("dividendYieldIndicatedAnnual")) / 100
            ),
        }

    def fetch_profile(self, symbol: str) -> dict:
        """Descriptive profile for the About panel."""
        try:
            profile = self._get("/stock/profile2", {"symbol": symbol}, feature="company profile")
        except ProviderFeatureUnavailable:
            profile = {}

        return {
            "ticker": symbol,
            "company": profile.get("name") or symbol,
            "sector": profile.get("finnhubIndustry") or "Unknown",
            "industry": profile.get("finnhubIndustry"),
            # Finnhub's free profile has no business description. Returning
            # None is correct — the UI already says "no description available"
            # and inventing one would be worse than the gap.
            "summary": None,
            "weburl": profile.get("weburl"),
        }

    # -------------------------------------------------------------- candles

    def fetch_candles(self, symbol: str, resolution: str, start: int, end: int) -> list[dict]:
        """GET /stock/candle. Raises ProviderFeatureUnavailable on free plans."""
        data = self._get(
            "/stock/candle",
            {"symbol": symbol, "resolution": resolution, "from": start, "to": end},
            feature="historical candles",
        )

        # Finnhub signals an empty window with s="no_data".
        if data.get("s") != "ok":
            return []

        times = data.get("t") or []
        opens = data.get("o") or []
        highs = data.get("h") or []
        lows = data.get("l") or []
        closes = data.get("c") or []
        volumes = data.get("v") or []

        candles = []
        for index, stamp in enumerate(times):
            close = _f(closes[index] if index < len(closes) else None)
            if close is None:
                continue
            candles.append(
                {
                    "time": datetime.fromtimestamp(int(stamp), tz=timezone.utc).isoformat(),
                    "open": round(_f(opens[index] if index < len(opens) else close) or close, 4),
                    "high": round(_f(highs[index] if index < len(highs) else close) or close, 4),
                    "low": round(_f(lows[index] if index < len(lows) else close) or close, 4),
                    "close": round(close, 4),
                    "volume": int(_f(volumes[index] if index < len(volumes) else 0) or 0),
                }
            )
        return candles

    def health(self) -> dict:
        """Cheap diagnostic used by the meta endpoint."""
        return {
            "provider": self.name,
            "configured": self.configured,
            "degraded_features": sorted(self._warned_features),
            "checked_at": time.time(),
        }
