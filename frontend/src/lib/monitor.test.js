import { describe, expect, it } from 'vitest'

import {
  MOMENTUM,
  MOMENTUM_WINDOW,
  attentionOf,
  averageDailyMove,
  buildMonitorRow,
  clipToPeriod,
  layoutSpectrum,
  momentumOf,
  momentumWhy,
  rangePosition,
  spectrumTicks,
  toCloses,
} from './monitor'

/** A series that rises at `rate` per session for the last 10, `prior` before. */
function series({ length = MOMENTUM_WINDOW, start = 100, step = 0 } = {}) {
  return Array.from({ length }, (_, i) => start + step * i)
}

function quote(overrides = {}) {
  return {
    state: 'live',
    price: 100,
    change: 1,
    changePercent: 1,
    isMarketPrice: true,
    unavailable: false,
    ...overrides,
  }
}

describe('toCloses', () => {
  it('accepts candles and bare numbers alike', () => {
    expect(toCloses([{ close: 1 }, { close: 2 }])).toEqual([1, 2])
    expect(toCloses([1, 2, 3])).toEqual([1, 2, 3])
  })

  it('drops non-finite values rather than coercing them to zero', () => {
    // A gap in a provider series that became a 0 would read as a -100% session.
    expect(toCloses([1, null, NaN, { close: 'x' }, 2])).toEqual([1, 2])
  })
})

describe('clipToPeriod', () => {
  /** Daily candles ending on a fixed date, so nothing here depends on today. */
  function daily(days, end = '2026-09-04T00:00:00Z') {
    const last = new Date(end).getTime()
    return Array.from({ length: days }, (_, i) => ({
      time: new Date(last - (days - 1 - i) * 86_400_000).toISOString(),
      close: 100 + i,
    }))
  }

  it('cuts a five-month series down to a one-month window', () => {
    // The observed failure: ?period=1m returning Apr 6 -> Sep 4.
    const clipped = clipToPeriod(daily(151), 31)
    const span =
      (new Date(clipped[clipped.length - 1].time) - new Date(clipped[0].time)) / 86_400_000
    expect(span).toBeLessThanOrEqual(31)
    expect(span).toBeGreaterThan(29)
  })

  it('anchors to the newest DATA POINT, not the wall clock', () => {
    // A series that ended two years ago still yields its own final month, so
    // the same fixture clips identically whenever this test is run.
    const stale = daily(120, '2024-01-31T00:00:00Z')
    const clipped = clipToPeriod(stale, 31)
    expect(clipped.length).toBeGreaterThan(1)
    expect(clipped[clipped.length - 1].time).toBe(stale[stale.length - 1].time)
    expect(new Date(clipped[0].time).getTime()).toBeGreaterThanOrEqual(
      new Date('2024-01-31T00:00:00Z').getTime() - 31 * 86_400_000,
    )
  })

  it('keeps the whole series for ALL', () => {
    const candles = daily(400)
    expect(clipToPeriod(candles, null)).toHaveLength(400)
  })

  it('widens correctly for a quarter and a year', () => {
    const candles = daily(500)
    expect(clipToPeriod(candles, 92).length).toBe(93)
    expect(clipToPeriod(candles, 366).length).toBe(367)
  })

  it('never synthesizes a point — clipping only removes', () => {
    const candles = daily(10)
    // A window wider than the data returns the data, not a padded series.
    expect(clipToPeriod(candles, 366)).toHaveLength(10)
  })

  it('leaves fewer than two points when the window is not covered, rather than stretching', () => {
    // One lone bar, then a two-year gap: a "1M" request has nothing to plot
    // except that final bar, and the caller must show its unavailable state.
    const candles = [
      { time: '2024-01-01T00:00:00Z', close: 100 },
      { time: '2026-09-04T00:00:00Z', close: 130 },
    ]
    expect(clipToPeriod(candles, 31)).toHaveLength(1)
  })

  it('drops points it cannot date or price', () => {
    const candles = [
      { time: 'not-a-date', close: 100 },
      { time: '2026-09-03T00:00:00Z', close: null },
      { time: '2026-09-04T00:00:00Z', close: 130 },
    ]
    expect(clipToPeriod(candles, 31)).toEqual([
      expect.objectContaining({ time: '2026-09-04T00:00:00Z', close: 130 }),
    ])
  })

  it('is safe on absent or empty input', () => {
    expect(clipToPeriod(undefined, 31)).toEqual([])
    expect(clipToPeriod([], 31)).toEqual([])
    expect(clipToPeriod([], null)).toEqual([])
  })
})

