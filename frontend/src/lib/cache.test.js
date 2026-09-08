import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { QUOTE_POLL_MS, TTL } from './cache'

/*
 * Settings describes the quote cadence and freshness windows to the user, and
 * reads both from this module so the page cannot state a policy the app does
 * not run.
 *
 * The quote-bearing routes still pass `pollMs: 30000` as a literal. Those
 * routes are frozen, so rather than edit them this test pins the two together:
 * if a call site's interval changes, Settings would start describing the wrong
 * cadence, and this fails first.
 */
const POLLING_ROUTES = [
  'src/pages/app/Dashboard.jsx',
  'src/pages/app/Portfolio.jsx',
  'src/pages/app/TickerDetail.jsx',
  'src/hooks/useWatchlist.jsx',
  'src/components/MarketRail.jsx',
]

describe('quote cadence', () => {
  it('matches every polling call site', () => {
    for (const file of POLLING_ROUTES) {
      const source = readFileSync(join(globalThis.process.cwd(), file), 'utf8')
      const intervals = [...source.matchAll(/pollMs\s*[:=]\s*(\d+)/g)].map((m) => Number(m[1]))
      expect(intervals.length, `${file} no longer polls`).toBeGreaterThan(0)
      for (const ms of intervals) {
        expect(ms, `${file} polls at ${ms}ms but Settings says ${QUOTE_POLL_MS}ms`).toBe(
          QUOTE_POLL_MS,
        )
      }
    }
  })

  it('keeps the reuse window inside the refresh window', () => {
    expect(TTL.QUOTE.fresh).toBeLessThan(TTL.QUOTE.stale)
    // Settings renders both as whole seconds; a sub-second value would round
    // to a figure the app does not actually use.
    expect(TTL.QUOTE.fresh % 1000).toBe(0)
    expect(TTL.QUOTE.stale % 1000).toBe(0)
    expect(QUOTE_POLL_MS % 1000).toBe(0)
  })
})
