"""Market data: caching, staleness and failure policy.

PROVIDER-AGNOSTIC BY DESIGN. Everything vendor-specific lives in
`services/providers/`; this module owns the policy that should survive a change
of data source. It was migrated from yfinance to Finnhub by swapping one
implementation of `MarketDataProvider` — nothing here, in the routers, or in
the frontend needed provider knowledge.

Why the move: yfinance scrapes Yahoo's private, unversioned endpoints. It has
no contract, no credentials, no published rate limits, and it blocked this
project's machines outright — every call returning an HTML error page that
surfaced as `Expecting value: line 1 column 1`. Finnhub is a documented REST
API with a real key and stated limits.

QUOTE PIPELINE
--------------
Providers are synchronous and network-bound, so every call runs on a thread
pool. The layer around them exists because a public market-data API is
unreliable and rate-limited, and a naive design amplifies that instead of
absorbing it:

  * PARALLEL fetch across symbols. A sequential loop made N symbols cost N
    round trips even though they are independent.
  * PER-SYMBOL in-flight de-duplication, so ten concurrent callers asking for
    AAPL produce one provider call — and asking for AAPL never blocks a caller
    who wants MSFT. This replaced a single global lock that serialised every
    caller in the process end to end (a dashboard load measured 39s).
  * STALE-WHILE-REVALIDATE: the last good quote is retained past its freshness
    window and served immediately (flagged `stale`) while a refresh runs
    behind it. A slow provider delays freshness, never the response.
  * A CIRCUIT BREAKER: after repeated TRANSIENT failures we stop calling the
    provider for a cool-off period and serve last-good or unavailable
    instantly. Permanent failures — a bad key, an unentitled endpoint — are
    deliberately excluded, because backing off would disguise a fixable
    misconfiguration as an outage.
  * SPLIT TTLs: prices move per tick, reference fields (sector, beta, EPS)
    per quarter. Cached separately, so a price refresh never re-downloads a
    company profile.

Every quote carries provenance — `fetched_at`, `market_timestamp`, `source`,
`stale` — so the UI can distinguish live from delayed from cached from
unavailable rather than guessing. Nothing here ever invents a price.
"""
import asyncio
import logging
import re
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Optional

from .providers import (
    ProviderError,
    ProviderFeatureUnavailable,
    ProviderRateLimited,
    get_history_provider,
    get_provider,
)

log = logging.getLogger("everest.market")

# --- freshness windows -----------------------------------------------------
# A quote is served without any provider call inside this window.
_QUOTE_FRESH_TTL = 15.0
# Past FRESH but inside this window the cached quote is still served (flagged
# stale) while a refresh runs. Chosen well under a trading session so a price
# can never look current when it is hours old.
_QUOTE_STALE_TTL = 10 * 60.0
# Reference fields change on an earnings cadence, not a tick cadence.
_REFERENCE_TTL = 6 * 60 * 60.0
# History TTLs are per-resolution because the data's own volatility differs by
# orders of magnitude: a closed daily bar never changes again, while the newest
# intraday bar moves every few minutes. Long TTLs are also what make the
# provider's credit budget survivable — see _CREDITS_PER_MINUTE.
_HISTORY_TTL = 60.0
_HISTORY_TTL_BY_RESOLUTION = {
    "1min": 60.0,
    "5min": 5 * 60.0,
    "15min": 10 * 60.0,
    "1h": 30 * 60.0,
    "1day": 6 * 60 * 60.0,
    "1week": 24 * 60 * 60.0,
}


def _history_ttl(resolution: str) -> float:
    return _HISTORY_TTL_BY_RESOLUTION.get(resolution, _HISTORY_TTL)


# PROVIDER CREDIT BUDGET.
#
# Twelve Data's free tier allows 8 CREDITS per minute. A credit is charged per
# symbol, but NOT one-for-one: an 8-symbol request was billed 13 credits, so
# the multiplier varies with interval and output size. Measured, not assumed.
#
# The budget is therefore set conservatively below the nominal limit. Requests
# that exceed it come back 429 AND still consume quota, so overshooting is
# strictly worse than under-requesting: the remainder is simply fetched in the
# next window and cached (history TTLs are long precisely so this accumulates).
#
# CONSEQUENCE, stated plainly: a large portfolio's performance chart takes
# several minutes to fill on a cold cache. Single-symbol charts and a typical
# watchlist fit in one window. A paid plan removes this entirely.
_SYMBOLS_PER_WINDOW = 4
_CREDITS_PER_MINUTE = _SYMBOLS_PER_WINDOW
_credit_window_start: float = 0.0
_credits_spent: int = 0


