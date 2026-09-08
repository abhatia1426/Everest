import { describe, expect, it } from 'vitest'

import { buildBrief, groundingFor, reconstructBook, seriesReturn } from './brief'

function position(overrides = {}) {
  return {
    ticker: 'AAPL',
    company: 'Apple Inc',
    sector: 'Hardware',
    qty: 10,
    current_price: 110,
    previous_close: 100,
    market_value: 1100,
    price_stale: false,
    ...overrides,
  }
}

/** A rising close series, oldest first. */
function closes(start, step, length = 30) {
  return Array.from({ length }, (_, i) => ({ time: `d${i}`, close: start + step * i }))
}

const PNL = {
  total_value: 3000,
  total_cost: 2400,
  positions: [
    position({ ticker: 'UP1', qty: 10, current_price: 110, previous_close: 100, market_value: 1100 }),
    position({ ticker: 'DN1', qty: 10, current_price: 90, previous_close: 100, market_value: 900, sector: 'Software' }),
    position({ ticker: 'UP2', qty: 10, current_price: 101, previous_close: 100, market_value: 1010, sector: 'Semis' }),
  ],
  allocation: [
    { sector: 'Hardware', value: 1100 },
    { sector: 'Semis', value: 1010 },
    { sector: 'Software', value: 900 },
  ],
}

const idFor = (brief) => brief.items.map((i) => i.id)

describe('buildBrief — measured items', () => {
  it('names the biggest contributor and detractor from real arithmetic', () => {
    const brief = buildBrief({ pnl: PNL })
    const top = brief.items.find((i) => i.id === 'top-contributor')
    const bottom = brief.items.find((i) => i.id === 'top-detractor')

    expect(top.ticker).toBe('UP1')
    expect(top.figure).toBe(100)
    expect(bottom.ticker).toBe('DN1')
    expect(bottom.figure).toBe(-100)
  })

  it('reports concentration off the same allocation the portfolio route uses', () => {
    const item = buildBrief({ pnl: PNL }).items.find((i) => i.id === 'concentration')
    expect(item.figure).toBeCloseTo((1100 / 3000) * 100, 6)
    expect(item.statement).toContain('Hardware')
  })

  it('counts breadth only over holdings it actually measured', () => {
    const brief = buildBrief({
      pnl: { ...PNL, positions: [...PNL.positions, position({ ticker: 'DARK', previous_close: null })] },
    })
    const item = brief.items.find((i) => i.id === 'breadth')
    expect(item.statement).toContain('3 priced holdings')
  })

  it('emits no items at all for an empty book', () => {
    expect(buildBrief({ pnl: { positions: [], allocation: [] } }).items).toEqual([])
  })

  it('makes no claim about causes, forecasts, ratings or confidence', () => {
    const brief = buildBrief({ pnl: PNL })
    const prose = brief.items.map((i) => `${i.statement} ${i.figureNote} ${i.proof?.tip || ''}`).join(' ').toLowerCase()
    for (const banned of ['because', 'due to', 'expect', 'forecast', 'should buy', 'confidence', 'rating', 'target']) {
      expect(prose).not.toContain(banned)
    }
  })
})

describe('buildBrief — unusual watchlist move', () => {
  const watchlist = [{ ticker: 'NVDA', change_percent: 6 }, { ticker: 'AMD', change_percent: 1 }]
  // NVDA's normal day is ~1%; AMD's is ~1% too, so NVDA is the bigger gap.
  const candlesFor = (t) => (t === 'NVDA' || t === 'AMD' ? closes(100, 1) : [])

  it('ranks by size against each name\'s OWN normal day', () => {
    const item = buildBrief({ pnl: PNL, watchlist, candlesFor }).items.find(
      (i) => i.id === 'unusual-watchlist',
    )
    expect(item.ticker).toBe('NVDA')
    expect(item.proof.tip).toContain('direction is not part of the ratio')
  })

  it('is omitted when there is no history to establish a normal day', () => {
    const brief = buildBrief({ pnl: PNL, watchlist, candlesFor: () => [] })
    expect(idFor(brief)).not.toContain('unusual-watchlist')
  })
})

