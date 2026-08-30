import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'everest.watchlist.pinned'

/**
 * Pinned watchlist symbols.
 *
 * Deliberately client-side. The watchlist API has no "favourite" field, and
 * inventing one would mean a schema and endpoint change — outside the remit of
 * a redesign. Pinning is a per-device view preference (which four symbols do I
 * want at the top of my monitor right now), so localStorage is arguably the
 * right home for it regardless.
 *
 * If this ever needs to follow a user across devices, the swap is this hook's
 * internals plus a backend field; no component changes.
 */
function read() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    // Unavailable or corrupt storage must never stop the page rendering.
    return []
  }
}

export function useFavorites() {
  const [pinned, setPinned] = useState(read)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(pinned))
    } catch {
      // Quota or private mode — the in-memory value still works this session.
    }
  }, [pinned])

  const toggle = useCallback((ticker) => {
    const symbol = String(ticker || '').toUpperCase()
    setPinned((prev) =>
      prev.includes(symbol) ? prev.filter((t) => t !== symbol) : [...prev, symbol],
    )
  }, [])

  const isPinned = useCallback(
    (ticker) => pinned.includes(String(ticker || '').toUpperCase()),
    [pinned],
  )

  return { pinned, toggle, isPinned }
}
