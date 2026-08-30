"""Twelve Data implementation of historical candles.

WHY A SECOND PROVIDER: Finnhub serves live quotes well, but `/stock/candle` is
a paid endpoint — the free tier returns 403. Rather than switch everything, the
two concerns are wired separately: Finnhub keeps quotes, Twelve Data serves
history, and either can be replaced without touching the other.

Twelve Data was chosen over Polygon and Alpha Vantage on request pattern, not
features. Everest asks for history once per watchlist symbol per load, so the
binding constraint is call volume: Alpha Vantage's free tier is 25 requests/DAY
(about two watchlist loads) and Polygon's is 5/minute with no batching. Twelve
Data allows 800/day at 8/minute AND accepts several symbols in one request,
which is what makes sparklines viable.

VENDOR QUIRKS ABSORBED HERE
---------------------------
1. NEWEST FIRST. `values` is returned in descending time order; the app's
   charts assume oldest-first, so the list is reversed.
2. EVERYTHING IS A STRING. `open`, `high`, `close` and `volume` all arrive as
   strings and must be coerced, or the chart silently plots nothing.
3. ERRORS ARE HTTP 200. A bad key or exhausted quota returns 200 with
   `{"code": 401, "status": "error"}` in the body, so the status line cannot be
   trusted on its own.
4. NO TRUE "FROM/TO" ON THE FREE TIER for all intervals; `outputsize` (a bar
   count) is the reliable lever, so the requested time window is converted into
   an approximate bar count.
"""
import logging
import os
from datetime import datetime, timezone
from typing import Any, Optional

import requests
from requests.adapters import HTTPAdapter

from .base import ProviderAuthError, ProviderError, ProviderRateLimited

log = logging.getLogger("everest.twelvedata")

BASE_URL = "https://api.twelvedata.com/time_series"
_HTTP_TIMEOUT = 8.0
_POOL_SIZE = 8

# Twelve Data caps `outputsize` at 5000 on the free tier.
_MAX_BARS = 5000

# Semantic interval (see market.PERIOD_MAP) -> Twelve Data interval token,
# with the interval's length in seconds so a time window can be converted to a
# bar count.
_INTERVALS: dict[str, tuple[str, int]] = {
    "1min": ("1min", 60),
    "5min": ("5min", 5 * 60),
    "15min": ("15min", 15 * 60),
    "30min": ("30min", 30 * 60),
    "1h": ("1h", 60 * 60),
    "1day": ("1day", 24 * 60 * 60),
    "1week": ("1week", 7 * 24 * 60 * 60),
    "1month": ("1month", 30 * 24 * 60 * 60),
}


def _f(value: Any) -> Optional[float]:
    """Coerce to float, mapping absent/blank/non-numeric to None."""
    if value is None or value == "":
        return None
    try:
        result = float(value)
    except (TypeError, ValueError):
        return None
    return None if result != result else result  # drop NaN


def _iso(raw: Any) -> Optional[str]:
    """Twelve Data datetimes -> timezone-aware ISO 8601.

    Daily bars arrive as "2026-08-06"; intraday as "2026-08-06 15:30:00". Both
    are exchange-local without an offset. UTC is attached explicitly so the
    browser cannot re-interpret them as local time.
    """
    if not raw:
        return None
    text = str(raw).strip()
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d"):
        try:
            return datetime.strptime(text, fmt).replace(tzinfo=timezone.utc).isoformat()
        except ValueError:
            continue
    return None


