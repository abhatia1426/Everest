import { describe, expect, it } from 'vitest'

import {
  CHART_PERIODS,
  PRICE_H,
  axisLabels,
  clipToPeriod,
  costOverlay,
  describeWindow,
  fiftyTwoWeekFrame,
  gridLines,
  hasRealOhlc,
  hasVolume,
  layoutBars,
  periodFor,
  priceDomain,
  spanDays,
  windowReturn,
  yFor,
} from './priceSeries'

/** Daily candles ending on a fixed date, so nothing here depends on today. */
function daily(days, { end = '2026-09-04T00:00:00Z', start = 100, step = 1, range = 2 } = {}) {
  const last = new Date(end).getTime()
  return Array.from({ length: days }, (_, i) => {
    const close = start + step * i
    return {
      time: new Date(last - (days - 1 - i) * 86_400_000).toISOString(),
      open: close - step / 2,
      high: close + range,
      low: close - range,
      close,
      volume: 1000 + i,
    }
  })
}

describe('CHART_PERIODS', () => {
  it('offers the six approved stops and maps each to a real backend period', () => {
    expect(CHART_PERIODS.map((p) => p.key)).toEqual(['1D', '1W', '1M', '3M', '1Y', '5Y'])
    // Every `api` value must be a key the backend's PERIOD_MAP actually serves.
    expect(CHART_PERIODS.map((p) => p.api)).toEqual(['1d', '1w', '1m', '3m', '1y', 'all'])
  })

  it('builds 5Y from the ten-year series clipped to five years, not from a faked window', () => {
    const fiveYear = periodFor('5Y')
    expect(fiveYear.api).toBe('all')
    expect(fiveYear.days).toBe(1825)
  })

  it('falls back to a real period for an unknown key', () => {
    expect(periodFor('nonsense').key).toBe('1M')
  })
})

describe('clipToPeriod, applied to the workstation periods', () => {
  it('cuts an over-long provider response down to the pill it was requested for', () => {
    // The observed failure: ?period=1m returning five months of bars.
    const clipped = clipToPeriod(daily(151), periodFor('1M').days)
    expect(spanDays(clipped)).toBeLessThanOrEqual(31)
    expect(spanDays(clipped)).toBeGreaterThan(29)
  })

  it('cuts a ten-year series to a genuine five-year window', () => {
    const decade = daily(3650)
    const clipped = clipToPeriod(decade, periodFor('5Y').days)
    expect(spanDays(clipped)).toBeLessThanOrEqual(1825)
    expect(spanDays(clipped)).toBeGreaterThan(1800)
    // It ends where the data ends — anchored to the newest point, not to now.
    expect(clipped[clipped.length - 1].time).toBe(decade[decade.length - 1].time)
  })
})

describe('describeWindow', () => {
  it('uses the period word when the data fills the window', () => {
    expect(describeWindow(daily(31), periodFor('1M'))).toBe('over the past month')
    expect(describeWindow(daily(360), periodFor('1Y'))).toBe('over the past year')
  })

  it('states the real start date when the provider held less than the window', () => {
    // Two years of history under a five-year pill would be a false claim.
    const caption = describeWindow(daily(730), periodFor('5Y'))
    expect(caption).not.toBe('over the past five years')
    expect(caption).toMatch(/^since /)
  })

  it('never calls a single session short', () => {
    const bars = [
      { time: '2026-09-04T13:30:00Z', close: 100 },
      { time: '2026-09-04T20:00:00Z', close: 101 },
    ]
    expect(describeWindow(bars, periodFor('1D'))).toBe('today')
  })

  it('is null when there is nothing plotted', () => {
    expect(describeWindow([], periodFor('1M'))).toBeNull()
    expect(describeWindow(daily(1), periodFor('1M'))).toBeNull()
  })
})

describe('windowReturn', () => {
  it('measures first close to last close', () => {
    const change = windowReturn(daily(3, { start: 100, step: 10 }))
    expect(change.percent).toBeCloseTo(20, 6)
    expect(change.absolute).toBeCloseTo(20, 6)
  })

  it('is null without two points', () => {
    expect(windowReturn(daily(1))).toBeNull()
    expect(windowReturn([])).toBeNull()
  })
})

