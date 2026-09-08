import { describe, expect, it } from 'vitest'

import { beamLabels, buildAttribution, contributionOf, layoutBeam } from './attribution'

function position(overrides = {}) {
  return {
    ticker: 'AAPL',
    company: 'Apple Inc',
    sector: 'Hardware',
    qty: 10,
    current_price: 200,
    previous_close: 190,
    market_value: 2000,
    price_stale: false,
    ...overrides,
  }
}

describe('contributionOf', () => {
  it('is shares times the change since previous close', () => {
    const row = contributionOf(position())
    expect(row.contribution).toBeCloseTo(100, 10)
    expect(row.dayPercent).toBeCloseTo((10 / 190) * 100, 10)
  })

  it('does NOT use market value times change percent', () => {
    // The portfolio route's day-change form evaluates to
    // shares × price × (price − prev) / prev, which is larger for a riser.
    // The beam's widths claim to BE the dollars, so it must not inherit that.
    const row = contributionOf(position())
    const wrong = 2000 * ((10 / 190) * 100) / 100
    expect(wrong).toBeGreaterThan(row.contribution)
    expect(row.contribution).toBe(100)
  })

  it('reports a holding with no previous close as unmeasured, not as zero', () => {
    const row = contributionOf(position({ previous_close: null }))
    expect(row.measurable).toBe(false)
    expect(row.contribution).toBeNull()
  })

  it('refuses to difference a cost-basis stand-in against yesterday', () => {
    const row = contributionOf(position({ price_stale: true, current_price: 180 }))
    expect(row.measurable).toBe(false)
    expect(row.contribution).toBeNull()
  })

  it('treats a zero previous close as unmeasurable rather than dividing by it', () => {
    const row = contributionOf(position({ previous_close: 0 }))
    expect(row.measurable).toBe(false)
    expect(row.dayPercent).toBeNull()
  })
})

describe('buildAttribution', () => {
  const positions = [
    position({ ticker: 'UP1', qty: 10, current_price: 110, previous_close: 100 }), // +100
    position({ ticker: 'UP2', qty: 5, current_price: 60, previous_close: 50 }), //   +50
    position({ ticker: 'DN1', qty: 4, current_price: 80, previous_close: 100 }), //  −80
    position({ ticker: 'FLAT', qty: 3, current_price: 25, previous_close: 25 }), //    0
  ]

  it('splits and sorts both sides by magnitude', () => {
    const attr = buildAttribution(positions)
    expect(attr.contributors.map((r) => r.ticker)).toEqual(['UP1', 'UP2'])
    expect(attr.detractors.map((r) => r.ticker)).toEqual(['DN1'])
    expect(attr.flat.map((r) => r.ticker)).toEqual(['FLAT'])
  })

  it('nets the two sides', () => {
    const attr = buildAttribution(positions)
    expect(attr.gainSum).toBe(150)
    expect(attr.lossSum).toBe(80)
    expect(attr.net).toBe(70)
  })

  it('reports incompleteness rather than absorbing an unpriced holding', () => {
    const attr = buildAttribution([...positions, position({ ticker: 'DARK', previous_close: null })])
    expect(attr.complete).toBe(false)
    expect(attr.unmeasured.map((r) => r.ticker)).toEqual(['DARK'])
    // and the unmeasured name must not have moved the totals
    expect(attr.net).toBe(70)
  })

  it('is complete when every holding has both prices', () => {
    expect(buildAttribution(positions).complete).toBe(true)
  })

  it('has no data for an empty book', () => {
    const attr = buildAttribution([])
    expect(attr.hasData).toBe(false)
    expect(attr.complete).toBe(false)
  })
})

describe('layoutBeam', () => {
  const attr = buildAttribution([
    position({ ticker: 'UP1', qty: 10, current_price: 110, previous_close: 100 }), // +100
    position({ ticker: 'DN1', qty: 4, current_price: 80, previous_close: 100 }), //   −80
  ])
  const layout = layoutBeam(attr)

  it('puts detractors left of the anchor and contributors right', () => {
    const up = layout.segments.find((s) => s.row.ticker === 'UP1')
    const down = layout.segments.find((s) => s.row.ticker === 'DN1')
    expect(up.x).toBeGreaterThanOrEqual(layout.zeroX)
    expect(down.x).toBeLessThan(layout.zeroX)
  })

  it('uses ONE dollar scale, so equal dollars are equal widths on both sides', () => {
    const balanced = buildAttribution([
      position({ ticker: 'U', qty: 1, current_price: 150, previous_close: 100 }), // +50
      position({ ticker: 'D', qty: 1, current_price: 50, previous_close: 100 }), //  −50
    ])
    const { segments, zeroX } = layoutBeam(balanced)
    const up = segments.find((s) => s.side === 'contributor')
    const down = segments.find((s) => s.side === 'detractor')
    expect(up.width).toBeCloseTo(down.width, 10)
    expect(zeroX).toBeCloseTo(50, 10)
  })

  it('places the net marker at the visible difference between the runs', () => {
    // net = +20 on a 180 span across 96% of track
    const unit = 96 / 180
    expect(layout.netX).toBeCloseTo(layout.zeroX + 20 * unit, 10)
  })

  it('degrades to a centred anchor when nothing moved', () => {
    const flat = layoutBeam(buildAttribution([position({ current_price: 100, previous_close: 100 })]))
    expect(flat.hasSpan).toBe(false)
    expect(flat.segments).toEqual([])
    expect(flat.zeroX).toBe(50)
  })

  it('tiles each side without gaps or overlap', () => {
    const total = layout.segments.reduce((sum, s) => sum + s.width, 0)
    expect(total).toBeCloseTo(96, 10)
  })
})

describe('beamLabels', () => {
  it('labels only segments wide enough to carry text', () => {
    const attr = buildAttribution([
      position({ ticker: 'BIG', qty: 100, current_price: 110, previous_close: 100 }),
      position({ ticker: 'TINY', qty: 1, current_price: 100.1, previous_close: 100 }),
    ])
    const labels = beamLabels(layoutBeam(attr))
    expect(labels.map((l) => l.ticker)).toEqual(['BIG'])
  })

  it('alternates rows so neighbouring labels do not collide', () => {
    const attr = buildAttribution([
      position({ ticker: 'A', qty: 10, current_price: 110, previous_close: 100 }),
      position({ ticker: 'B', qty: 10, current_price: 109, previous_close: 100 }),
      position({ ticker: 'C', qty: 10, current_price: 108, previous_close: 100 }),
    ])
    const labels = beamLabels(layoutBeam(attr))
    expect(labels.map((l) => l.row)).toEqual([0, 1, 0])
  })
})
