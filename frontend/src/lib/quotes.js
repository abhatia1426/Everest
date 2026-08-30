/**
 * The single interpretation of a price in this application.
 *
 * WHY: quote meaning was previously decided independently on five surfaces.
 * The dashboard read `price_stale` off a position, the watchlist checked
 * `price === null`, stock detail checked `quote.price === undefined`, and the
 * portfolio ledger greyed a figure on yet another condition. The same ticker
 * could therefore be presented with different confidence on two pages at the
 * same moment — a correctness problem, not a styling one.
 *
 * Every surface now calls `normalizeQuote` and renders from the result.
 *
 * THE FOUR STATES, in descending confidence:
 *
 *   live        a fresh quote from the provider
 *   delayed     a real market price, but from a closed or pre/post session,
 *               or one the provider marked delayed
 *   cached      a real price we fetched earlier and are re-showing; the age is
 *               known and displayed
 *   cost_basis  NOT a market price — the user's own average cost, shown only
 *               where the alternative is showing nothing, and always labelled
 *   unavailable no usable price; the UI shows an em dash
 *
 * `cost_basis` deliberately never renders as a market price. Substituting cost
 * for market and calling it "price" is the specific failure this module exists
 * to prevent.
 */

import { getMarketStatus } from './marketStatus'

export const QUOTE_STATE = {
  LIVE: 'live',
  DELAYED: 'delayed',
  CACHED: 'cached',
  COST_BASIS: 'cost_basis',
  UNAVAILABLE: 'unavailable',
}

/** Past this age a cached price is no longer worth showing as a price. */
const CACHE_DISPLAY_LIMIT_MS = 10 * 60 * 1000

/**
 * Build the canonical quote view-model.
 *
 * @param {object|null} raw   backend quote, position, or watchlist row
 * @param {{ costBasis?: number|null, marketStatus?: object }} options
 */
export function normalizeQuote(raw, { costBasis = null, marketStatus = null } = {}) {
  const session = marketStatus || getMarketStatus()

  // Positions call it `current_price`; quotes and watchlist rows call it
  // `price`. Normalising here is exactly the divergence this module removes.
  const price = raw?.price ?? raw?.current_price ?? null
  const hasPrice = typeof price === 'number' && !Number.isNaN(price)

  const fetchedAt = raw?.fetched_at ? raw.fetched_at * 1000 : null
  const marketTimestamp = raw?.market_timestamp ? raw.market_timestamp * 1000 : null
  const ageMs = fetchedAt ? Date.now() - fetchedAt : null

  // The backend flags these; both mean "this is not a fresh provider read".
  const backendStale = Boolean(raw?.stale || raw?.price_stale)
  const source = raw?.source || null

  let state
  if (!hasPrice) {
    // Cost basis is the last resort, and only when the caller supplies one.
    state =
      typeof costBasis === 'number' && !Number.isNaN(costBasis)
        ? QUOTE_STATE.COST_BASIS
        : QUOTE_STATE.UNAVAILABLE
  } else if (source === 'unavailable') {
    state = QUOTE_STATE.UNAVAILABLE
  } else if (backendStale || source === 'cache') {
    // Too old to present at all, even as "cached".
    state =
      ageMs !== null && ageMs > CACHE_DISPLAY_LIMIT_MS
        ? QUOTE_STATE.UNAVAILABLE
        : QUOTE_STATE.CACHED
  } else if (session.state !== 'open') {
    // A real closing price, correctly labelled rather than implied live.
    state = QUOTE_STATE.DELAYED
  } else {
    state = QUOTE_STATE.LIVE
  }

  const displayPrice =
    state === QUOTE_STATE.COST_BASIS
      ? costBasis
      : state === QUOTE_STATE.UNAVAILABLE
        ? null
        : price

  return {
    symbol: raw?.ticker || null,
    state,
    price: displayPrice,
    change: raw?.change ?? null,
    changePercent: raw?.change_percent ?? null,
    marketTimestamp,
    fetchedAt,
    ageMs,
    marketStatus: session.state,
    source,
    // Convenience booleans so components never re-derive the rules.
    isMarketPrice: state === QUOTE_STATE.LIVE || state === QUOTE_STATE.DELAYED,
    isTrustworthy: state === QUOTE_STATE.LIVE,
    showsCostBasis: state === QUOTE_STATE.COST_BASIS,
    unavailable: state === QUOTE_STATE.UNAVAILABLE,
  }
}

/** Short label for the quote's provenance. Null when nothing needs saying. */
export function quoteLabel(quote) {
  switch (quote.state) {
    case QUOTE_STATE.LIVE:
      return null
    case QUOTE_STATE.DELAYED:
      return quote.marketStatus === 'closed' ? 'At close' : 'Delayed'
    case QUOTE_STATE.CACHED:
      return quote.ageMs ? `Cached ${formatAge(quote.ageMs)} ago` : 'Cached'
    case QUOTE_STATE.COST_BASIS:
      return 'Your cost basis'
    default:
      return 'Unavailable'
  }
}

/** Tailwind tone for the provenance label. */
export function quoteTone(quote) {
  switch (quote.state) {
    case QUOTE_STATE.LIVE:
      return 'text-up'
    case QUOTE_STATE.DELAYED:
      return 'text-text-tertiary'
    case QUOTE_STATE.CACHED:
    case QUOTE_STATE.COST_BASIS:
      return 'text-warn'
    default:
      return 'text-text-tertiary'
  }
}

function formatAge(ms) {
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  return `${Math.round(minutes / 60)}h`
}

/**
 * Aggregate confidence across many quotes — for a portfolio total, which is
 * only as trustworthy as its least trustworthy component.
 */
export function aggregateQuoteState(quotes) {
  if (quotes.length === 0) return QUOTE_STATE.UNAVAILABLE

  const order = [
    QUOTE_STATE.UNAVAILABLE,
    QUOTE_STATE.COST_BASIS,
    QUOTE_STATE.CACHED,
    QUOTE_STATE.DELAYED,
    QUOTE_STATE.LIVE,
  ]

  return quotes.reduce(
    (worst, quote) => (order.indexOf(quote.state) < order.indexOf(worst) ? quote.state : worst),
    QUOTE_STATE.LIVE,
  )
}