def _credits_available() -> int:
    global _credit_window_start, _credits_spent
    now = time.monotonic()
    if now - _credit_window_start >= 60.0:
        _credit_window_start = now
        _credits_spent = 0
    return max(0, _CREDITS_PER_MINUTE - _credits_spent)


def _spend_credits(count: int) -> None:
    global _credits_spent
    _credits_spent += count


def credit_status() -> dict:
    """Diagnostic: how much provider budget is left in the current window."""
    return {
        "credits_per_minute": _CREDITS_PER_MINUTE,
        "credits_available": _credits_available(),
    }
_PROFILE_TTL = 60 * 60.0

# --- provider failure handling ---------------------------------------------
# Consecutive failed provider calls before we stop trying.
_CIRCUIT_FAILURE_THRESHOLD = 3
# How long the circuit stays open. Long enough for a Yahoo throttle to clear,
# short enough that recovery is not noticeable.
_CIRCUIT_OPEN_SECONDS = 90.0
# Bound concurrency so "parallel" does not become "hammer the provider".
_MAX_PROVIDER_CONCURRENCY = 8
# Hard ceiling on how long a REQUEST waits for the provider — shorter than the
# provider's own per-call timeout, so one unreachable symbol never dictates the
# latency of a whole page. On timeout the worker thread keeps running and its
# result still populates the cache, so the work is not wasted; the user is
# simply not made to wait for it.
_PROVIDER_TIMEOUT = 4.0

# period -> (semantic interval, lookback in seconds)
#
# Lives here rather than in the routers because `routers/prices.py` validates
# the caller's `period` against it — the API's accepted values and the data
# layer's vocabulary must not be able to drift apart.
#
# The KEYS are the app's contract with the frontend and must never change. The
# INTERVAL tokens are deliberately semantic ("1day", not Finnhub's "D" or
# Twelve Data's "1day"), so adding a provider means writing one mapping table
# inside that provider rather than editing this constant. It has already
# survived yfinance -> Finnhub -> Twelve Data unchanged.
PERIOD_MAP: dict[str, tuple[str, int]] = {
    "1h": ("1min", 60 * 60),
    "1d": ("5min", 24 * 60 * 60),
    "1w": ("15min", 7 * 24 * 60 * 60),
    "1m": ("1h", 31 * 24 * 60 * 60),
    "3m": ("1day", 92 * 24 * 60 * 60),
    "6m": ("1day", 183 * 24 * 60 * 60),
    "1y": ("1day", 366 * 24 * 60 * 60),
    "all": ("1week", 10 * 365 * 24 * 60 * 60),
}

_cache: dict[str, tuple[float, Any]] = {}

# History rate-limit cool-off.
#
# Twelve Data's free tier allows 8 API calls per minute. Once throttled, every
# further call inside that window is refused AND still counts, so retrying
# spends the next minute's budget before it exists. Recording the cool-off lets
# us fail fast locally and come back with a full quota.
_HISTORY_BACKOFF_SECONDS = 60.0
_history_backoff_until: float = 0.0


def _history_throttled() -> bool:
    return time.monotonic() < _history_backoff_until


def _note_history_throttled() -> None:
    global _history_backoff_until
    _history_backoff_until = time.monotonic() + _HISTORY_BACKOFF_SECONDS
    log.warning(
        "History provider rate limited — backing off for %.0fs", _HISTORY_BACKOFF_SECONDS
    )


def history_status() -> dict:
    """Diagnostic: is history currently backing off, and for how long."""
    remaining = max(0.0, _history_backoff_until - time.monotonic())
    return {"rate_limited": remaining > 0, "retry_after_seconds": int(remaining)}
_executor = ThreadPoolExecutor(max_workers=_MAX_PROVIDER_CONCURRENCY, thread_name_prefix="yf")