describe('momentumOf', () => {
  it('returns null below 31 sessions rather than redefining "20 days"', () => {
    expect(momentumOf(series({ length: 30 }))).toBeNull()
    expect(momentumOf([])).toBeNull()
  })

  it('reports Steady for a constant-rate climb', () => {
    // Geometric, not linear: a constant DOLLAR step is a decaying percentage
    // rate on a rising base, and the comparison is of returns.
    const m = momentumOf(Array.from({ length: 31 }, (_, i) => 100 * 1.005 ** i))
    expect(m.label).toBe(MOMENTUM.STEADY)
  })

  it('reads a constant dollar step as fading, because the rate really does decay', () => {
    // 100→120 is 1.00%/session; 120→130 is 0.83%/session. The pace slowed.
    expect(momentumOf(series({ step: 1 })).label).toBe(MOMENTUM.FADING)
  })

  it('reports Gaining when the recent leg outpaces the prior one', () => {
    const flat = Array.from({ length: 21 }, () => 100)
    const rally = Array.from({ length: 10 }, (_, i) => 100 + (i + 1) * 3)
    expect(momentumOf([...flat, ...rally]).label).toBe(MOMENTUM.GAINING)
  })

  it('reports Fading when the recent leg falls behind', () => {
    const rally = Array.from({ length: 21 }, (_, i) => 100 + i * 3)
    const last = rally[rally.length - 1]
    const stall = Array.from({ length: 10 }, (_, i) => last - (i + 1) * 2)
    expect(momentumOf([...rally, ...stall]).label).toBe(MOMENTUM.FADING)
  })

  it('carries both real returns, so the state is never a black box', () => {
    const m = momentumOf(series({ step: 1 }))
    expect(m.recent).toBeCloseTo((series({ step: 1 })[30] / series({ step: 1 })[20] - 1) * 100, 6)
    expect(momentumWhy(m)).toMatch(/Last 10 sessions .* vs the prior 20 at /)
  })

  it('says so plainly when there is nothing to compare', () => {
    expect(momentumWhy(null)).toBe('Not enough sessions to compare.')
  })
})

describe('rangePosition', () => {
  it('maps a price onto its own range', () => {
    expect(rangePosition(50, 0, 100)).toBe(0.5)
    expect(rangePosition(0, 0, 100)).toBe(0)
    expect(rangePosition(100, 0, 100)).toBe(1)
  })

  it('is null when there is no range to sit in', () => {
    expect(rangePosition(50, 50, 50)).toBeNull()
    expect(rangePosition(null, 0, 100)).toBeNull()
  })
})

describe('averageDailyMove', () => {
  it('is the mean absolute session-over-session percentage', () => {
    // +10%, then −9.09...%
    expect(averageDailyMove([100, 110, 100])).toBeCloseTo((10 + 100 / 11) / 2, 6)
  })

  it('is null without at least two closes', () => {
    expect(averageDailyMove([100])).toBeNull()
  })
})

describe('attentionOf', () => {
  const base = {
    hasQuote: true,
    position: 0.5,
    low: 90,
    high: 110,
    averageDaily: 1,
    changePercent: 0.5,
  }

  it('puts a missing quote above every other condition', () => {
    // Every other test is a claim about a price we do not have.
    const verdict = attentionOf({ ...base, hasQuote: false, position: 1 })
    expect(verdict.tag).toBe('No quote')
  })

  it('flags a symbol within 3% of its 30-session high, and says which high', () => {
    const verdict = attentionOf({ ...base, position: 0.98 })
    expect(verdict.tag).toBe('Near 30d high')
    expect(verdict.reason).toContain('$110.00')
  })

  it('flags a symbol within 3% of its low', () => {
    expect(attentionOf({ ...base, position: 0.01 }).tag).toBe('Near 30d low')
  })

  it('flags a move at twice the symbol’s own normal day, with the multiple', () => {
    const verdict = attentionOf({ ...base, averageDaily: 1.1, changePercent: -2.64 })
    expect(verdict.tag).toBe('Unusual move')
    expect(verdict.reason).toBe('Moving 2.4× its normal 1.10% day')
  })

  it('does not flag a move below that multiple', () => {
    expect(attentionOf({ ...base, averageDaily: 1.1, changePercent: 2.0 })).toBeNull()
  })

  it('returns null — not a low score — for an unremarkable symbol', () => {
    expect(attentionOf(base)).toBeNull()
  })
})

describe('buildMonitorRow', () => {
  const item = { id: '1', ticker: 'NVDA', company: 'NVIDIA Corp', sector: 'Semis' }

  it('measures the range against the live price', () => {
    const candles = series({ length: 31, start: 90, step: 1 }).map((close) => ({ close }))
    const row = buildMonitorRow(item, candles, quote({ price: 105 }))
    expect(row.low).toBe(91)
    expect(row.high).toBe(120)
    expect(row.position).toBeCloseTo((105 - 91) / (120 - 91), 6)
  })

  it('falls back to the last close, and reports no quote, when the price is unavailable', () => {
    const candles = [{ close: 10 }, { close: 20 }]
    const row = buildMonitorRow(
      item,
      candles,
      quote({ state: 'unavailable', price: null, isMarketPrice: false, unavailable: true }),
    )
    expect(row.hasQuote).toBe(false)
    expect(row.price).toBe(20)
    expect(row.changePercent).toBeNull()
  })

  it('yields no series, range or momentum at all when history is missing', () => {
    const row = buildMonitorRow(item, [], quote())
    expect(row.series).toBeNull()
    expect(row.low).toBeNull()
    expect(row.position).toBeNull()
    expect(row.momentum).toBeNull()
    expect(row.averageDaily).toBeNull()
    expect(row.return30).toBeNull()
  })

  it('drops the "Unknown" sector placeholder rather than printing it', () => {
    const row = buildMonitorRow({ ...item, sector: 'Unknown' }, [], quote())
    expect(row.sector).toBeNull()
  })
})