describe('hasRealOhlc', () => {
  it('accepts bars that carry a genuine range', () => {
    expect(hasRealOhlc(daily(20))).toBe(true)
  })

  it('rejects close-only bars wearing an OHLC shape', () => {
    // The backend fills open/high/low with the close when the provider omits
    // them; drawing candles from that implies flat sessions that never happened.
    const flat = daily(20).map((c) => ({ ...c, open: c.close, high: c.close, low: c.close }))
    expect(hasRealOhlc(flat)).toBe(false)
  })

  it('tolerates a few flat bars in an otherwise real series', () => {
    const mostly = daily(20)
    mostly[3] = { ...mostly[3], high: mostly[3].close, low: mostly[3].close }
    expect(hasRealOhlc(mostly)).toBe(true)
  })
})

describe('hasVolume', () => {
  it('is true only for bars that report traded size', () => {
    expect(hasVolume(daily(5))).toBe(true)
    expect(hasVolume(daily(5).map((c) => ({ ...c, volume: 0 })))).toBe(false)
    expect(hasVolume(daily(5).map((c) => ({ ...c, volume: null })))).toBe(false)
  })
})

describe('priceDomain', () => {
  it('spans wicks in candle mode and closes otherwise', () => {
    const candles = daily(5, { start: 100, step: 0, range: 5 })
    const line = priceDomain(candles, { candleMode: false })
    const candle = priceDomain(candles, { candleMode: true })
    expect(line.dataMin).toBe(100)
    expect(line.dataMax).toBe(100)
    expect(candle.dataMin).toBe(95)
    expect(candle.dataMax).toBe(105)
  })

  it('gives a flat series a domain to sit in the middle of', () => {
    const domain = priceDomain(daily(4, { step: 0, range: 0 }), { candleMode: false })
    expect(domain.span).toBeGreaterThan(0)
    expect(yFor(100, domain)).toBeCloseTo(PRICE_H / 2, 5)
  })

  it('is null with nothing to plot', () => {
    expect(priceDomain([], {})).toBeNull()
  })
})

describe('costOverlay', () => {
  const candles = daily(10, { start: 100, step: 1, range: 0 })
  const domain = priceDomain(candles, { candleMode: false })

  it('draws a real line when the basis is inside the plotted domain', () => {
    const overlay = costOverlay(104, domain)
    expect(overlay.inside).toBe(true)
    expect(overlay.y).toBeGreaterThanOrEqual(0)
    expect(overlay.y).toBeLessThanOrEqual(PRICE_H)
  })

  it('reports BELOW range without drawing a line, when the basis sits under the domain', () => {
    // The ordinary case for a profitable holding.
    const overlay = costOverlay(40, domain)
    expect(overlay.inside).toBe(false)
    expect(overlay.below).toBe(true)
    expect(overlay.distance).toBeCloseTo(100 - 40, 6)
  })

  it('reports ABOVE range when the basis sits over the domain', () => {
    const overlay = costOverlay(400, domain)
    expect(overlay.inside).toBe(false)
    expect(overlay.below).toBe(false)
    expect(overlay.distance).toBeCloseTo(400 - 109, 6)
  })

  it('does not widen the domain to reach an out-of-range basis', () => {
    // The domain is a property of the DATA; the overlay never edits it.
    const before = priceDomain(candles, { candleMode: false })
    costOverlay(40, before)
    expect(before.dataMin).toBe(100)
    expect(before.dataMax).toBe(109)
  })

  it('is null when there is no basis at all', () => {
    expect(costOverlay(null, domain)).toBeNull()
    expect(costOverlay(120, null)).toBeNull()
  })
})

