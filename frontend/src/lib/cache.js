/**
 * Client-side request cache with stale-while-revalidate and in-flight
 * de-duplication.
 *
 * WHY THIS EXISTS: `useApi` started every mount at `data: null`, so navigating
 * Dashboard → Portfolio → Dashboard refetched the portfolio from scratch and
 * showed a full set of skeletons for data that had been on screen four seconds
 * earlier. Route components unmount on navigation, so component state could
 * never carry anything across — the cache has to live outside React.
 *
 * WHY NOT REACT QUERY / SWR: the app needs three things — reuse, de-dupe,
 * revalidate. That is ~80 lines here against a dependency with its own
 * provider, devtools and mental model, on a codebase whose whole fetch surface
 * is one `useApi` hook. If requirements grow (mutations, optimistic updates,
 * pagination) the trade flips, and this module is the seam to swap.
 *
 * FRESHNESS IS PER-CALLER. There is no single correct TTL: a company profile is
 * good for an hour, a live quote for seconds. Callers pass their own via
 * `TTL`, and quote-bearing endpoints deliberately get short windows so a price
 * can never look current when it is not.
 */

const store = new Map()
const inflight = new Map()

/**
 * TTLs by data type, in milliseconds.
 *
 * `fresh`  — served with no network call at all.
 * `stale`  — served immediately, with a background revalidation behind it.
 * Past `stale`, the caller waits for the network.
 */
export const TTL = {
  // Prices move constantly. Short enough that a displayed quote is never
  // meaningfully out of date; long enough to absorb a burst of navigation.
  QUOTE: { fresh: 10_000, stale: 60_000 },
  // Positions only change when the user acts, and those paths refetch
  // explicitly, so this can be generous.
  PORTFOLIO: { fresh: 20_000, stale: 5 * 60_000 },
  WATCHLIST: { fresh: 20_000, stale: 5 * 60_000 },
  // OHLC for a closed candle is immutable; only the newest candle moves.
  HISTORY: { fresh: 60_000, stale: 10 * 60_000 },
  // Sector, industry, business summary: quarterly at most.
  PROFILE: { fresh: 30 * 60_000, stale: 6 * 60 * 60_000 },
  NEWS: { fresh: 5 * 60_000, stale: 30 * 60_000 },
  ACTIVITY: { fresh: 30_000, stale: 5 * 60_000 },
}

/** Read an entry with its age, or undefined. */
export function peek(key) {
  const entry = store.get(key)
  if (!entry) return undefined
  return { data: entry.data, age: Date.now() - entry.at }
}

export function write(key, data) {
  store.set(key, { data, at: Date.now() })
  notify(key)
}

/**
 * Fetch through the cache, collapsing concurrent callers onto one request.
 *
 * Two components mounting at once and asking for the same key produce a single
 * network call — the case that previously made Stock Detail fire the portfolio
 * request that the Portfolio page had already made.
 */
export function fetchThrough(key, fetcher) {
  const existing = inflight.get(key)
  if (existing) return existing

  const promise = Promise.resolve()
    .then(fetcher)
    .then((data) => {
      write(key, data)
      return data
    })
    .finally(() => {
      inflight.delete(key)
    })

  inflight.set(key, promise)
  return promise
}

/* ------------------------------------------------------------ invalidation */

const listeners = new Map()

/** Subscribe to writes for a key. Lets one mutation update every mounted reader. */
export function subscribe(key, callback) {
  if (!listeners.has(key)) listeners.set(key, new Set())
  listeners.get(key).add(callback)
  return () => {
    const set = listeners.get(key)
    if (!set) return
    set.delete(callback)
    if (set.size === 0) listeners.delete(key)
  }
}

function notify(key) {
  const set = listeners.get(key)
  if (!set) return
  for (const callback of set) callback()
}

/**
 * Drop cached entries. `prefix` invalidates a family — after adding a
 * position, `invalidate('portfolio')` clears every mode/params variant rather
 * than requiring the caller to know the exact key.
 */
export function invalidate(prefix) {
  for (const key of [...store.keys()]) {
    if (key.startsWith(prefix)) {
      store.delete(key)
      notify(key)
    }
  }
}

export function clearCache() {
  store.clear()
  inflight.clear()
}

/** Test/diagnostic view of what is cached. */
export function cacheStats() {
  return {
    entries: store.size,
    inflight: inflight.size,
    keys: [...store.keys()],
  }
}
