import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { HistoryUnavailable, withinRange } from './PerformanceChart'

/**
 * The chart must plot the window it names.
 *
 * A real `period=1m` response contained 746 hourly candles spanning five
 * months. Plotted raw under a "1M" label, the panel reported the five-month
 * return as "+77.88% over 1M" — the headline figure on the dashboard was not
 * the number it claimed to be.
 */
const DAY = 24 * 60 * 60 * 1000

function seriesEndingNow(days, stepMs = DAY) {
  const end = Date.parse('2026-08-28T15:30:00Z')
  const points = []
  for (let t = end - days * DAY; t <= end; t += stepMs) {
    points.push({ time: new Date(t).toISOString(), value: 100 })
  }
  return points
}

describe('withinRange', () => {
  it('clips a five-month response down to the requested month', () => {
    const points = seriesEndingNow(154)

    const clipped = withinRange(points, '1M')

    expect(points.length).toBeGreaterThan(150)
    expect(clipped.length).toBeLessThanOrEqual(32)
    // The most recent point must survive — it is the "current value" end of
    // the line and the basis of the stated return.
    expect(clipped[clipped.length - 1]).toEqual(points[points.length - 1])
  })

  it('measures the window from the newest point, not from wall-clock now', () => {
    // A stale series (provider lag, cached response) must still yield a full
    // window rather than collapsing to nothing because "now" has moved on.
    const points = seriesEndingNow(60)

    const clipped = withinRange(points, '1W')

    expect(clipped.length).toBeGreaterThan(2)
    expect(clipped[clipped.length - 1]).toEqual(points[points.length - 1])
  })

  it('leaves a series alone when it is already inside the window', () => {
    const points = seriesEndingNow(5)
    expect(withinRange(points, '1M')).toEqual(points)
  })

  it('never clips down to an unplottable stub', () => {
    // Two daily points and a 1W window would survive; but a sparse series
    // whose points all predate the cutoff must fall back to the full set
    // rather than render a meaningless two-point slope.
    const points = [
      { time: '2026-01-01T00:00:00Z', value: 100 },
      { time: '2026-01-02T00:00:00Z', value: 110 },
      { time: '2026-08-28T00:00:00Z', value: 120 },
    ]

    const clipped = withinRange(points, '1W')

    expect(clipped).toEqual(points)
  })

  it('does not clip ALL, which has no window', () => {
    const points = seriesEndingNow(900)
    expect(withinRange(points, 'ALL')).toEqual(points)
  })

  it('tolerates empty and unparseable input', () => {
    expect(withinRange([], '1M')).toEqual([])

    const bad = [{ time: 'not-a-date', value: 1 }, { time: 'also-bad', value: 2 }]
    expect(withinRange(bad, '1M')).toEqual(bad)
  })
})

/**
 * The empty state must distinguish "you have no history" from "we have history
 * for some of your holdings and refused to plot a partial book". Those are
 * different facts and only one of them is the user's fault.
 */
describe('HistoryUnavailable', () => {
  it('names the holdings the provider has no history for', () => {
    render(<HistoryUnavailable missing={['SNDK', 'SOFI', 'SPCX', 'TSLA']} holdingsCount={9} />)

    expect(screen.getByText('History withheld')).toBeInTheDocument()
    expect(screen.getByText(/SNDK, SOFI, SPCX, TSLA/)).toBeInTheDocument()
    expect(screen.getByText(/4 of your 9 holdings/)).toBeInTheDocument()
    // The reason we withheld, stated rather than implied.
    expect(screen.getByText(/understate your portfolio/i)).toBeInTheDocument()
  })

  it('truncates a long list instead of printing a wall of symbols', () => {
    const missing = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
    render(<HistoryUnavailable missing={missing} holdingsCount={10} />)

    expect(screen.getByText(/\+2 more/)).toBeInTheDocument()
  })

  it('falls back to the neutral message when nothing is missing', () => {
    // An empty book has no missing symbols — blaming the provider there would
    // be inventing a cause.
    render(<HistoryUnavailable missing={[]} holdingsCount={0} />)

    expect(screen.getByText('Not enough history yet')).toBeInTheDocument()
    expect(screen.queryByText(/withheld/i)).not.toBeInTheDocument()
  })
})