# symbol -> asyncio.Task, so concurrent callers share one in-flight fetch.
_inflight: dict[str, "asyncio.Task"] = {}


def _get_cached(key: str, ttl: float) -> Optional[Any]:
    hit = _cache.get(key)
    if hit and (time.monotonic() - hit[0]) < ttl:
        return hit[1]
    return None


def _set_cached(key: str, value: Any) -> None:
    _cache[key] = (time.monotonic(), value)


def _cached_entry(key: str) -> Optional[tuple[float, Any]]:
    """Cache read that also reports age, for stale-while-revalidate."""
    hit = _cache.get(key)
    if not hit:
        return None
    return (time.monotonic() - hit[0], hit[1])


class _Circuit:
    """Trips after repeated provider failures; recovers automatically.

    Without this, a Yahoo outage made every navigation pay a multi-second
    timeout per symbol — the app got dramatically slower at exactly the moment
    it had no data to show.
    """

    def __init__(self) -> None:
        self.failures = 0
        self.opened_at: Optional[float] = None

    @property
    def is_open(self) -> bool:
        if self.opened_at is None:
            return False
        if (time.monotonic() - self.opened_at) >= _CIRCUIT_OPEN_SECONDS:
            # Cool-off elapsed: half-open, let the next call probe the provider.
            self.opened_at = None
            self.failures = 0
            return False
        return True

    def record_success(self) -> None:
        self.failures = 0
        self.opened_at = None

    def record_failure(self) -> None:
        self.failures += 1
        if self.failures >= _CIRCUIT_FAILURE_THRESHOLD and self.opened_at is None:
            self.opened_at = time.monotonic()

    def retry_after(self) -> Optional[int]:
        if self.opened_at is None:
            return None
        remaining = _CIRCUIT_OPEN_SECONDS - (time.monotonic() - self.opened_at)
        return max(0, int(remaining))


_circuit = _Circuit()


def provider_status() -> dict:
    """Provider health, for diagnostics and the UI's degraded banner."""
    return {
        "circuit_open": _circuit.is_open,
        "consecutive_failures": _circuit.failures,
        "retry_after_seconds": _circuit.retry_after(),
    }


def _blocking_reference(symbol: str) -> dict:
    """Slow-moving company fields, from the active provider.

    Kept separate from the price path because reference data changes on an
    earnings cadence while prices change per tick — so the two are cached with
    very different TTLs and a price refresh never re-fetches a profile.
    """
    return get_provider().fetch_reference(symbol)


def _blocking_price(symbol: str) -> dict:
    """Just the price fields, from the active provider."""
    return get_provider().fetch_quote(symbol)


def _compose_quote(symbol: str, price_part: dict, reference: dict) -> dict:
    """Merge the fast price fields with cached reference fields."""
    price = price_part.get("price")
    prev = price_part.get("previous_close")

    # Prefer the provider's own change figures — Finnhub returns `d` and `dp`
    # computed against the official previous close, which is more authoritative
    # than re-deriving them here. Derive only when the provider omits them.
    change = price_part.get("change")
    change_percent = price_part.get("change_percent")
    if change is None and price is not None and prev:
        change = float(price) - float(prev)
    if change_percent is None and change is not None and prev:
        change_percent = (change / float(prev)) * 100

    quote = {
        "ticker": symbol,
        "price": price,
        "previous_close": prev,
        "change": change,
        "change_percent": change_percent,
        "open": price_part.get("open"),
        "day_high": price_part.get("day_high"),
        "day_low": price_part.get("day_low"),
        "volume": price_part.get("volume"),
        # Provenance. `fetched_at` is when WE called the provider;
        # `market_timestamp` is when the exchange last traded. They answer
        # different questions and the UI needs both — so the exchange stamp
        # comes from the QUOTE payload, where the provider reports it, not
        # from the long-lived reference cache.
        "market_timestamp": price_part.get("market_timestamp"),
        "fetched_at": time.time(),
        "source": "live",
        "stale": False,
    }
    quote.update({k: v for k, v in reference.items() if k not in quote or quote[k] is None})
    return quote