describe('layoutSpectrum', () => {
  const rowFor = (ticker, changePercent) => ({ ticker, changePercent })

  it('scales to the session’s own widest move and centres zero', () => {
    const rows = [rowFor('A', 2), rowFor('B', -1), rowFor('C', 0)]
    const { points, maxAbs } = layoutSpectrum(rows, 'A')
    expect(maxAbs).toBe(2)
    expect(points.find((p) => p.ticker === 'C').left).toBe('50.00%')
    expect(points.find((p) => p.ticker === 'A').left).toBe('94.00%')
    expect(points.find((p) => p.ticker === 'B').left).toBe('28.00%')
  })

  it('keeps an unquoted symbol on the axis instead of dropping it', () => {
    const { points } = layoutSpectrum([rowFor('A', 2), { ticker: 'B', changePercent: null }], 'A')
    const b = points.find((p) => p.ticker === 'B')
    expect(b.measured).toBe(false)
    expect(b.left).toBe('50.00%')
  })

  it('spreads colliding pills across lanes instead of stacking them', () => {
    // Four symbols within a whisker of each other cannot share one lane.
    const rows = [rowFor('A', 1), rowFor('B', 1.01), rowFor('C', 1.02), rowFor('D', 1.03)]
    const lanes = layoutSpectrum(rows, 'A').points.map((p) => p.lane)
    expect(new Set(lanes).size).toBe(4)
  })

  it('keeps the four authored lanes and the authored axis on a desktop track', () => {
    const rows = Array.from({ length: 12 }, (_, i) => rowFor(`S${i}`, 1 + i * 0.001))
    const out = layoutSpectrum(rows, 'S0')
    expect(out.lanes).toBe(4)
    expect(out.axisY).toBe(100)
    for (const point of out.points) {
      expect(point.lane).toBeGreaterThanOrEqual(0)
      expect(point.lane).toBeLessThan(4)
    }
  })

  it('grows more lanes as the track narrows, and the axis moves with them', () => {
    expect(layoutSpectrum([rowFor('A', 1)], 'A', { trackWidth: 1104 }).lanes).toBe(4)

    const medium = layoutSpectrum([rowFor('A', 1)], 'A', { trackWidth: 868 })
    expect(medium.lanes).toBe(6)
    expect(medium.axisY).toBe(148)

    const narrow = layoutSpectrum([rowFor('A', 1)], 'A', { trackWidth: 596 })
    expect(narrow.lanes).toBe(8)
    expect(narrow.axisY).toBe(196)
  })

  it('measures pill width against the REAL track, so a narrow axis packs wider', () => {
    // The same two symbols: on a desktop track they clear each other in one
    // lane; on a 596px track the same pixels no longer fit, so they separate.
    const rows = [rowFor('AAPL', 0.6), rowFor('GOOGL', 0.9)]
    const wide = layoutSpectrum(rows, 'AAPL', { trackWidth: 856, lanes: 2 })
    const narrow = layoutSpectrum(rows, 'AAPL', { trackWidth: 300, lanes: 2 })
    expect(new Set(wide.points.map((p) => p.lane)).size).toBe(1)
    expect(new Set(narrow.points.map((p) => p.lane)).size).toBe(2)
  })

  it('reserves more room for a pill that carries its percentage figure', () => {
    // The outlier shows its figure, so the next pill must clear a wider box.
    const rows = [rowFor('AAA', 5), rowFor('BBB', 4.6)]
    const { points } = layoutSpectrum(rows, 'AAA', { trackWidth: 856, lanes: 4 })
    expect(points.some((p) => p.showPercent)).toBe(true)
    expect(new Set(points.map((p) => p.lane)).size).toBe(2)
  })

  it('marks the selected symbol and only that one', () => {
    const { points } = layoutSpectrum([rowFor('A', 1), rowFor('B', 2)], 'B')
    expect(points.filter((p) => p.selected).map((p) => p.ticker)).toEqual(['B'])
  })
})

describe('spectrumTicks', () => {
  it('labels five stops against the session maximum', () => {
    const ticks = spectrumTicks(4)
    expect(ticks.map((t) => t.label)).toEqual(['−4.0%', '−2.0%', '0%', '+2.0%', '+4.0%'])
    expect(ticks[2].left).toBe('50.0%')
  })
})
