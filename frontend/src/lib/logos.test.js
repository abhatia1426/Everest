import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  clearLogoCache,
  domainFor,
  logoDiagnostics,
  logoResolution,
  logoSources,
  recordFailure,
  recordSuccess,
} from './logos'

/**
 * Guards on the logo resolver.
 *
 * The resolver used to depend on a hand-written ticker->domain map sized to the
 * old ~200-company dataset, so the 5,401-company universe resolved almost
 * entirely to monograms. It now addresses Logo.dev BY TICKER, which is what
 * makes coverage scale automatically — these tests exist to stop anyone
 * reintroducing a per-company map, and to keep the safety properties
 * (no token leakage, no Clearbit, clean monogram fallback) nailed down.
 */

const urlOf = (ticker, opts) => logoSources(ticker, opts)[0] || null

beforeEach(() => {
  clearLogoCache()
})

afterEach(() => {
  clearLogoCache()
})

describe('resolution strategy', () => {
  it('resolves a standard US company via the ticker endpoint', () => {
    expect(urlOf('AAPL')).toContain('/ticker/AAPL')
  })

  it('resolves a newly added IPO with no per-company configuration', () => {
    // Rubrik was absent from the old dataset AND from the old domain map.
    expect(urlOf('RBRK')).toContain('/ticker/RBRK')
  })

  it('resolves an international company by ticker, not by guessing a domain', () => {
    const url = urlOf('TSM')
    expect(url).toContain('/ticker/TSM')
    // The failure mode this guards: ticker.com style invention.
    expect(url).not.toContain('tsm.com')
  })

  it('resolves an ADR by ticker', () => {
    const url = urlOf('BABA')
    expect(url).toContain('/ticker/BABA')
    expect(url).not.toContain('baba.com')
  })

  it('uses a verified domain for a company with an unusual mapping', () => {
    // Logo.dev has no ticker record for JMKE; jerseymikes.com does resolve.
    expect(urlOf('JMKE')).toContain('jerseymikes.com')
    expect(domainFor('JMKE')).toBe('jerseymikes.com')
  })

  it('lets an explicit caller-supplied domain win', () => {
    expect(urlOf('AAPL', { domain: 'example.com' })).toContain('example.com')
  })

  it('still produces a candidate for an unknown ticker', () => {
    // We cannot know a symbol is unknown without asking; Logo.dev answers 404
    // and the image onError path falls to the monogram.
    expect(urlOf('ZZZZ')).toContain('/ticker/ZZZZ')
  })

  it('emits exactly one candidate per symbol', () => {
    // A second, known-failing candidate is a wasted round trip before the
    // monogram — the exact cost removing Clearbit was meant to eliminate.
    expect(logoSources('AAPL')).toHaveLength(1)
    expect(logoSources('JMKE')).toHaveLength(1)
  })

  it('does not maintain a large per-company domain map', () => {
    const report = logoDiagnostics()
    expect(report.domainExceptions).toBeLessThan(20)
  })
})

describe('correctness safeguards', () => {
  it('requests a 404 instead of a generated placeholder', () => {
    // Without this Logo.dev answers unknown symbols with 200 + a generic
    // letter tile, which would render as a plausible-looking wrong logo.
    expect(urlOf('AAPL')).toContain('fallback=404')
    expect(urlOf('JMKE')).toContain('fallback=404')
  })

  it('never references Clearbit', () => {
    for (const t of ['AAPL', 'JMKE', 'TSM', 'ZZZZ']) {
      expect(urlOf(t) || '').not.toContain('clearbit')
    }
  })
})

describe('failure and caching', () => {
  it('returns no candidates once a symbol is known to have failed', () => {
    expect(logoSources('NOPE')).toHaveLength(1)
    recordFailure('NOPE')
    expect(logoSources('NOPE')).toEqual([])
  })

  it('serves a recorded success straight from cache', () => {
    recordSuccess('AAPL', 'https://img.logo.dev/cached.png')
    expect(logoSources('AAPL')).toEqual(['https://img.logo.dev/cached.png'])
  })

  it('is case-insensitive about the symbol', () => {
    recordFailure('aapl')
    expect(logoSources('AAPL')).toEqual([])
  })
})

describe('token handling', () => {
  it('reports token status without revealing the token', () => {
    const report = logoDiagnostics()
    const serialised = JSON.stringify(report)

    expect(report).toHaveProperty('tokenConfigured')
    expect(report).toHaveProperty('tokenLooksValid')
    expect(serialised).not.toMatch(/pk_[A-Za-z0-9]/)
    expect(serialised).not.toContain('token=')
  })

  it('per-symbol diagnostics report the decision, never the URL', () => {
    const report = logoResolution('AAPL')
    expect(report.source).toBe('logo.dev/ticker')
    expect(JSON.stringify(report)).not.toContain('token')

    expect(logoResolution('JMKE')).toMatchObject({
      source: 'logo.dev/domain',
      domain: 'jerseymikes.com',
    })
  })

  it('falls back to the monogram when no token is configured', async () => {
    vi.resetModules()
    vi.stubEnv('VITE_LOGO_TOKEN', '')

    const fresh = await import('./logos?no-token')
    expect(fresh.logoSources('AAPL')).toEqual([])
    expect(fresh.logoDiagnostics().tokenConfigured).toBe(false)
    expect(fresh.logoDiagnostics().fix).toContain('frontend/.env')

    vi.unstubAllEnvs()
    vi.resetModules()
  })
})
