import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  DEBOUNCE_MS,
  MIN_QUERY_LENGTH,
  SEARCH_STATUS,
  clearAssetSearchCache,
  searchStatusMessage,
  useAssetSearch,
} from './useAssetSearch'
import * as equitySource from '../lib/equitySource'

/**
 * The search threshold, debounce, cancellation and caching contract.
 *
 * These exist because the original defect was invisible to lint, the build and
 * the backend suite: typing committed a symbol on the first keystroke, and the
 * only signal was a quote request per character.
 */

afterEach(() => {
  clearAssetSearchCache()
  vi.restoreAllMocks()
})

describe('query threshold', () => {
  it('does not search below the minimum length', async () => {
    const spy = vi.spyOn(equitySource, 'searchEquities')
    const { result } = renderHook(() => useAssetSearch('A'))

    await new Promise((r) => setTimeout(r, DEBOUNCE_MS + 120))

    expect(spy).not.toHaveBeenCalled()
    expect(result.current.status).toBe(SEARCH_STATUS.TOO_SHORT)
    expect(result.current.results).toEqual([])
  })

  it('reports IDLE for an empty query and runs nothing', async () => {
    const spy = vi.spyOn(equitySource, 'searchEquities')
    const { result } = renderHook(() => useAssetSearch(''))

    await new Promise((r) => setTimeout(r, DEBOUNCE_MS + 120))

    expect(spy).not.toHaveBeenCalled()
    expect(result.current.status).toBe(SEARCH_STATUS.IDLE)
  })

  it('searches once the query reaches the minimum length', async () => {
    const { result } = renderHook(() => useAssetSearch('AA'))
    await waitFor(() => expect(result.current.status).not.toBe(SEARCH_STATUS.PENDING), {
      timeout: DEBOUNCE_MS + 900,
    })
    expect(result.current.status).toBe(SEARCH_STATUS.RESULTS)
  })
})

describe('debounce and cancellation', () => {
  it('runs only the final query when typing quickly', async () => {
    const spy = vi.spyOn(equitySource, 'searchEquities')
    const { rerender } = renderHook(({ q }) => useAssetSearch(q), {
      initialProps: { q: 'AA' },
    })

    // Faster than the debounce window, as real typing is.
    rerender({ q: 'AAP' })
    rerender({ q: 'AAPL' })

    await new Promise((r) => setTimeout(r, DEBOUNCE_MS + 250))

    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0][0]).toBe('AAPL')
  })

  it('ignores a stale response that resolves after a newer query', async () => {
    let resolveFirst
    vi.spyOn(equitySource, 'searchEquities').mockImplementation((query) => {
      if (query === 'AA') return new Promise((res) => { resolveFirst = res })
      return [{ equity: { ticker: 'MSFT', name: 'Microsoft Corporation' } }]
    })

    const { result, rerender } = renderHook(({ q }) => useAssetSearch(q), {
      initialProps: { q: 'AA' },
    })
    await new Promise((r) => setTimeout(r, DEBOUNCE_MS + 60))

    rerender({ q: 'MSFT' })
    await waitFor(() => expect(result.current.results[0]?.equity.ticker).toBe('MSFT'), {
      timeout: DEBOUNCE_MS + 900,
    })

    // The abandoned query now resolves — it must not overwrite the newer one.
    await act(async () => {
      resolveFirst?.([{ equity: { ticker: 'STALE', name: 'Stale Result' } }])
      await new Promise((r) => setTimeout(r, 60))
    })

    expect(result.current.results[0]?.equity.ticker).toBe('MSFT')
  })

  it('cancels a pending search on unmount without setting state', async () => {
    const spy = vi.spyOn(equitySource, 'searchEquities')
    const { unmount } = renderHook(() => useAssetSearch('AAPL'))

    unmount()
    await new Promise((r) => setTimeout(r, DEBOUNCE_MS + 150))

    expect(spy).not.toHaveBeenCalled()
  })
})

describe('caching', () => {
  it('serves a repeated query without calling the source again', async () => {
    const first = renderHook(() => useAssetSearch('AAPL'))
    await waitFor(() => expect(first.result.current.status).toBe(SEARCH_STATUS.RESULTS), {
      timeout: DEBOUNCE_MS + 900,
    })
    first.unmount()

    const spy = vi.spyOn(equitySource, 'searchEquities')
    const second = renderHook(() => useAssetSearch('AAPL'))

    // Same frame — a cache hit must not wait out the debounce.
    expect(second.result.current.status).toBe(SEARCH_STATUS.RESULTS)
    expect(second.result.current.results.length).toBeGreaterThan(0)
    expect(spy).not.toHaveBeenCalled()
  })

  it('treats queries as case-insensitive for caching', async () => {
    const first = renderHook(() => useAssetSearch('aapl'))
    await waitFor(() => expect(first.result.current.status).toBe(SEARCH_STATUS.RESULTS), {
      timeout: DEBOUNCE_MS + 900,
    })
    first.unmount()

    const spy = vi.spyOn(equitySource, 'searchEquities')
    const second = renderHook(() => useAssetSearch('AAPL'))
    expect(second.result.current.status).toBe(SEARCH_STATUS.RESULTS)
    expect(spy).not.toHaveBeenCalled()
  })
})

describe('result states', () => {
  it('reports EMPTY when nothing matches', async () => {
    const { result } = renderHook(() => useAssetSearch('ZZZZZ'))
    await waitFor(() => expect(result.current.status).toBe(SEARCH_STATUS.EMPTY), {
      timeout: DEBOUNCE_MS + 900,
    })
    expect(result.current.results).toEqual([])
  })

  it('reports ERROR when the source throws', async () => {
    vi.spyOn(equitySource, 'searchEquities').mockImplementation(() => {
      throw new Error('source exploded')
    })
    const { result } = renderHook(() => useAssetSearch('AAPL'))
    await waitFor(() => expect(result.current.status).toBe(SEARCH_STATUS.ERROR), {
      timeout: DEBOUNCE_MS + 900,
    })
    expect(result.current.results).toEqual([])
  })

  it('matches full company names, not just tickers', async () => {
    const { result } = renderHook(() => useAssetSearch('Microsoft'))
    await waitFor(() => expect(result.current.status).toBe(SEARCH_STATUS.RESULTS), {
      timeout: DEBOUNCE_MS + 900,
    })
    expect(result.current.results[0].equity.ticker).toBe('MSFT')
  })
})

describe('status messages', () => {
  it.each([
    [SEARCH_STATUS.IDLE, 'Search by company name or ticker'],
    [SEARCH_STATUS.TOO_SHORT, `Type at least ${MIN_QUERY_LENGTH} characters`],
    [SEARCH_STATUS.EMPTY, 'No companies found'],
    [SEARCH_STATUS.ERROR, 'Unable to search companies right now'],
  ])('%s -> %s', (status, expected) => {
    expect(searchStatusMessage(status)).toBe(expected)
  })

  it('returns null when there are results to show', () => {
    expect(searchStatusMessage(SEARCH_STATUS.RESULTS)).toBeNull()
  })
})
