import { describe, expect, it } from 'vitest'

import {
  buildBook,
  concentrationSummary,
  filterHoldings,
  inkOn,
  ribbonSegments,
  smoothPath,
  sortHoldings,
  toHolding,
  totalsOf,
} from './portfolio'

/**
 * These tests exist because the Portfolio page renders the SAME numbers in
 * four places — the value band, the concentration ribbon, the ledger rows and
 * the footer — and the only thing keeping them in agreement is that all four
 * read this module. The claims worth pinning are therefore about arithmetic
 * and about the difference between a measured zero and an unmeasured one.
 */

/** A position shaped exactly like `/pnl.positions[]`. */
function position(overrides = {}) {
  const qty = overrides.qty ?? 10
  const avg = overrides.avg_cost ?? 100
  const price = overrides.current_price ?? 110
  return {
    id: overrides.id ?? overrides.ticker ?? 'id',
    ticker: overrides.ticker ?? 'AAA',
    company: overrides.company ?? 'Alpha Inc',
    sector: overrides.sector ?? 'Software',
    qty,
    avg_cost: avg,
    cost_basis: qty * avg,
    current_price: price,
    market_value: qty * price,
    unrealized_pnl: qty * price - qty * avg,
    pnl_percent: ((price - avg) / avg) * 100,
    change_percent: overrides.change_percent === undefined ? 10 : overrides.change_percent,
    price_stale: overrides.price_stale ?? false,
  }
}

describe('toHolding', () => {
  it('derives the day figure from the previous close, not from the current value', () => {
    // 10 shares at 110 = 1100, up 10% on the day, so the previous close was
    // 1000 and the day figure is 100 — NOT 1100 * 10% = 110.
    const row = toHolding(position({ change_percent: 10 }))
    expect(row.dayAbs).toBeCloseTo(100, 6)
    expect(row.measured).toBe(true)
  })

  it('reports no day figure at all for a holding priced at cost', () => {
    const row = toHolding(position({ price_stale: true, change_percent: 4 }))
    expect(row.measured).toBe(false)
    expect(row.dayAbs).toBeNull()
    expect(row.changePercent).toBeNull()
  })

  it('reports no day figure when the provider returned no percentage', () => {
    expect(toHolding(position({ change_percent: null })).dayAbs).toBeNull()
  })
})

describe('buildBook', () => {
  it('sums value, cost and unrealized across the book', () => {
    const book = buildBook([
      position({ ticker: 'AAA', qty: 10, avg_cost: 100, current_price: 110 }),
      position({ ticker: 'BBB', qty: 5, avg_cost: 200, current_price: 180 }),
    ])

    expect(book.totalValue).toBe(2000)
    expect(book.totalCost).toBe(2000)
    expect(book.unrealized).toBe(0)
  })

  it('leaves the day change NULL when nothing in the book was measured', () => {
    const book = buildBook([
      position({ ticker: 'AAA', price_stale: true }),
      position({ ticker: 'BBB', change_percent: null }),
    ])

    // Zero would assert a flat session. We observed nothing.
    expect(book.dayAbs).toBeNull()
    expect(book.dayPercent).toBeNull()
    expect(book.measuredCount).toBe(0)
  })

  it('sums only the measured holdings when the book is mixed', () => {
    const book = buildBook([
      position({ ticker: 'AAA', qty: 10, current_price: 110, change_percent: 10 }),
      position({ ticker: 'BBB', price_stale: true }),
    ])

    expect(book.dayAbs).toBeCloseTo(100, 6)
    expect(book.measuredCount).toBe(1)
  })

  it('ranks by market value so the ribbon and the weight bars share one order', () => {
    const book = buildBook([
      position({ ticker: 'SMALL', qty: 1, current_price: 10 }),
      position({ ticker: 'BIG', qty: 100, current_price: 10 }),
    ])

    expect(book.byValue.map((r) => r.ticker)).toEqual(['BIG', 'SMALL'])
    expect(book.rankByTicker.get('BIG')).toBe(0)
  })

  it('never divides by zero on an empty book', () => {
    const book = buildBook([])
    expect(book.totalValue).toBe(0)
    expect(book.unrealizedPercent).toBeNull()
    expect(book.maxValue).toBe(1)
    expect(book.sumAbsUnrealized).toBe(1)
  })
})