def _blocking_quote(symbol: str) -> dict:
    """One symbol, fully composed. Never raises — a bad symbol must not fail a batch."""
    try:
        reference = _get_cached(f"ref:{symbol}", _REFERENCE_TTL)
        if reference is None:
            reference = _blocking_reference(symbol)
            _set_cached(f"ref:{symbol}", reference)

        price_part = _blocking_price(symbol)
        return _compose_quote(symbol, price_part, reference)
    except ProviderError as exc:
        # Structured provider failure: preserve retryability for the breaker.
        return {
            "ticker": symbol,
            "error": str(exc),
            "price": None,
            "source": "unavailable",
            "stale": True,
            "retryable": exc.retryable,
            "fetched_at": time.time(),
        }
    except Exception as exc:  # noqa: BLE001
        # Failures carry the same provenance shape as successes, so the client
        # never has to special-case "quote that happens to be an error".
        return {
            "ticker": symbol,
            "error": str(exc),
            "price": None,
            "source": "unavailable",
            "stale": True,
            "fetched_at": time.time(),
        }


def _blocking_quotes(tickers: list[str]) -> dict[str, dict]:
    """Batch fetch, preserved for callers and tests that use it directly.

    Now runs symbols in PARALLEL. Previously this was a sequential loop, so a
    portfolio of eight positions cost eight serial round trips.
    """
    if not tickers:
        return {}
    results = _executor.map(_blocking_quote, tickers)
    return {quote["ticker"]: quote for quote in results}


def _mark_stale(quote: dict, age_seconds: float) -> dict:
    """Copy of a cached quote, labelled honestly as not-fresh."""
    stale = dict(quote)
    stale["stale"] = True
    stale["source"] = "cache"
    stale["cache_age_seconds"] = round(age_seconds, 1)
    return stale


async def _fetch_symbol(symbol: str) -> dict:
    """Fetch one symbol, de-duplicated across concurrent callers.

    The old code took a single global lock around the whole batch, so every
    caller in the process queued behind every other caller. Keying in-flight
    work by SYMBOL means concurrent requests share work where they overlap and
    run independently where they do not.
    """
    existing = _inflight.get(symbol)
    if existing is not None:
        return await asyncio.shield(existing)

    async def _run() -> dict:
        try:
            quote = await asyncio.get_running_loop().run_in_executor(
                _executor, _blocking_quote, symbol
            )
            # Only transient failures count toward the breaker. A bad API key
            # or an unentitled endpoint fails identically forever, and hiding
            # that behind a cool-off timer makes it look like an outage.
            if (
                quote.get("price") is None
                and provider_is_down(quote)
                and not provider_misconfigured(quote)
            ):
                _circuit.record_failure()
            else:
                _circuit.record_success()
                _set_cached(f"quote:{symbol}", quote)
            return quote
        finally:
            _inflight.pop(symbol, None)

    task = asyncio.create_task(_run())
    _inflight[symbol] = task

    try:
        # `shield` so a timeout here never cancels the underlying fetch — it
        # keeps running and warms the cache for the next request.
        return await asyncio.wait_for(asyncio.shield(task), timeout=_PROVIDER_TIMEOUT)
    except asyncio.TimeoutError:
        # A timeout is a provider-health signal, not a symbol problem.
        _circuit.record_failure()
        return {
            "ticker": symbol,
            "price": None,
            "error": f"Market data provider did not respond within {_PROVIDER_TIMEOUT:.0f}s",
            "source": "unavailable",
            "stale": True,
        }


