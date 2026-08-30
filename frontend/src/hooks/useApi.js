import { useCallback, useEffect, useRef, useState } from 'react'

import { TTL, fetchThrough, peek, subscribe, write } from '../lib/cache'

/**
 * Fetch helper with caching, polling, and stale-response guarding.
 *
 * The behaviour that made navigation feel slow was here: every mount started
 * at `data: null`, so returning to a page you had just left rendered a full
 * set of skeletons and re-issued a request for data that was seconds old.
 * Route components unmount on navigation, so no amount of component state
 * could fix it — the cache has to outlive the component (see lib/cache).
 *
 * Pass a `key` to opt into caching. Without one the hook behaves exactly as
 * before (always fetch on mount), so uncached call sites are unaffected.
 *
 * @param {Function} fetcher
 * @param {Array} deps
 * @param {{ key?: string, ttl?: {fresh:number,stale:number}, pollMs?: number,
 *           enabled?: boolean }} options
 */
export function useApi(
  fetcher,
  deps = [],
  { key = null, ttl = TTL.PORTFOLIO, pollMs = 0, enabled = true } = {},
) {
  // Seed synchronously from cache so a cached page paints WITH DATA on its
  // very first frame — no skeleton flash between route mount and effect.
  const cached = key && enabled ? peek(key) : undefined
  const seed = cached && cached.age < ttl.stale ? cached.data : null

  const [data, setData] = useState(seed)
  const [error, setError] = useState(null)
  // Only "loading" when there is nothing at all to show.
  const [fetching, setFetching] = useState(enabled && seed === null)

  const loading = enabled && fetching && data === null
  const requestId = useRef(0)
  const fetcherRef = useRef(fetcher)
  const keyRef = useRef(key)

  // Kept in an effect rather than assigned during render: mutating a ref while
  // rendering is unsafe under concurrent features.
  useEffect(() => {
    fetcherRef.current = fetcher
    keyRef.current = key
  })

  const run = useCallback(
    async ({ silent = false, force = false } = {}) => {
      const id = ++requestId.current
      const cacheKey = keyRef.current

      if (!silent) {
        const hit = cacheKey && !force ? peek(cacheKey) : undefined
        // Fresh enough to skip the network entirely.
        if (hit && hit.age < ttl.fresh) {
          setData(hit.data)
          setError(null)
          setFetching(false)
          return hit.data
        }
        if (!hit) setFetching(true)
      }

      try {
        // `fetchThrough` collapses concurrent callers for the same key onto a
        // single request — the fix for two pages independently asking for the
        // same portfolio at the same moment.
        const result = cacheKey
          ? await fetchThrough(cacheKey, () => fetcherRef.current())
          : await fetcherRef.current()

        if (id === requestId.current) {
          setData(result)
          setError(null)
        }
        return result
      } catch (err) {
        if (id === requestId.current) setError(err)
        return undefined
      } finally {
        if (id === requestId.current) setFetching(false)
      }
    },
    [ttl.fresh],
  )

  useEffect(() => {
    if (!enabled) return undefined

    const cacheKey = key
    const hit = cacheKey ? peek(cacheKey) : undefined

    if (hit && hit.age < ttl.fresh) {
      // Fresh: adopt it and make no request at all.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setData(hit.data)
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFetching(false)
    } else if (hit && hit.age < ttl.stale) {
      // Stale-while-revalidate: the cached value is already rendered, so the
      // refresh is silent and the user never sees a skeleton for data they
      // can currently read.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setData(hit.data)
      run({ silent: true })
    } else {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      run()
    }

    if (!pollMs) return undefined

    const timer = setInterval(() => {
      // Skip polling while the tab is hidden — no point burning provider quota
      // on a screen nobody is looking at.
      if (!document.hidden) run({ silent: true, force: true })
    }, pollMs)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, enabled, pollMs, key])

  // A write elsewhere (a mutation, another component's fetch) updates this
  // reader too, so two mounted views of the same key cannot disagree.
  useEffect(() => {
    if (!key) return undefined
    return subscribe(key, () => {
      const hit = peek(key)
      if (hit) setData(hit.data)
    })
  }, [key])

  const setCached = useCallback(
    (value) => {
      setData(value)
      if (keyRef.current) write(keyRef.current, value)
    },
    [],
  )

  return { data, error, loading, refetch: run, setData: setCached }
}

/** Imperative async action with loading/error state — for buttons and forms. */
export function useAction(action) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [data, setData] = useState(null)

  const run = useCallback(
    async (...args) => {
      setLoading(true)
      setError(null)
      try {
        const result = await action(...args)
        setData(result)
        return result
      } catch (err) {
        setError(err)
        throw err
      } finally {
        setLoading(false)
      }
    },
    [action],
  )

  return { run, loading, error, data, setData, setError }
}
