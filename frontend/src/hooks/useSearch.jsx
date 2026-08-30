import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'

import { equityOrFallback, getPopular } from '../lib/equitySource'

const RECENTS_KEY = 'everest_recent_tickers'
const MAX_RECENTS = 6

/* ------------------------------------------------------------------ hooks */

/*
 * The ranked-results hook that used to live here has moved to
 * `hooks/useAssetSearch.js`, which adds the query threshold, debounce, result
 * caching and cancellation that every search surface now shares. This module
 * keeps the keyboard controller and the palette/recents provider.
 */

/** Roving-selection keyboard controller shared by the palette and autocomplete. */
export function useListNavigation(itemCount, { onSelect, enabled = true } = {}) {
  const [rawIndex, setActiveIndex] = useState(0)

  // Derived, not synced: if the list shrinks under the cursor the clamp happens
  // during render rather than in an effect, so there is no cascading re-render.
  const activeIndex = itemCount === 0 ? 0 : Math.min(rawIndex, itemCount - 1)

  const onKeyDown = useCallback(
    (event) => {
      if (!enabled || itemCount === 0) return

      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setActiveIndex((i) => (i + 1) % itemCount)
      } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        setActiveIndex((i) => (i - 1 + itemCount) % itemCount)
      } else if (event.key === 'Home') {
        event.preventDefault()
        setActiveIndex(0)
      } else if (event.key === 'End') {
        event.preventDefault()
        setActiveIndex(itemCount - 1)
      } else if (event.key === 'Enter') {
        event.preventDefault()
        onSelect?.(activeIndex)
      }
    },
    [enabled, itemCount, activeIndex, onSelect],
  )

  return { activeIndex, setActiveIndex, onKeyDown }
}

/* --------------------------------------------------------------- provider */

const SearchContext = createContext(null)

function readRecents() {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENTS_KEY))
    return Array.isArray(parsed) ? parsed.filter((t) => typeof t === 'string').slice(0, MAX_RECENTS) : []
  } catch {
    return []
  }
}

/**
 * Owns command-palette open state and the recent-search list, plus the global
 * Cmd/Ctrl+K binding. Search *results* deliberately live in `useSearch` so
 * autocompletes work without needing this provider.
 */
export function SearchProvider({ children }) {
  const [isOpen, setOpen] = useState(false)
  const [recentTickers, setRecentTickers] = useState(readRecents)

  const open = useCallback(() => setOpen(true), [])
  const close = useCallback(() => setOpen(false), [])

  const addRecent = useCallback((ticker) => {
    const symbol = String(ticker || '').toUpperCase().trim()
    if (!symbol) return

    setRecentTickers((current) => {
      const next = [symbol, ...current.filter((t) => t !== symbol)].slice(0, MAX_RECENTS)
      try {
        localStorage.setItem(RECENTS_KEY, JSON.stringify(next))
      } catch {
        /* private mode — recents are a convenience, not critical state */
      }
      return next
    })
  }, [])

  const clearRecents = useCallback(() => {
    setRecentTickers([])
    try {
      localStorage.removeItem(RECENTS_KEY)
    } catch {
      /* ignore */
    }
  }, [])

  // Cmd/Ctrl+K anywhere. Bound once at the provider rather than per screen.
  useEffect(() => {
    const onKeyDown = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setOpen((current) => !current)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const recents = useMemo(() => recentTickers.map(equityOrFallback), [recentTickers])
  const popular = useMemo(() => getPopular(), [])

  const value = useMemo(
    () => ({ isOpen, open, close, recents, popular, addRecent, clearRecents }),
    [isOpen, open, close, recents, popular, addRecent, clearRecents],
  )

  return <SearchContext.Provider value={value}>{children}</SearchContext.Provider>
}

export function useSearchContext() {
  const ctx = useContext(SearchContext)
  if (!ctx) throw new Error('useSearchContext must be used inside <SearchProvider>')
  return ctx
}