describe('buildBrief — nearest option expiry', () => {
  const options = [
    { ticker: 'TSLA', strike: 380, type: 'call', qty: 1, expiry: '2026-09-04', dte: 2 },
    { ticker: 'AAPL', strike: 200, type: 'put', qty: 2, expiry: '2026-12-19', dte: 108 },
  ]

  it('reports the soonest contract on the scale of the whole book', () => {
    const item = buildBrief({ pnl: PNL, options }).items.find((i) => i.id === 'nearest-expiry')
    expect(item.figure).toBe(2)
    expect(item.statement).toContain('TSLA')
    expect(item.proof.axisRight).toBe('108 days to your last expiry')
  })

  it('is omitted with no tracked contracts', () => {
    expect(idFor(buildBrief({ pnl: PNL }))).not.toContain('nearest-expiry')
  })
})

describe('reconstructBook — all or nothing', () => {
  const positions = [position({ ticker: 'A', qty: 2 }), position({ ticker: 'B', qty: 3 })]

  it('sums shares times close across every holding', () => {
    const { series } = reconstructBook(positions, () => closes(100, 1, 5))
    expect(series).toHaveLength(5)
    expect(series[0]).toBe(2 * 100 + 3 * 100)
  })

  it('refuses to reconstruct from a partial book and names what is missing', () => {
    const { series, missing } = reconstructBook(positions, (t) => (t === 'A' ? closes(100, 1, 5) : []))
    expect(series).toBeNull()
    expect(missing).toEqual(['B'])
  })
})

describe('buildBrief — benchmark comparison', () => {
  const positions = [position({ ticker: 'A', qty: 1 })]
  const pnl = { ...PNL, positions }

  it('compares only when the whole book reconstructs', () => {
    const brief = buildBrief({
      pnl,
      candlesFor: (t) => (t === 'A' || t === 'SPY' ? closes(100, 1, 10) : []),
    })
    expect(idFor(brief)).toContain('vs-benchmark')
  })

  it('withholds the comparison and names the gap when history is incomplete', () => {
    const brief = buildBrief({
      pnl,
      candlesFor: (t) => (t === 'SPY' ? closes(100, 1, 10) : []),
    })
    expect(idFor(brief)).not.toContain('vs-benchmark')
    const note = brief.limitations.find((l) => l.id === 'incomplete-history')
    expect(note.text).toContain('A')
    expect(note.text).toContain('does not compare a partial book')
  })

  it('withholds the comparison when the benchmark itself is unavailable', () => {
    const brief = buildBrief({ pnl, candlesFor: (t) => (t === 'A' ? closes(100, 1, 10) : []) })
    expect(idFor(brief)).not.toContain('vs-benchmark')
    expect(brief.limitations.some((l) => l.id === 'missing-benchmark')).toBe(true)
  })

  it('compares both sides over the same number of sessions', () => {
    const brief = buildBrief({
      pnl,
      candlesFor: (t) => (t === 'A' ? closes(100, 1, 10) : closes(400, 2, 30)),
    })
    const item = brief.items.find((i) => i.id === 'vs-benchmark')
    expect(item.statement).toContain('last 10 sessions')
    expect(item.proof.mine).toHaveLength(10)
    expect(item.proof.bench).toHaveLength(10)
  })
})

describe('limitations', () => {
  it('names holdings the attribution could not measure', () => {
    const brief = buildBrief({
      pnl: { ...PNL, positions: [...PNL.positions, position({ ticker: 'DARK', previous_close: null })] },
    })
    const note = brief.limitations.find((l) => l.id === 'unmeasured-holdings')
    expect(note.text).toContain('DARK')
    expect(note.text).toContain('not counted as unchanged')
  })
})

describe('groundingFor', () => {
  it('uses friendly source names and never a route or payload', () => {
    const brief = buildBrief({ pnl: PNL })
    const names = groundingFor({ pnl: PNL, brief }).map((s) => s.name)
    expect(names).toContain('Portfolio positions')
    expect(names).toContain('Quotes')
    expect(names.join(' ')).not.toMatch(/\/|api|json|gemini/i)
  })

  it('reports how many holdings are carried at cost basis', () => {
    const pnl = { ...PNL, positions: [...PNL.positions, position({ ticker: 'S', price_stale: true })] }
    const quotes = groundingFor({ pnl, brief: buildBrief({ pnl }) }).find((s) => s.name === 'Quotes')
    expect(quotes.detail).toBe('3 live · 1 at cost basis')
  })
})

describe('seriesReturn', () => {
  it('is first to last, in percent', () => {
    expect(seriesReturn([100, 110])).toBeCloseTo(10, 10)
  })

  it('is null rather than zero when there is nothing to measure', () => {
    expect(seriesReturn([100])).toBeNull()
    expect(seriesReturn([])).toBeNull()
  })
})
