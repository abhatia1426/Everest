import { describe, expect, it } from 'vitest'

import { EQUITIES } from './equities'
import { getEquity, searchEquities } from './equitySource'

/**
 * Guards on the GENERATED equity universe (`npm run update-equities`).
 *
 * The dataset used to be hand-maintained and silently went stale — ordinary
 * large listings like SoFi, Reddit, Arm and CoreWeave were simply absent.
 * These tests fail loudly if a regeneration drops a household name, admits a
 * non-equity instrument, or reintroduces duplicates.
 */

const findTicker = (query, ticker) =>
  searchEquities(query, { limit: 8 }).some((r) => r.equity.ticker === ticker)

describe('equity universe: shape and quality', () => {
  it('is substantially larger than the old hand-curated list', () => {
    expect(EQUITIES.length).toBeGreaterThan(4000)
  })

  it('has no duplicate tickers', () => {
    const seen = new Set()
    const dupes = []
    for (const e of EQUITIES) {
      if (seen.has(e.ticker)) dupes.push(e.ticker)
      seen.add(e.ticker)
    }
    expect(dupes).toEqual([])
  })

  it('has well-formed tickers and names', () => {
    const badTicker = EQUITIES.filter((e) => !/^[A-Z][A-Z.]{0,7}$/.test(e.ticker))
    const badName = EQUITIES.filter((e) => !e.name || e.name.length < 2)
    expect(badTicker).toEqual([])
    expect(badName).toEqual([])
  })

  it('carries an exchange for every record', () => {
    expect(EQUITIES.filter((e) => !e.exchange)).toEqual([])
  })

  it('excludes warrants, units, rights and preferred shares', () => {
    const junk = EQUITIES.filter((e) =>
      /\bwarrant|\bpreferred\b|depositary share|\bunits?\b|\brights?\b/i.test(e.name),
    )
    expect(junk).toEqual([])
  })
})

describe('equity universe: coverage', () => {
  // Long-standing listings that must never disappear.
  it.each([
    ['AAPL', 'Apple'],
    ['MSFT', 'Microsoft'],
    ['NVDA', 'NVIDIA'],
    ['TSLA', 'Tesla'],
  ])('keeps %s', (ticker, namePart) => {
    const hit = getEquity(ticker)
    expect(hit).toBeTruthy()
    expect(hit.name.toLowerCase()).toContain(namePart.toLowerCase())
  })

  /*
   * Listings that were MISSING from the hand-curated dataset. Each was
   * verified against the exchange listing files and cross-checked against the
   * SEC registrant list before being relied on here.
   */
  it.each([
    ['SOFI', 'SoFi'],
    ['SNDK', 'Sandisk'],
    ['RDDT', 'Reddit'],
    ['ARM', 'Arm'],
    ['CRWV', 'CoreWeave'],
    ['KVUE', 'Kenvue'],
    ['GEV', 'GE Vernova'],
    ['SOLV', 'Solventum'],
    ['VLTO', 'Veralto'],
  ])('now includes %s', (ticker, namePart) => {
    const hit = getEquity(ticker)
    expect(hit, `${ticker} missing from dataset`).toBeTruthy()
    expect(hit.name.toLowerCase()).toContain(namePart.toLowerCase())
  })

  it('finds companies by name, not just by ticker', () => {
    expect(findTicker('SoFi', 'SOFI')).toBe(true)
    expect(findTicker('Microsoft', 'MSFT')).toBe(true)
    expect(findTicker('Reddit', 'RDDT')).toBe(true)
  })

  it('returns nothing for an empty query', () => {
    expect(searchEquities('')).toEqual([])
    expect(searchEquities('   ')).toEqual([])
  })

  it('ranks an exact ticker match first', () => {
    expect(searchEquities('AAPL')[0].equity.ticker).toBe('AAPL')
  })
})
