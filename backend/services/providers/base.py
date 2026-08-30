"""The market-data provider boundary.

Everything provider-specific lives behind this interface. `services/market.py`
owns caching, staleness, the circuit breaker and de-duplication — policy that
should not change when the data source does — and knows nothing about which
vendor is answering.

The previous migration (yfinance -> Finnhub) touched exactly one implementation
of this interface plus a one-line wiring change, which is the point.

CONTRACT FOR IMPLEMENTATIONS
----------------------------
* Return plain dicts in the canonical shapes documented below. Mapping vendor
  field names, units and quirks is the provider's job, never the caller's.
* Raise `ProviderError` (or a subclass) for anything the caller should treat as
  a provider problem. Never return a fabricated price to paper over a failure —
  a missing price is `None`, and the layer above renders that honestly.
* Be synchronous and blocking. `market.py` runs implementations on a thread
  pool; adding async here would duplicate concurrency control in two places.
"""
from typing import Optional, Protocol


class ProviderError(Exception):
    """A provider call failed in a way the caller should know about.

    `retryable` distinguishes "try again shortly" (throttling, timeout, 5xx)
    from "this will fail identically next time" (bad credentials, a plan that
    does not include the endpoint). The circuit breaker only counts retryable
    failures — tripping it on a permanent misconfiguration would just hide the
    misconfiguration behind a cool-off timer.
    """

    def __init__(self, message: str, *, retryable: bool = True, status: Optional[int] = None):
        super().__init__(message)
        self.retryable = retryable
        self.status = status


class ProviderAuthError(ProviderError):
    """Missing, invalid or unauthorised credentials. Never retryable."""

    def __init__(self, message: str, status: Optional[int] = None):
        super().__init__(message, retryable=False, status=status)


class ProviderRateLimited(ProviderError):
    """Throttled. Retryable, and the circuit breaker should back off."""

    def __init__(self, message: str, retry_after: Optional[int] = None):
        super().__init__(message, retryable=True, status=429)
        self.retry_after = retry_after


class ProviderFeatureUnavailable(ProviderError):
    """The endpoint exists but this account's plan does not include it.

    Distinct from an outage: retrying cannot help, and the correct response is
    to degrade that one feature while everything else keeps working. Finnhub's
    free tier returns 403 for historical candles, which is exactly this case.
    """

    def __init__(self, message: str, feature: str):
        super().__init__(message, retryable=False, status=403)
        self.feature = feature


class MarketDataProvider(Protocol):
    """What `services/market.py` requires of a data source."""

    name: str

    def fetch_quote(self, symbol: str) -> dict:
        """Current price fields for one symbol.

        Returns, with `None` for anything genuinely unknown:

            {
              "price": float | None,
              "previous_close": float | None,
              "change": float | None,
              "change_percent": float | None,
              "open": float | None,
              "day_high": float | None,
              "day_low": float | None,
              "volume": int | None,
              "market_timestamp": int | None,   # epoch seconds, exchange time
            }

        A symbol the provider does not recognise returns price=None rather
        than raising — an unknown ticker is not a provider failure, and
        conflating the two produces "Yahoo is down" messages for typos.
        """
        ...

    def fetch_reference(self, symbol: str) -> dict:
        """Slow-moving company and fundamental fields.

            {
              "company", "sector", "industry", "exchange", "currency",
              "market_cap", "pe_ratio", "eps", "beta", "avg_volume",
              "dividend_yield", "shares_outstanding",
              "fifty_two_week_high", "fifty_two_week_low",
            }

        Every key optional. Units must already be normalised to the app's
        conventions by the implementation.
        """
        ...

    def fetch_profile(self, symbol: str) -> dict:
        """Descriptive company data: {ticker, company, sector, industry, summary}."""
        ...

    def fetch_candles(self, symbol: str, resolution: str, start: int, end: int) -> list[dict]:
        """OHLCV bars between two epoch-second bounds.

        Returns [{time (ISO 8601), open, high, low, close, volume}], oldest
        first. An empty list means "no data for this window", which is a valid
        answer; inability to serve the endpoint at all must raise
        `ProviderFeatureUnavailable`.
        """
        ...