describe('filterHoldings', () => {
  const rows = buildBook([
    position({ ticker: 'AAA', company: 'Alpha Inc', sector: 'Software' }),
    position({ ticker: 'BBB', company: 'Beta Corp', sector: 'Health' }),
  ]).rows

  it('matches on ticker, name and sector', () => {
    expect(filterHoldings(rows, { query: 'bet' }).map((r) => r.ticker)).toEqual(['BBB'])
    expect(filterHoldings(rows, { query: 'AAA' }).map((r) => r.ticker)).toEqual(['AAA'])
    expect(filterHoldings(rows, { query: 'health' }).map((r) => r.ticker)).toEqual(['BBB'])
  })

  it('applies the sector filter and the search together', () => {
    expect(filterHoldings(rows, { query: 'alpha', sector: 'Health' })).toEqual([])
  })

  it('returns everything for an empty query', () => {
    expect(filterHoldings(rows, { query: '   ' })).toHaveLength(2)
  })
})

describe('sortHoldings', () => {
  const rows = buildBook([
    position({ ticker: 'AAA', qty: 1, current_price: 100 }),
    position({ ticker: 'BBB', qty: 3, current_price: 100 }),
    position({ ticker: 'CCC', qty: 2, current_price: 100 }),
  ]).rows

  it('sorts descending by default and flips with the direction', () => {
    expect(sortHoldings(rows, 'value', -1).map((r) => r.ticker)).toEqual(['BBB', 'CCC', 'AAA'])
    expect(sortHoldings(rows, 'value', 1).map((r) => r.ticker)).toEqual(['AAA', 'CCC', 'BBB'])
  })

  it('sorts tickers alphabetically ascending', () => {
    expect(sortHoldings(rows, 'ticker', 1).map((r) => r.ticker)).toEqual(['AAA', 'BBB', 'CCC'])
  })

  it('sinks unmeasured rows to the bottom in BOTH directions', () => {
    const mixed = buildBook([
      position({ ticker: 'UP', change_percent: 5 }),
      position({ ticker: 'NONE', price_stale: true }),
      position({ ticker: 'DOWN', change_percent: -5 }),
    ]).rows

    // A holding with no quote must never win the top slot of a "best today"
    // ordering by virtue of its data being missing.
    expect(sortHoldings(mixed, 'day', -1).map((r) => r.ticker)).toEqual(['UP', 'DOWN', 'NONE'])
    expect(sortHoldings(mixed, 'day', 1).map((r) => r.ticker)).toEqual(['DOWN', 'UP', 'NONE'])
  })

  it('does not mutate the array it is given', () => {
    const order = rows.map((r) => r.ticker)
    sortHoldings(rows, 'value', -1)
    expect(rows.map((r) => r.ticker)).toEqual(order)
  })
})

describe('ribbonSegments', () => {
  const book = buildBook([
    position({ ticker: 'AAA', qty: 10, current_price: 60, sector: 'Software' }),
    position({ ticker: 'BBB', qty: 10, current_price: 30, sector: 'Software' }),
    position({ ticker: 'CCC', qty: 10, current_price: 10, sector: 'Health' }),
  ])

  it('weights positions by share of portfolio value, largest first', () => {
    const segments = ribbonSegments(book, 'positions')
    expect(segments.map((s) => s.key)).toEqual(['AAA', 'BBB', 'CCC'])
    expect(segments.map((s) => Math.round(s.weight))).toEqual([60, 30, 10])
  })

  it('collapses to sectors on demand and still sums to the whole portfolio', () => {
    const segments = ribbonSegments(book, 'sectors')
    expect(segments.map((s) => s.key)).toEqual(['Software', 'Health'])
    expect(segments.reduce((sum, s) => sum + s.weight, 0)).toBeCloseTo(100, 6)
  })

  it('leaves a sector day figure null when none of its holdings were measured', () => {
    const stale = buildBook([position({ ticker: 'AAA', sector: 'Software', price_stale: true })])
    expect(ribbonSegments(stale, 'sectors')[0].dayPercent).toBeNull()
  })

  it('returns nothing for a portfolio with no value', () => {
    expect(ribbonSegments(buildBook([]), 'positions')).toEqual([])
  })
})

