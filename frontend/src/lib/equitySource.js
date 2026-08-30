import { EQUITIES, POPULAR_TICKERS } from './equities'
import { scoreEquity } from './fuzzy'

/**
 * The symbol-lookup boundary.
 *
 * Every search surface in the app goes through this module — the command
 * palette, the Add Position autocomplete, the watchlist. Replacing the local
 * dataset with a real symbol API means rewriting the three functions here and
 * nothing else; no component imports `equities.js` directly.
 *
 * Functions may return a value or a Promise. `useSearch` handles both, so an
 * async implementation is a drop-in (add debounce + abort inside the adapter,
 * not in the hook).
 */

const BY_TICKER = new Map(EQUITIES.map((equity) => [equity.ticker, equity]))

/** Ranked matches for a query. Returns [] for an empty query. */
export function searchEquities(query, { limit = 8 } = {}) {
  const trimmed = (query || '').trim()
  if (!trimmed) return []

  const results = []
  for (const equity of EQUITIES) {
    const scored = scoreEquity(equity, trimmed)
    if (scored) results.push({ equity, ...scored })
  }

  results.sort((a, b) => b.score - a.score || a.equity.ticker.localeCompare(b.equity.ticker))
  return results.slice(0, limit)
}

/** Exact lookup. Returns undefined for symbols outside the dataset. */
export function getEquity(ticker) {
  return BY_TICKER.get(String(ticker || '').toUpperCase().trim())
}

/** Shown when the palette opens with no query. */
export function getPopular() {
  return POPULAR_TICKERS.map((ticker) => BY_TICKER.get(ticker)).filter(Boolean)
}

/**
 * Always returns something renderable, even for symbols we have no record of
 * (the app must stay usable for tickers outside the local dataset).
 */
export function equityOrFallback(ticker) {
  const symbol = String(ticker || '').toUpperCase().trim()
  return getEquity(symbol) || { ticker: symbol, name: symbol, sector: null, industry: null }
}


/**
 * Best available display name.
 *
 * When a quote is unavailable the API echoes the bare ticker back as
 * `company`. That placeholder must not outrank the local reference name, or a
 * hero header reads "NVDA — NVDA" instead of "NVIDIA Corporation".
 */
export function displayName(ticker, ...candidates) {
  const symbol = String(ticker || '').toUpperCase().trim()
  const real = candidates.find(
    (name) => name && String(name).toUpperCase().trim() !== symbol,
  )
  return real || equityOrFallback(symbol).name
}
