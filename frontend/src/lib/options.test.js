import { describe, expect, it } from 'vitest'

import {
  attentionReasons,
  bookTotals,
  breakeven,
  capitalAtRisk,
  contractView,
  distanceToBreakeven,
  expiryBuckets,
  groupByExpiry,
  moneyness,
  runwayScale,
  runwayTicks,
  strikeMeter,
  workspaceCohorts,
} from './options'

/**
 * The Options page states money and time as facts, so the arithmetic behind
 * every figure is tested rather than inspected. Calls and puts are opposite in
 * every one of these functions, which is exactly the class of bug that reads
 * as plausible on screen.
 */

const call = (over = {}) => ({
  id: 'c1',
  ticker: 'NVDA',
  type: 'call',
  strike: 100,
  expiry: '2026-09-18',
  qty: 2,
  avg_cost: 5,
  cost_basis: 1000,
  underlying_price: 110,
  est_price: 12,
  est_value: 2400,
  pnl: 1400,
  pnl_percent: 140,
  dte: 12,
  ...over,
})

const put = (over = {}) =>
  call({ id: 'p1', type: 'put', underlying_price: 90, pnl: -400, pnl_percent: -40, ...over })

describe('breakeven', () => {
  it('adds the premium for a call and subtracts it for a put', () => {
    expect(breakeven(call())).toBe(105)
    expect(breakeven(put())).toBe(95)
  })

  it('is null when a term is missing', () => {
    expect(breakeven(call({ avg_cost: null }))).toBeNull()
  })
})

describe('moneyness', () => {
  it('reads +5% for a call above its strike and a put below its strike', () => {
    expect(moneyness(call({ underlying_price: 105 }))).toEqual({ percent: 5, state: 'ITM' })
    expect(moneyness(put({ underlying_price: 95 }))).toEqual({ percent: 5, state: 'ITM' })
  })

  it('reads OTM in the opposite direction for each type', () => {
    expect(moneyness(call({ underlying_price: 95 })).state).toBe('OTM')
    expect(moneyness(put({ underlying_price: 105 })).state).toBe('OTM')
  })

  it('treats a half-percent band around the strike as at the money', () => {
    expect(moneyness(call({ underlying_price: 100.4 })).state).toBe('ATM')
    expect(moneyness(call({ underlying_price: 99.6 })).state).toBe('ATM')
  })

  it('is null without an underlying price', () => {
    expect(moneyness(call({ underlying_price: null }))).toBeNull()
  })
})

describe('distanceToBreakeven', () => {
  it('is positive while the move is still needed and negative once passed', () => {
    // Call breakeven 105, spot 100 -> needs a 5% rise.
    expect(distanceToBreakeven(call({ underlying_price: 100 }))).toBeCloseTo(5)
    expect(distanceToBreakeven(call({ underlying_price: 110 }))).toBeLessThan(0)
  })

  it('measures a put in the opposite direction', () => {
    // Put breakeven 95, spot 100 -> needs a 5% fall.
    expect(distanceToBreakeven(put({ underlying_price: 100 }))).toBeCloseTo(5)
    expect(distanceToBreakeven(put({ underlying_price: 90 }))).toBeLessThan(0)
  })
})

describe('capitalAtRisk', () => {
  it('sums cost basis, which for long-only contracts is the maximum loss', () => {
    expect(capitalAtRisk([call(), put({ cost_basis: 500 })])).toBe(1500)
  })
})

describe('expiryBuckets', () => {
  it('splits on the dteTone bands', () => {
    expect(
      expiryBuckets([{ dte: -1 }, { dte: 0 }, { dte: 7 }, { dte: 8 }, { dte: 30 }, { dte: 31 }]),
    ).toEqual({ expired: 1, week: 2, month: 2, later: 1 })
  })
})