describe('concentrationSummary', () => {
  it('reports the top three and the largest', () => {
    const segments = ribbonSegments(
      buildBook([
        position({ ticker: 'A', qty: 10, current_price: 40 }),
        position({ ticker: 'B', qty: 10, current_price: 30 }),
        position({ ticker: 'C', qty: 10, current_price: 20 }),
        position({ ticker: 'D', qty: 10, current_price: 10 }),
      ]),
      'positions',
    )
    const summary = concentrationSummary(segments)

    expect(summary.topCount).toBe(3)
    expect(summary.topWeight).toBeCloseTo(90, 6)
    expect(summary.largest).toBe('A')
    expect(summary.largestWeight).toBeCloseTo(40, 6)
  })

  it('does not claim three positions when there are two', () => {
    const segments = ribbonSegments(
      buildBook([
        position({ ticker: 'A', qty: 10, current_price: 50 }),
        position({ ticker: 'B', qty: 10, current_price: 50 }),
      ]),
      'positions',
    )
    expect(concentrationSummary(segments).topCount).toBe(2)
  })

  it('returns null with nothing to summarise', () => {
    expect(concentrationSummary([])).toBeNull()
  })
})

describe('totalsOf', () => {
  const book = buildBook([
    position({ ticker: 'WIN', qty: 10, avg_cost: 100, current_price: 110, change_percent: 10 }),
    position({ ticker: 'LOSE', qty: 10, avg_cost: 100, current_price: 90, change_percent: -10 }),
  ])

  it('follows the filtered rows, not the whole book', () => {
    const winners = book.rows.filter((r) => r.ticker === 'WIN')
    const totals = totalsOf(winners, book)

    expect(totals.count).toBe(1)
    expect(totals.value).toBe(1100)
    expect(totals.unrealized).toBe(100)
    // Half the portfolio's value, and half of its absolute P/L in the positive
    // direction — a share of the WHOLE book, not of the filtered slice.
    expect(totals.weight).toBeCloseTo(55, 6)
    expect(totals.contribution).toBeCloseTo(50, 6)
  })

  it('nets the unfiltered book back to its own totals', () => {
    const totals = totalsOf(book.rows, book)
    expect(totals.value).toBe(book.totalValue)
    expect(totals.unrealized).toBe(book.unrealized)
  })

  it('reports no day total when no visible row was measured', () => {
    const stale = buildBook([position({ ticker: 'AAA', price_stale: true })])
    expect(totalsOf(stale.rows, stale).day).toBeNull()
  })
})

describe('smoothPath', () => {
  it('refuses to draw a line from fewer than two points', () => {
    expect(smoothPath([], 100, 40)).toBeNull()
    expect(smoothPath([5], 100, 40)).toBeNull()
  })

  it('drops non-numeric points rather than coercing them', () => {
    expect(smoothPath([1, null, 2], 100, 40)).not.toBeNull()
    expect(smoothPath([1, null], 100, 40)).toBeNull()
  })

  it('spans the full width and starts at the first point', () => {
    const d = smoothPath([1, 2, 3], 100, 40)
    expect(d.startsWith('M0.0 ')).toBe(true)
    expect(d).toContain('100.0')
  })

  it('survives a flat series without dividing by zero', () => {
    expect(smoothPath([5, 5, 5], 100, 40)).not.toContain('NaN')
  })
})

describe('inkOn', () => {
  it('picks white on the dark end of the ramp and ink on the light end', () => {
    expect(inkOn('#1E4BD8')).toBe('#FFFFFF')
    expect(inkOn('#C7D8FF')).toBe('#08132E')
  })
})
