import { createContext, useCallback, useContext, useMemo, useState } from 'react'

import { useApi } from './useApi'
import { TTL, invalidate } from '../lib/cache'
import { api } from '../lib/api'

const WatchlistContext = createContext(null)

/**
 * Single owner of watchlist state.
 *
 * Previously each consumer called `useApi(api.watchlist)` independently, so
 * the dashboard, the watchlist page and every ticker page each polled the same
 * endpoint on their own timer. Mounted once in the app shell, this collapses
 * those into one 30-second poll shared by all of them — and guarantees the
 * star button can never disagree with the list.
 */
export function WatchlistProvider({ children, pollMs = 30000 }) {
  const { data, loading, error, refetch } = useApi(() => api.watchlist(), [], { key: 'watchlist', ttl: TTL.WATCHLIST, pollMs })
  const [pending, setPending] = useState(null)

  const items = useMemo(() => data?.items || [], [data])

  const bySymbol = useMemo(() => new Map(items.map((item) => [item.ticker, item])), [items])

  const isWatched = useCallback(
    (ticker) => bySymbol.has(String(ticker || '').toUpperCase()),
    [bySymbol],
  )

  const toggle = useCallback(
    async (ticker) => {
      const symbol = String(ticker || '')
        .toUpperCase()
        .trim()
      if (!symbol) return

      setPending(symbol)
      try {
        const existing = bySymbol.get(symbol)
        if (existing) await api.removeWatchlist(existing.id)
        else await api.addWatchlist(symbol)
        invalidate('watchlist')
        await refetch({ silent: true, force: true })
      } finally {
        setPending(null)
      }
    },
    [bySymbol, refetch],
  )

  const remove = useCallback(
    async (id) => {
      setPending(id)
      try {
        await api.removeWatchlist(id)
        invalidate('watchlist')
        await refetch({ silent: true, force: true })
      } finally {
        setPending(null)
      }
    },
    [refetch],
  )

  const value = useMemo(
    () => ({ items, loading, error, refetch, isWatched, toggle, remove, pending }),
    [items, loading, error, refetch, isWatched, toggle, remove, pending],
  )

  return <WatchlistContext.Provider value={value}>{children}</WatchlistContext.Provider>
}

export function useWatchlist() {
  const ctx = useContext(WatchlistContext)
  if (!ctx) throw new Error('useWatchlist must be used inside <WatchlistProvider>')
  return ctx
}