class TwelveDataProvider:
    """Twelve Data-backed historical candle provider."""

    name = "twelvedata"

    def __init__(self, api_key: Optional[str] = None, session: Optional[requests.Session] = None):
        self._api_key = api_key if api_key is not None else os.getenv("TWELVEDATA_API_KEY", "")
        self._session = session or requests.Session()
        adapter = HTTPAdapter(pool_connections=_POOL_SIZE, pool_maxsize=_POOL_SIZE)
        self._session.mount("https://", adapter)

    @property
    def configured(self) -> bool:
        return bool(self._api_key)

    def _map_values(self, values: Any) -> list[dict]:
        """Twelve Data `values` -> the app's candle shape."""
        if values is None:
            return []
        if not isinstance(values, list):
            raise ProviderError("Twelve Data returned a malformed result set.", retryable=True)

        candles = []
        for raw in values:
            if not isinstance(raw, dict):
                continue
            # Quirk 2: every numeric field is a string.
            close = _f(raw.get("close"))
            when = _iso(raw.get("datetime"))
            if close is None or when is None:
                continue
            candles.append(
                {
                    "time": when,
                    "open": round(_f(raw.get("open")) or close, 4),
                    "high": round(_f(raw.get("high")) or close, 4),
                    "low": round(_f(raw.get("low")) or close, 4),
                    "close": round(close, 4),
                    "volume": int(_f(raw.get("volume")) or 0),
                }
            )
        # Quirk 1: guarantee oldest-first regardless of what `order` did.
        candles.sort(key=lambda candle: candle["time"])
        return candles

    def _raise_for_error_body(self, payload: dict) -> None:
        """Quirk 3: failures arrive as HTTP 200 with an error body."""
        code = payload.get("code")
        message = payload.get("message") or "unknown error"
        if code in (401, 403):
            raise ProviderAuthError(f"Twelve Data rejected the API key: {message}", status=code)
        if code == 429:
            raise ProviderRateLimited(f"Twelve Data quota exhausted: {message}")
        raise ProviderError(f"Twelve Data error: {message}", retryable=code not in (400, 404))

    def _request(self, symbol_param: str, resolution: str, start: int, end: int) -> dict:
        """One HTTP call. `symbol_param` may be a comma-separated list."""
        if not self._api_key:
            raise ProviderAuthError(
                "TWELVEDATA_API_KEY is not configured. Historical data is unavailable."
            )

        interval, seconds_per_bar = _INTERVALS.get(resolution, _INTERVALS["1day"])
        span = max(int(end) - int(start), seconds_per_bar)
        outputsize = max(2, min(int(span / seconds_per_bar) + 2, _MAX_BARS))

        try:
            response = self._session.get(
                BASE_URL,
                params={
                    "symbol": symbol_param,
                    "interval": interval,
                    "outputsize": outputsize,
                    "order": "ASC",
                    "apikey": self._api_key,
                },
                timeout=_HTTP_TIMEOUT,
            )
        except requests.Timeout as exc:
            raise ProviderError(
                f"Twelve Data timed out after {_HTTP_TIMEOUT}s", retryable=True
            ) from exc
        except requests.RequestException as exc:
            raise ProviderError(f"Could not reach Twelve Data: {exc}", retryable=True) from exc

        if response.status_code == 429:
            raise ProviderRateLimited("Twelve Data rate limit reached.")
        if response.status_code >= 500:
            raise ProviderError(
                f"Twelve Data server error (HTTP {response.status_code}).",
                retryable=True,
                status=response.status_code,
            )

        try:
            payload = response.json()
        except ValueError as exc:
            raise ProviderError("Twelve Data returned a non-JSON body.", retryable=True) from exc

        if not isinstance(payload, dict):
            raise ProviderError("Twelve Data returned an unexpected payload.", retryable=True)

        if payload.get("status") == "error":
            self._raise_for_error_body(payload)

        return payload

    def fetch_candles_batch(
        self, symbols: list[str], resolution: str, start: int, end: int
    ) -> dict[str, list[dict]]:
        """OHLCV for SEVERAL symbols in ONE request.

        This is the difference between a working watchlist and a rate-limited
        one. The free tier allows 8 API CALLS per minute; a six-symbol
        watchlist fanned out per-symbol exhausts that on a single page load,
        and every chart then silently renders empty. Batched, the same page
        costs one call.

        Twelve Data changes the response SHAPE for a batch: a single symbol
        returns {"values": [...]} at the top level, while several return
        {"AAPL": {"values": [...]}, "MSFT": {...}}. Both are handled.
        """
        wanted = [s.upper().strip() for s in symbols if s and s.strip()]
        if not wanted:
            return {}

        payload = self._request(",".join(wanted), resolution, start, end)

        # Single-symbol requests come back unwrapped.
        if "values" in payload or "meta" in payload:
            only = wanted[0]
            return {only: self._map_values(payload.get("values"))}

        results: dict[str, list[dict]] = {}
        for symbol in wanted:
            entry = payload.get(symbol)
            if not isinstance(entry, dict):
                results[symbol] = []
                continue
            # A per-symbol failure inside a batch must not fail the batch.
            if entry.get("status") == "error":
                log.warning(
                    "Twelve Data: no history for %s (%s)", symbol, entry.get("message")
                )
                results[symbol] = []
                continue
            results[symbol] = self._map_values(entry.get("values"))
        return results

    def fetch_candles(self, symbol: str, resolution: str, start: int, end: int) -> list[dict]:
        """OHLCV bars for a symbol between two epoch-second bounds."""
        return self.fetch_candles_batch([symbol], resolution, start, end).get(
            symbol.upper().strip(), []
        )

    def health(self) -> dict:
        return {"provider": self.name, "configured": self.configured}
