import { describe, expect, it } from 'vitest'

import { toNets, toSessions } from './DailyNetPanel'

/**
 * The whole claim this module makes is "each dot is one session". These tests
 * exist because the underlying series is HOURLY inside a month — differencing
 * it raw would produce intraday steps under a session label, which is the
 * exact class of quiet mislabelling the rest of the Dashboard is built to
 * avoid.
 */
describe('toSessions', () => {
  it('collapses an intraday series to one closing value per calendar date', () => {
    const sessions = toSessions([
      { time: '2026-09-01T14:00:00Z', value: 100 },
      { time: '2026-09-01T18:00:00Z', value: 104 },
      { time: '2026-09-01T20:00:00Z', value: 102 },
      { time: '2026-09-02T14:00:00Z', value: 110 },
      { time: '2026-09-02T20:00:00Z', value: 108 },
    ])

    expect(sessions).toHaveLength(2)
    // The LAST observation of each date, not the first and not an average.
    expect(sessions.map((s) => s.value)).toEqual([102, 108])
  })

  it('drops unparseable timestamps and non-numeric values rather than coercing them', () => {
    const sessions = toSessions([
      { time: 'not-a-date', value: 100 },
      { time: '2026-09-01T20:00:00Z', value: null },
      { time: '2026-09-02T20:00:00Z', value: 108 },
    ])

    expect(sessions).toHaveLength(1)
    expect(sessions[0].value).toBe(108)
  })

  it('returns sessions in ascending time order', () => {
    const sessions = toSessions([
      { time: '2026-09-03T20:00:00Z', value: 30 },
      { time: '2026-09-01T20:00:00Z', value: 10 },
      { time: '2026-09-02T20:00:00Z', value: 20 },
    ])

    expect(sessions.map((s) => s.value)).toEqual([10, 20, 30])
  })
})

describe('toNets', () => {
  it('produces one fewer net than sessions', () => {
    const nets = toNets(toSessions([
      { time: '2026-09-01T20:00:00Z', value: 100 },
      { time: '2026-09-02T20:00:00Z', value: 110 },
      { time: '2026-09-03T20:00:00Z', value: 105 },
    ]))

    expect(nets).toHaveLength(2)
    expect(nets.map((n) => n.delta)).toEqual([10, -5])
  })

  it('yields nothing from a single session — one close is not a change', () => {
    expect(toNets(toSessions([{ time: '2026-09-01T20:00:00Z', value: 100 }]))).toEqual([])
  })

  it('yields nothing from an empty series', () => {
    expect(toNets(toSessions([]))).toEqual([])
  })
})