describe('groupByExpiry', () => {
  it('groups by date, sums value and P/L, and orders soonest first', () => {
    const groups = groupByExpiry([
      call({ id: 'a', expiry: '2026-10-16', dte: 40, est_value: 100, pnl: 10 }),
      call({ id: 'b', expiry: '2026-09-18', dte: 12, est_value: 200, pnl: -20 }),
      call({ id: 'c', expiry: '2026-09-18', dte: 12, est_value: 50, pnl: 5 }),
    ])

    expect(groups.map((group) => group.expiry)).toEqual(['2026-09-18', '2026-10-16'])
    expect(groups[0].value).toBe(250)
    expect(groups[0].pnl).toBe(-15)
    expect(groups[0].contracts).toHaveLength(2)
  })
})

describe('contractView', () => {
  it('marks a contract with no estimate as unpriced rather than worthless', () => {
    const view = contractView(call({ est_value: null, pnl: null, underlying_price: null }))
    expect(view.priced).toBe(false)
    expect(view.value).toBeNull()
    expect(view.spot).toBeNull()
    expect(view.moneynessState).toBeNull()
  })

  it('carries derived facts alongside the stored ones', () => {
    const view = contractView(call())
    expect(view.isCall).toBe(true)
    expect(view.breakeven).toBe(105)
    expect(view.atRisk).toBe(1000)
    expect(view.moneynessState).toBe('ITM')
  })
})

describe('bookTotals', () => {
  it('excludes unpriced contracts from value and P/L but not from capital at risk', () => {
    const totals = bookTotals([
      contractView(call()),
      contractView(call({ id: 'x', est_value: null, pnl: null, cost_basis: 700 })),
    ])

    expect(totals.value).toBe(2400)
    expect(totals.pnl).toBe(1400)
    // Risk is what was actually paid, whether or not a quote arrived.
    expect(totals.cost).toBe(1700)
    expect(totals.unpriced).toBe(1)
    // Percent is measured only against the premium behind the priced row.
    expect(totals.pnlPercent).toBeCloseTo(140)
  })

  it('counts calls and puts and finds the nearest expiry', () => {
    const totals = bookTotals([
      contractView(call({ dte: 40 })),
      contractView(put({ dte: 3 })),
    ])

    expect(totals.calls).toBe(1)
    expect(totals.puts).toBe(1)
    expect(totals.nearest.dte).toBe(3)
    expect(totals.urgent).toHaveLength(1)
  })

  it('reports no percentage when nothing could be priced', () => {
    const totals = bookTotals([contractView(call({ est_value: null, pnl: null }))])
    expect(totals.pnlPercent).toBeNull()
  })
})

describe('runwayScale', () => {
  it('stretches the near weeks — 7 of 120 days takes far more than 6% of the axis', () => {
    const x = runwayScale(120)
    const linear = runwayScale(120, { linear: true })
    expect(x(7)).toBeGreaterThan(linear(7))
  })

  it('pins both ends regardless of scale', () => {
    const x = runwayScale(120)
    expect(x(0)).toBeCloseTo(2)
    expect(x(120)).toBeCloseTo(96)
    // Beyond the horizon and before today both clamp.
    expect(x(500)).toBeCloseTo(96)
    expect(x(-9)).toBeCloseTo(2)
  })

  it('survives a book that all expires today', () => {
    const x = runwayScale(0)
    expect(Number.isFinite(x(0))).toBe(true)
  })
})

describe('runwayTicks', () => {
  it('drops ticks beyond the horizon and never repeats one', () => {
    expect(runwayTicks(30)).toEqual([0, 7, 30])
    expect(runwayTicks(400)).toEqual([0, 7, 30, 60, 90, 400])
  })
})

describe('strikeMeter', () => {
  it('puts the strike dead centre and the profitable side under the right half for a call', () => {
    const meter = strikeMeter(contractView(call({ underlying_price: 100 })))
    expect(meter.spot).toBeCloseTo(50)
    expect(meter.profitableSide).toEqual({ left: '50%', right: 0 })
  })

  it('flips the profitable side for a put', () => {
    expect(strikeMeter(contractView(put())).profitableSide).toEqual({ left: 0, right: '50%' })
  })

  it('clamps rather than rescaling beyond the fixed span', () => {
    const meter = strikeMeter(contractView(call({ underlying_price: 400 })))
    expect(meter.spot).toBe(100)
  })

  it('is null without an underlying price', () => {
    expect(strikeMeter(contractView(call({ underlying_price: null })))).toBeNull()
  })
})