async def get_quotes(tickers: list[str]) -> dict[str, dict]:
    """Return a quote dict keyed by uppercase ticker.

    Resolution order per symbol:
      1. fresh cache        -> returned as-is, no provider call
      2. circuit open       -> last good quote, flagged stale; never a call
      3. stale cache        -> served immediately, refresh kicked off behind it
      4. otherwise          -> awaited provider fetch (parallel across symbols)

    A symbol we have never seen is the only case that can block, and only for
    as long as that one symbol takes.
    """
    symbols = sorted({t.upper().strip() for t in tickers if t.strip()})
    if not symbols:
        return {}

    results: dict[str, dict] = {}
    to_fetch: list[str] = []

    circuit_open = _circuit.is_open

    for symbol in symbols:
        entry = _cached_entry(f"quote:{symbol}")

        if entry is not None:
            age, quote = entry
            if age < _QUOTE_FRESH_TTL:
                results[symbol] = quote
                continue
            if age < _QUOTE_STALE_TTL:
                # Serve now, refresh behind. The user sees a price immediately
                # and it is truthfully labelled as cached.
                results[symbol] = _mark_stale(quote, age)
                if not circuit_open:
                    to_fetch.append(symbol)
                continue

        if circuit_open:
            # Past the stale window with the provider known-down: report
            # unavailable rather than serving a price that may be hours old.
            results[symbol] = {
                "ticker": symbol,
                "price": None,
                "error": "Market data provider is temporarily unavailable (backing off)",
                "source": "unavailable",
                "stale": True,
                "retry_after_seconds": _circuit.retry_after(),
            }
        else:
            to_fetch.append(symbol)

    if to_fetch:
        blocking = [s for s in to_fetch if s not in results]
        background = [s for s in to_fetch if s in results]

        # Symbols we already answered from stale cache refresh in the
        # background — the response does not wait for them.
        for symbol in background:
            asyncio.ensure_future(_fetch_symbol(symbol))

        if blocking:
            fetched = await asyncio.gather(
                *(_fetch_symbol(symbol) for symbol in blocking), return_exceptions=True
            )
            for symbol, quote in zip(blocking, fetched):
                if isinstance(quote, Exception):
                    results[symbol] = {"ticker": symbol, "price": None, "error": str(quote)}
                else:
                    results[symbol] = quote

    return results


def _blocking_history(ticker: str, resolution: str, lookback_seconds: int) -> list[dict]:
    """OHLC bars from the active provider.

    A plan that does not include historical data degrades to an empty series
    rather than an error: charts show their own "no history" state while
    quotes, positions and valuations continue to work. The provider logs the
    limitation once.
    """
    if _history_throttled():
        return []

    end = int(time.time())
    start = end - int(lookback_seconds)
    try:
        # A DEDICATED history provider: Finnhub serves quotes well but puts
        # candles behind a paid plan, so the two concerns are wired separately
        # and either can be swapped without touching the other.
        return get_history_provider().fetch_candles(ticker, resolution, start, end)
    except ProviderFeatureUnavailable:
        return []
    except ProviderRateLimited:
        _note_history_throttled()
        return []
    except ProviderError:
        # History is not load-bearing: the chart shows its own empty state
        # while quotes, valuations and holdings continue to work.
        log.warning("History unavailable for %s (%s)", ticker, resolution, exc_info=True)
        return []


async def get_history(ticker: str, period: str = "1w") -> list[dict]:
    symbol = ticker.upper().strip()
    key = period.lower().strip()
    resolution, lookback = PERIOD_MAP.get(key, PERIOD_MAP["1w"])

    cache_key = f"hist:{symbol}:{key}"
    cached = _get_cached(cache_key, _history_ttl(resolution))
    if cached is not None:
        return cached

    candles = await asyncio.to_thread(_blocking_history, symbol, resolution, lookback)
    if key == "1h" and candles:
        candles = candles[-60:]
    _set_cached(cache_key, candles)
    return candles


