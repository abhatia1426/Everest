import { useCallback, useEffect, useMemo, useRef } from 'react'

import { useApi } from './useApi'
import { TTL } from '../lib/cache'
import { MOMENTUM_WINDOW } from '../lib/monitor'
import { api } from '../lib/api'

/**
 * Daily closes for a whole watchlist, fetched once.
 *
 * WHAT THIS IS DEFENDING AGAINST. The monitor board draws a sparkline, a
 * 30-day range rail and a momentum state per row, and the naive shape of that
 * is one history request per symbol per render. Against Twelve Data's free
 * tier — 8 API CALLS PER MINUTE — a fourteen-symbol watchlist would blow the
 * quota on its first paint and then re-blow it on every re-render, after which
 * every series comes back empty with no visible error.
 *
 * Three things prevent that here:
 *
 *   · ONE REQUEST for the whole board, batched server-side.
 *   · The cache key is the SORTED symbol list, so re-sorting the board,
 *     switching a filter, selecting a row or flipping the theme all hit the
 *     same entry and issue nothing. Only adding or removing a symbol changes
 *     the key.
 *   · `useApi` + `lib/cache` collapse concurrent callers onto one in-flight
 *     request and serve a stale entry immediately while revalidating, at the
 *     HISTORY TTL — daily bars, so minutes rather than seconds.
 *
 * There is deliberately NO POLLING. A closed daily candle never changes, and
 * today's only moves within the day — which the live quote already reports.
 *
 * A symbol the provider could not supply comes back as an empty array. The
 * board keeps that row's geometry and renders its unavailable state; nothing
 * here pads, interpolates or back-fills.
 */
/** The provider's rate-limit window, matching the backend's own cool-off. */
const CREDIT_WINDOW_MS = 65_000

/** Enough windows to fill a large watchlist; few enough to end. */
const MAX_COMPLETION_ATTEMPTS = 4

export function useSessionHistory(tickers) {
  // Sorted and de-duplicated: `['NVDA','AMD']` and `['AMD','NVDA']` are the
  // same request, and treating them as two would double the provider cost for
  // nothing but list order.
  const symbols = useMemo(() => {
    const seen = new Set()
    for (const ticker of tickers || []) {
      const symbol = String(ticker || '').toUpperCase().trim()
      if (symbol) seen.add(symbol)
    }
    return [...seen].sort()
  }, [tickers])

  const key = symbols.join(',')
  const fetcher = useCallback(() => api.sessions(symbols, MOMENTUM_WINDOW), [key]) // eslint-disable-line react-hooks/exhaustive-deps

  const { data, loading, error, refetch } = useApi(fetcher, [key], {
    key: `sessions:${key}`,
    ttl: TTL.HISTORY,
    enabled: symbols.length > 0,
  })

  const sessions = useMemo(() => data?.sessions || {}, [data])

  /*
   * COMPLETE THE BOARD after a deferred credit window.
   *
   * A watchlist can be larger than the provider's per-minute call budget, and
   * `get_histories` handles that by serving what it can afford and returning
   * an empty list for the rest — deliberately WITHOUT caching those empties,
   * so the next call picks them up with a fresh quota.
   *
   * The client would otherwise defeat that: it caches the whole payload for
   * the HISTORY TTL, so a first load that could only afford five of sixteen
   * symbols would leave eleven rows showing "no 30-session history" for ten
   * minutes after the budget had recovered.
   *
   * So an incomplete answer is retried once per credit window, silently, up to
   * a bounded number of attempts. This is not polling: it stops the moment
   * every symbol has a series, and a genuinely unavailable symbol costs at
   * most a few extra batched calls rather than an endless retry loop.
   */
  const attempts = useRef(0)
  const missing = useMemo(
    () => symbols.filter((symbol) => (sessions[symbol] || []).length === 0),
    [symbols, sessions],
  )

  useEffect(() => {
    attempts.current = 0
  }, [key])

  useEffect(() => {
    if (!data || missing.length === 0 || attempts.current >= MAX_COMPLETION_ATTEMPTS) {
      return undefined
    }
    const timer = setTimeout(() => {
      attempts.current += 1
      refetch({ silent: true, force: true })
    }, CREDIT_WINDOW_MS)
    return () => clearTimeout(timer)
  }, [data, missing.length, refetch])

  const candlesFor = useCallback(
    (ticker) => sessions[String(ticker || '').toUpperCase()] || [],
    [sessions],
  )

  // Symbols still waiting on a credit window are NOT reported as a loading
  // state: their rows already render an honest unavailable cell, and a
  // spinner over a board that is otherwise complete would be worse.
  return { sessions, candlesFor, loading: loading && symbols.length > 0, error }
}
