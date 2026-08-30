import { describe, expect, it } from 'vitest'

import {
  QUOTE_STATE,
  aggregateQuoteState,
  normalizeQuote,
  quoteLabel,
} from './quotes'

/**
 * The single interpretation of a price.
 *
 * Before this module, five surfaces each decided independently what a missing
 * or stale price meant, so the same ticker could be shown with different
 * confidence on two pages at the same moment. These tests pin the rules so a
 * new surface cannot quietly reintroduce its own.
 */

const OPEN = { state: 'open' }
const CLOSED = { state: 'closed' }
const now = () => Date.now() / 1000

describe('live quotes', () => {
  it('is LIVE and carries no badge when fresh during market hours', () => {
    const q = normalizeQuote(
      { ticker: 'AAPL', price: 313.25, fetched_at: now(), source: 'live', stale: false },
      { marketStatus: OPEN },
    )
    expect(q.state).toBe(QUOTE_STATE.LIVE)
    expect(quoteLabel(q)).toBeNull()
    expect(q.isTrustworthy).toBe(true)
  })
})

describe('delayed quotes', () => {
  it('is DELAYED and labelled "At close" outside market hours', () => {
    const q = normalizeQuote(
      { ticker: 'AAPL', price: 313.25, fetched_at: now(), source: 'live', stale: false },
      { marketStatus: CLOSED },
    )
    expect(q.state).toBe(QUOTE_STATE.DELAYED)
    expect(quoteLabel(q)).toBe('At close')
    // Still a real market price, just not a live one.
    expect(q.isMarketPrice).toBe(true)
    expect(q.isTrustworthy).toBe(false)
  })
})

describe('cached quotes', () => {
  it('shows the price but labels it with its age', () => {
    const q = normalizeQuote(
      { ticker: 'AAPL', price: 313.25, fetched_at: now() - 240, source: 'cache', stale: true },
      { marketStatus: OPEN },
    )
    expect(q.state).toBe(QUOTE_STATE.CACHED)
    expect(q.price).toBe(313.25)
    expect(quoteLabel(q)).toMatch(/cached \d+m ago/i)
  })

  it('withholds a price that is older than the display limit', () => {
    const q = normalizeQuote(
      { ticker: 'AAPL', price: 313.25, fetched_at: now() - 3600, source: 'cache', stale: true },
      { marketStatus: OPEN },
    )
    expect(q.state).toBe(QUOTE_STATE.UNAVAILABLE)
    expect(q.price).toBeNull()
  })
})

describe('cost basis', () => {
  it('falls back to cost basis only when there is no market price, and labels it', () => {
    const q = normalizeQuote(
      { ticker: 'AAPL', current_price: null, price_stale: true },
      { costBasis: 178.5, marketStatus: OPEN },
    )
    expect(q.state).toBe(QUOTE_STATE.COST_BASIS)
    expect(q.showsCostBasis).toBe(true)
    expect(q.isMarketPrice).toBe(false)
    expect(quoteLabel(q)).toBe('Your cost basis')
  })

  it('never presents cost basis as a market price', () => {
    const q = normalizeQuote(
      { ticker: 'AAPL', current_price: null },
      { costBasis: 178.5, marketStatus: OPEN },
    )
    expect(q.isMarketPrice).toBe(false)
    expect(q.isTrustworthy).toBe(false)
  })
})

describe('unavailable quotes', () => {
  it('reports unavailable with no price when there is no fallback', () => {
    const q = normalizeQuote({ ticker: 'ZZZZ', price: null }, { marketStatus: OPEN })
    expect(q.state).toBe(QUOTE_STATE.UNAVAILABLE)
    expect(q.price).toBeNull()
    expect(q.unavailable).toBe(true)
  })

  it('honours an explicit unavailable source from the backend', () => {
    const q = normalizeQuote(
      { ticker: 'AAPL', price: 1, source: 'unavailable', stale: true },
      { marketStatus: OPEN },
    )
    expect(q.state).toBe(QUOTE_STATE.UNAVAILABLE)
  })
})

describe('shape normalisation', () => {
  it('reads positions (current_price) and quotes (price) identically', () => {
    const fromQuote = normalizeQuote(
      { ticker: 'AAPL', price: 313.25, fetched_at: now() },
      { marketStatus: OPEN },
    )
    const fromPosition = normalizeQuote(
      { ticker: 'AAPL', current_price: 313.25, fetched_at: now() },
      { marketStatus: OPEN },
    )
    expect(fromPosition.state).toBe(fromQuote.state)
    expect(fromPosition.price).toBe(fromQuote.price)
  })
})

describe('aggregate confidence', () => {
  it('takes the least trustworthy component', () => {
    expect(
      aggregateQuoteState([
        { state: QUOTE_STATE.LIVE },
        { state: QUOTE_STATE.CACHED },
        { state: QUOTE_STATE.LIVE },
      ]),
    ).toBe(QUOTE_STATE.CACHED)
  })

  it('is unavailable for an empty book', () => {
    expect(aggregateQuoteState([])).toBe(QUOTE_STATE.UNAVAILABLE)
  })
})