async def get_histories(tickers: list[str], period: str = "1w") -> dict[str, list[dict]]:
    """History for SEVERAL symbols, batched into one provider call when possible.

    WHY THIS EXISTS: the watchlist and the portfolio-history endpoint each
    fanned out one `get_history` per symbol. Against Twelve Data's free tier
    (8 API CALLS per minute) a six-symbol watchlist exhausted the quota on a
    single page load, and every chart then rendered empty with no visible
    error — the provider degrades to an empty series by design.

    Batching turns that page into ONE call. Cached symbols are served without
    touching the provider at all, so only the genuinely missing ones are
    requested.
    """
    symbols = sorted({t.upper().strip() for t in tickers if t and t.strip()})
    if not symbols:
        return {}

    key = period.lower().strip()
    resolution, lookback = PERIOD_MAP.get(key, PERIOD_MAP["1w"])

    results: dict[str, list[dict]] = {}
    missing: list[str] = []
    for symbol in symbols:
        cached = _get_cached(f"hist:{symbol}:{key}", _history_ttl(resolution))
        if cached is not None:
            results[symbol] = cached
        else:
            missing.append(symbol)

    if not missing:
        return results

    provider = get_history_provider()
    batch = getattr(provider, "fetch_candles_batch", None)

    if not callable(batch):
        # Provider has no batch endpoint — fall back to the per-symbol path.
        fetched = await asyncio.gather(
            *(get_history(symbol, key) for symbol in missing), return_exceptions=True
        )
        for symbol, candles in zip(missing, fetched):
            results[symbol] = [] if isinstance(candles, Exception) else candles
        return results

    end = int(time.time())
    start = end - int(lookback)

    if _history_throttled():
        for symbol in missing:
            results[symbol] = []
        return results

    # Spend only what the current window allows. Symbols we cannot afford are
    # left uncached, so the next call picks them up with a fresh budget rather
    # than being locked out by a cached empty.
    affordable = _credits_available()
    if affordable <= 0:
        for symbol in missing:
            results[symbol] = []
        return results

    requested = missing[:affordable]
    deferred = missing[affordable:]
    if deferred:
        log.info(
            "History: deferring %d symbol(s) to the next credit window (%s)",
            len(deferred),
            ", ".join(deferred),
        )

    _spend_credits(len(requested))

    try:
        fetched = await asyncio.to_thread(batch, requested, resolution, start, end)
    except ProviderFeatureUnavailable:
        fetched = {}
    except ProviderRateLimited:
        _note_history_throttled()
        fetched = {}
    except ProviderError:
        # History is not load-bearing; charts show their own empty state.
        log.warning("Batch history unavailable for %s (%s)", requested, resolution, exc_info=True)
        fetched = {}

    for symbol in deferred:
        results[symbol] = []

    for symbol in requested:
        candles = fetched.get(symbol, [])
        if key == "1h" and candles:
            candles = candles[-60:]
        # Only cache a real answer. Caching an empty result from a rate-limited
        # call would keep the chart empty for the whole TTL after the quota
        # recovers — the exact trap this endpoint fell into before.
        if candles:
            _set_cached(f"hist:{symbol}:{key}", candles)
        results[symbol] = candles

    return results


def _downsample(candles: list[dict], points: int) -> list[float]:
    closes = [c["close"] for c in candles]
    if len(closes) <= points:
        return closes
    step = len(closes) / points
    return [closes[int(i * step)] for i in range(points)]


async def get_sparkline(ticker: str, points: int = 30) -> list[float]:
    return _downsample(await get_history(ticker, "1w"), points)


async def get_sparklines(tickers: list[str], points: int = 30) -> dict[str, list[float]]:
    """Sparklines for a whole watchlist in ONE provider call."""
    histories = await get_histories(tickers, "1w")
    return {symbol: _downsample(candles, points) for symbol, candles in histories.items()}


# Substrings meaning "the provider is unavailable", NOT "bad symbol".
#
# Provider-agnostic on purpose: the structured signal is `ProviderError`
# (raised by the provider layer and carrying `.retryable`), and this string
# match is the fallback for errors that reach us already flattened to text —
# cached quote dicts, and anything a future provider surfaces as a bare
# exception message. The yfinance-era markers are retained because a cache
# entry written before a restart can still be read after one.
_PROVIDER_DOWN_MARKERS = (
    "429",
    "too many requests",
    "rate limit",
    "expecting value",  # JSONDecodeError from an HTML error page
    "non-json",
    "connection",
    "could not reach",
    "timed out",
    "timeout",
    "temporarily unavailable",
    "server error",
    "503",
    "502",
)

# Failures that will recur identically until a human intervenes. These must NOT
# trip the circuit breaker: backing off would replace a loud, fixable
# misconfiguration with a quiet one that merely looks like an outage.
_PROVIDER_PERMANENT_MARKERS = (
    "api key",
    "not configured",
    "does not include",
    "unauthorized",
    "unauthorised",
)


def quote_unavailable(quote: dict) -> bool:
    """True when a quote carries no usable price."""
    return quote.get("price") is None