describe('workspaceCohorts', () => {
  const views = [
    contractView(call({ id: 'a', expiry: '2026-09-18', dte: 12, est_value: 100, pnl: 10 })),
    contractView(call({ id: 'b', expiry: '2026-09-18', dte: 12, est_value: 900, pnl: -50 })),
    contractView(put({ id: 'c', expiry: '2026-10-16', dte: 40, est_value: 400, pnl: 300 })),
  ]

  it('filters by type', () => {
    expect(workspaceCohorts(views, { filter: 'Puts' }).count).toBe(1)
    expect(workspaceCohorts(views, { filter: 'Calls' }).count).toBe(2)
    expect(workspaceCohorts(views, { filter: 'All' }).count).toBe(3)
  })

  it('keeps expiry cohorts intact whatever the sort', () => {
    const byValue = workspaceCohorts(views, { sort: 'Value' })
    expect(byValue.cohorts).toHaveLength(2)
    // The 900 contract pulls its whole expiry to the front, and stays grouped
    // with the 100 contract that shares its date.
    expect(byValue.cohorts[0].expiry).toBe('2026-09-18')
    expect(byValue.cohorts[0].rows.map((row) => row.id)).toEqual(['b', 'a'])
  })

  it('orders cohorts by date when sorting by soonest', () => {
    const soonest = workspaceCohorts(views, { sort: 'Soonest' })
    expect(soonest.cohorts.map((cohort) => cohort.expiry)).toEqual(['2026-09-18', '2026-10-16'])
  })

  it('orders cohorts by their own P/L when sorting by P/L', () => {
    const byPnl = workspaceCohorts(views, { sort: 'P/L' })
    // 2026-10-16 nets +300; 2026-09-18 nets -40.
    expect(byPnl.cohorts[0].expiry).toBe('2026-10-16')
    expect(byPnl.cohorts[0].pnl).toBe(300)
  })

  it('returns no cohorts when the filter matches nothing', () => {
    const empty = workspaceCohorts([contractView(call())], { filter: 'Puts' })
    expect(empty.cohorts).toHaveLength(0)
    expect(empty.count).toBe(0)
  })
})

describe('attentionReasons', () => {
  const format = {
    formatMoney: (value) => `$${Number(value).toFixed(2)}`,
    formatDate: () => 'Sep 18, 2026',
  }
  const texts = (view) => attentionReasons(view, format).map((reason) => reason.text)

  it('states time remaining as a calendar fact, never a score', () => {
    const soon = texts(contractView(call({ dte: 2 })))
    expect(soon[0]).toBe('Expires in 2 days — on Sep 18, 2026.')
    expect(soon.join(' ')).not.toMatch(/risk|urgen|probab|should|recommend/i)
  })

  it('uses the singular for one day and names an expired contract', () => {
    expect(texts(contractView(call({ dte: 1 })))[0]).toContain('Expires in 1 day —')
    expect(texts(contractView(call({ dte: -3 })))[0]).toContain('Expired on')
  })

  it('describes each type in its own direction', () => {
    expect(texts(contractView(call({ underlying_price: 110 })))[0]).toContain('above the $100.00 strike')
    expect(texts(contractView(put({ underlying_price: 90 })))[0]).toContain('below the $100.00 strike')
  })

  it('stops at the missing quote rather than inventing moneyness', () => {
    const reasons = texts(contractView(call({ underlying_price: null, est_value: null })))
    expect(reasons).toHaveLength(1)
    expect(reasons[0]).toContain('No underlying quote')
  })

  it('reports breakeven only once it is genuinely passed', () => {
    expect(texts(contractView(call({ underlying_price: 110 }))).join(' ')).toContain('Past breakeven')
    expect(texts(contractView(call({ underlying_price: 101 }))).join(' ')).not.toContain('Past breakeven')
  })

  it('names a large move on the premium in both directions', () => {
    expect(texts(contractView(call({ pnl_percent: -60 }))).join(' ')).toContain('down 60%')
    expect(texts(contractView(call({ pnl_percent: 80 }))).join(' ')).toContain('up 80%')
  })
})
