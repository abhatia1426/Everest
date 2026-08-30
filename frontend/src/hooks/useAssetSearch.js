import { useEffect, useMemo, useRef, useState } from 'react'

import { searchEquities } from '../lib/equitySource'

/**
 * The one company-search implementation: threshold, debounce, caching,
 * cancellation, and a single explicit status the UI renders from.
 *
 * WHAT THE SOURCE ACTUALLY IS: `searchEquities` reads a bundled local dataset
 * (lib/equities.js) — synchronous and sub-millisecond. So the debounce here is
 * NOT protecting a search endpoint; there isn't one. It earns its place for two
 * other reasons:
 *
 *   1. consumers key a QUOTE fetch off the committed symbol, and that is a real
 *      network call — un-debounced, typing "AAPL" fired /prices for A, AA, AAP
 *      and AAPL;
 *   2. `equitySource` is deliberately swappable for a remote API (it already
 *      tolerates a Promise), and the debounce, abort and stale-response guard
 *      have to exist before that swap, not after.
 *
 * Because the current source is local, DEBOUNCE_MS sits at the bottom of the
 * requested 300-500ms band: every millisecond above it is latency with nothing
 * to show for it today. It is one constant — raise it when the source is
 * remote.
 */

/** Below this, matching is noise: "A" fuzzy-matches most of the dataset. */
export const MIN_QUERY_LENGTH = 2

/** Debounce window. See the note above on why this is at the low end. */
export const DEBOUNCE_MS = 300

/** Recently-resolved queries, so repeat searches are instant. */
const CACHE_LIMIT = 50
const cache = new Map()

function cacheKey(query, limit) {
  return `${limit}:${query.trim().toLowerCase()}`
}

function readCache(key) {
  if (!cache.has(key)) return undefined
  // Refresh recency: re-insertion moves the key to the end of the Map order.
  const value = cache.get(key)
  cache.delete(key)
  cache.set(key, value)
  return value
}

function writeCache(key, value) {
  cache.set(key, value)
  if (cache.size > CACHE_LIMIT) {
    // Map preserves insertion order, so the first key is the least recent.
    cache.delete(cache.keys().next().value)
  }
}

export function clearAssetSearchCache() {
  cache.clear()
}

/**
 * Search status. The UI renders from this rather than re-deriving "is it
 * empty because nothing matched, or because the query is too short, or because
 * we haven't run yet" at three different call sites.
 */
export const SEARCH_STATUS = {
  IDLE: 'idle', // nothing typed
  TOO_SHORT: 'too_short', // below MIN_QUERY_LENGTH
  PENDING: 'pending', // debounce is running, or a request is in flight
  RESULTS: 'results',
  EMPTY: 'empty', // ran, matched nothing
  ERROR: 'error',
}

/**
 * @param {string} query
 * @param {{ limit?: number, minLength?: number, debounceMs?: number }} options
 * @returns {{ results, status, loading, error, isTooShort }}
 */
export function useAssetSearch(query, { limit = 8, minLength = MIN_QUERY_LENGTH, debounceMs = DEBOUNCE_MS } = {}) {
  const trimmed = (query || '').trim()
  const tooShort = trimmed.length > 0 && trimmed.length < minLength
  const runnable = trimmed.length >= minLength

  const key = runnable ? cacheKey(trimmed, limit) : null
  // A cache hit renders on the SAME frame — no debounce, no pending flash. This
  // is what makes re-searching a symbol you just looked at feel instantaneous.
  const cached = key ? readCache(key) : undefined

  /*
   * State is TAGGED with the query it belongs to, so "do we have results for
   * what is currently typed?" is derived during render rather than kept in
   * sync by an effect that resets on every keystroke. That removes a whole
   * class of flicker: results for the previous query can never be shown as
   * though they belonged to the current one.
   */
  const [state, setState] = useState({ key: null, results: [], error: null })

  const settled = key !== null && state.key === key
  const hasAnswer = settled || Boolean(cached)
  const error = settled ? state.error : null

  // Memoised so `status` below does not see a fresh array identity on every
  // render and recompute for nothing.
  const results = useMemo(
    () => (settled ? state.results : cached || []),
    [settled, state.results, cached],
  )

  // Guards against a slow earlier query overwriting a newer one.
  const requestId = useRef(0)

  useEffect(() => {
    // Nothing runnable, or the answer is already in hand — no work to do, and
    // nothing to reset, because `settled` is derived.
    if (!runnable || cached) return undefined

    const id = ++requestId.current
    let cancelled = false

    const timer = setTimeout(() => {
      Promise.resolve()
        .then(() => searchEquities(trimmed, { limit }))
        .then((resolved) => {
          // Two guards, because they catch different races: `cancelled` covers
          // unmount and re-run, `id` covers an out-of-order resolution.
          if (cancelled || id !== requestId.current) return
          const next = resolved || []
          writeCache(key, next)
          setState({ key, results: next, error: null })
        })
        .catch((caught) => {
          if (cancelled || id !== requestId.current) return
          setState({ key, results: [], error: caught })
        })
    }, debounceMs)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [trimmed, runnable, key, limit, debounceMs, cached])

  const status = useMemo(() => {
    if (!trimmed) return SEARCH_STATUS.IDLE
    if (tooShort) return SEARCH_STATUS.TOO_SHORT
    if (error) return SEARCH_STATUS.ERROR
    if (!hasAnswer) return SEARCH_STATUS.PENDING
    return results.length > 0 ? SEARCH_STATUS.RESULTS : SEARCH_STATUS.EMPTY
  }, [trimmed, tooShort, error, hasAnswer, results])

  return {
    results,
    status,
    loading: status === SEARCH_STATUS.PENDING,
    error,
    isTooShort: tooShort,
    minLength,
  }
}

/** The message for a non-result status. Null when there are results to show. */
export function searchStatusMessage(status, { minLength = MIN_QUERY_LENGTH } = {}) {
  switch (status) {
    case SEARCH_STATUS.IDLE:
      return 'Search by company name or ticker'
    case SEARCH_STATUS.TOO_SHORT:
      return `Type at least ${minLength} characters`
    case SEARCH_STATUS.PENDING:
      return 'Searching…'
    case SEARCH_STATUS.EMPTY:
      return 'No companies found'
    case SEARCH_STATUS.ERROR:
      return 'Unable to search companies right now'
    default:
      return null
  }
}