def provider_is_down(quote: dict) -> bool:
    """Distinguish a provider outage from a genuinely unknown symbol.

    An unknown ticker comes back cleanly with price=None and no error. A
    throttled or unreachable provider comes back with a transport-level error.
    Getting this wrong tells a user their valid ticker "doesn't exist" during
    an outage, which is why it is one function rather than a check per caller.
    """
    error = str(quote.get("error") or "").lower()
    if not error:
        return False
    return any(marker in error for marker in _PROVIDER_DOWN_MARKERS)


def provider_misconfigured(quote: dict) -> bool:
    """True when the failure is permanent — bad key, or a plan limitation."""
    error = str(quote.get("error") or "").lower()
    if not error:
        return False
    return any(marker in error for marker in _PROVIDER_PERMANENT_MARKERS)


TICKER_PATTERN = re.compile(r"^[A-Z]{1,5}$")


def is_valid_ticker(ticker: str) -> bool:
    """Format-only check: 1-5 uppercase letters.

    Deliberately independent of the data provider — a symbol is well-formed
    whether or not Yahoo happens to be reachable.
    """
    return bool(TICKER_PATTERN.match((ticker or "").upper().strip()))


async def resolve_symbol(ticker: str) -> dict:
    """Look up a symbol WITHOUT raising.

    Returns {symbol, quote, available, provider_down}. This is the single
    lookup implementation; callers choose their own failure policy:

      * writes that can degrade (adding a position) use this directly and
        fall back to the user's cost basis when `available` is False;
      * writes that need a live price use validate_symbol() below, which
        wraps this and raises.
    """
    symbol = (ticker or "").upper().strip()
    quote = (await get_quotes([symbol])).get(symbol, {})
    available = not quote_unavailable(quote)

    return {
        "symbol": symbol,
        "quote": quote,
        "available": available,
        "provider_down": (not available) and provider_is_down(quote),
    }


async def validate_symbol(ticker: str) -> dict:
    """Strict resolve for callers that require a live price.

    Raises 503 when the market data provider is unavailable and 404 only when
    the symbol itself does not resolve — so users are never told their valid
    ticker "doesn't exist" during a Yahoo outage.
    """
    from fastapi import HTTPException  # local import keeps this module framework-light

    resolved = await resolve_symbol(ticker)
    if resolved["available"]:
        return resolved["quote"]

    if resolved["provider_down"]:
        raise HTTPException(
            status_code=503,
            detail=(
                "Market data is temporarily unavailable — the upstream provider is "
                "rate-limiting requests. Please try again in a few minutes."
            ),
        )

    raise HTTPException(
        status_code=404, detail=f"No market data found for {resolved['symbol']}"
    )


def _blocking_profile(ticker: str) -> dict:
    """Company reference data, degrading to a stub on provider failure.

    A provider outage must never raise out of here, or every caller (the
    profile route, earnings prep, comparison) turns a recoverable throttle into
    a 500. Callers detect the degraded case via `error`.
    """
    try:
        return get_provider().fetch_profile(ticker)
    except Exception as exc:  # noqa: BLE001 - one bad symbol must not fail a batch
        return {
            "ticker": ticker,
            "company": ticker,
            "sector": None,
            "industry": None,
            "summary": None,
            "error": str(exc),
        }


async def get_profile(ticker: str) -> dict:
    symbol = ticker.upper().strip()
    cached = _get_cached(f"profile:{symbol}", _PROFILE_TTL)
    if cached is not None:
        return cached
    profile = await asyncio.to_thread(_blocking_profile, symbol)
    _set_cached(f"profile:{symbol}", profile)
    return profile


def estimate_option_value(
    option_type: str, strike: float, underlying: Optional[float], dte: int
) -> Optional[float]:
    """Rough per-contract value estimate: intrinsic value plus a linear time premium.

    This is intentionally simple - we do not pull a live options chain. It gives
    the UI a directional number, not a pricing model.
    """
    if underlying is None:
        return None
    if option_type == "call":
        intrinsic = max(underlying - strike, 0.0)
    else:
        intrinsic = max(strike - underlying, 0.0)
    time_value = max(dte, 0) / 365 * underlying * 0.12
    return round(intrinsic + time_value, 2)