describe('layoutBars', () => {
  const candles = daily(4, { start: 100, step: 2, range: 3 })
  const domain = priceDomain(candles, { candleMode: true })

  it('gives every bar a slot inside the track', () => {
    const bars = layoutBars(candles, domain)
    expect(bars).toHaveLength(4)
    for (const bar of bars) {
      expect(bar.left).toBeGreaterThanOrEqual(0)
      expect(bar.left + bar.width).toBeLessThanOrEqual(100)
      expect(bar.bodyHeight).toBeGreaterThan(0)
      expect(bar.wickHeight).toBeGreaterThan(0)
    }
  })

  it('scales volume against the tallest bar and never below a visible floor', () => {
    const bars = layoutBars(candles, domain)
    const tallest = bars.reduce((a, b) => (a.volumeHeight > b.volumeHeight ? a : b))
    expect(tallest.volumeHeight).toBeCloseTo(18, 5)
    for (const bar of bars) expect(bar.volumeHeight).toBeGreaterThanOrEqual(1.4)
  })

  it('gives no volume height at all when no bar reports volume', () => {
    const bars = layoutBars(candles.map((c) => ({ ...c, volume: 0 })), domain)
    for (const bar of bars) expect(bar.volumeHeight).toBe(0)
  })
})

describe('gridLines', () => {
  const domain = priceDomain(daily(5, { start: 100, step: 5 }), { candleMode: false })

  it('draws five labelled stops across the price band', () => {
    const lines = gridLines(domain, null)
    expect(lines).toHaveLength(5)
    expect(lines[0].y).toBe(0)
    expect(lines[4].y).toBe(PRICE_H)
  })

  it('hides only the label that would collide with the current-price tag', () => {
    const lines = gridLines(domain, PRICE_H / 2)
    expect(lines.filter((line) => line.hidden)).toHaveLength(1)
  })
})

describe('axisLabels', () => {
  it('reads its stops from real candle timestamps', () => {
    const labels = axisLabels(daily(30), periodFor('1M'))
    expect(labels).toHaveLength(5)
    expect(labels[0].align).toBe('left')
    expect(labels[4].align).toBe('right')
    expect(labels.every((l) => l.label.length > 0)).toBe(true)
  })

  it('returns nothing when there is no series', () => {
    expect(axisLabels([], periodFor('1M'))).toEqual([])
  })
})

describe('fiftyTwoWeekFrame', () => {
  it('prefers the provider figures and marks them as reported', () => {
    const frame = fiftyTwoWeekFrame({ quoteHigh: 200, quoteLow: 100, price: 150 })
    expect(frame.derived).toBe(false)
    expect(frame.position).toBeCloseTo(0.5, 6)
  })

  it('computes the range from a year of candles when the provider omits it', () => {
    const frame = fiftyTwoWeekFrame({
      quoteHigh: null,
      quoteLow: null,
      yearCandles: daily(360, { start: 100, step: 1 }),
      price: 300,
    })
    expect(frame.derived).toBe(true)
    expect(frame.low).toBe(100)
    // The price has just printed a new high; the year must contain it.
    expect(frame.high).toBe(459)
  })

  it('refuses to call three months a year', () => {
    const frame = fiftyTwoWeekFrame({
      quoteHigh: null,
      quoteLow: null,
      yearCandles: daily(90),
      price: 150,
    })
    expect(frame).toBeNull()
  })

  it('is null when neither source can support the claim', () => {
    expect(fiftyTwoWeekFrame({ quoteHigh: null, quoteLow: null, price: 10 })).toBeNull()
    // An inverted range is not a range.
    expect(fiftyTwoWeekFrame({ quoteHigh: 10, quoteLow: 20, price: 15 })).toBeNull()
  })

  it('projects any price onto the gauge band, clamped to the year', () => {
    const frame = fiftyTwoWeekFrame({ quoteHigh: 200, quoteLow: 100, price: 150 })
    expect(frame.project(200)).toBeCloseTo(0, 5)
    expect(frame.project(100)).toBeCloseTo(PRICE_H, 5)
    // Outside the year, clamped rather than drawn off the track.
    expect(frame.project(1000)).toBeCloseTo(0, 5)
    expect(frame.project(1)).toBeCloseTo(PRICE_H, 5)
  })
})
