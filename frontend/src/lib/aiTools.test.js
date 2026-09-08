import { describe, expect, it } from 'vitest'

import { AI_TOOLS, INVESTIGATE_TOOLS, answerablePrompts, getTool } from './aiTools'

/**
 * The prompt/payload contract.
 *
 * These guard the truthfulness rule that every visible prompt must be
 * answerable by the tool it runs, from the data `routers/ai.py` actually
 * sends. The payload fields below are transcribed from those endpoints; if the
 * backend stops sending one, the matching prompt has to go too.
 */
const SENT_BY_ENDPOINT = {
  // /ai/analyst
  analyst: ['ticker', 'company', 'sector', 'weight_percent', 'unrealized_pnl', 'pnl_percent', 'day_change_percent'],
  // /ai/risk
  risk: ['ticker', 'sector', 'weight_percent', 'beta', 'pe_ratio', 'fifty_two_week_high', 'fifty_two_week_low', 'price_stale'],
  // /ai/screener — quotes only. NO session history.
  screener: ['ticker', 'company', 'sector', 'price', 'change_percent', 'market_cap', 'pe_ratio', 'fifty_two_week_high', 'fifty_two_week_low'],
  // /ai/compare
  compare: ['ticker', 'company', 'sector', 'industry', 'price', 'change_percent', 'market_cap', 'pe_ratio', 'forward_pe', 'eps', 'beta', 'dividend_yield', 'fifty_two_week_high', 'fifty_two_week_low'],
}

describe('the AI Insights workspace offers only what it can answer', () => {
  it('exposes exactly the four investigation tools', () => {
    expect(INVESTIGATE_TOOLS.map((t) => t.id)).toEqual(['analyst', 'risk', 'compare', 'screener'])
  })

  it('keeps Thesis and Earnings out of the workspace', () => {
    // Both carry a confidence score / analyst expectations, which this route
    // does not show. They stay in the registry and keep working elsewhere.
    for (const id of ['thesis', 'earnings']) {
      expect(getTool(id)).toBeTruthy()
      expect(getTool(id).investigate).toBe(false)
    }
  })

  it('gives every workspace tool a consumer-facing name and its registry name', () => {
    for (const tool of INVESTIGATE_TOOLS) {
      expect(tool.registryName).toBeTruthy()
      expect(tool.uses).toBeTruthy()
      expect(tool.name).not.toBe(tool.registryName)
    }
  })
})

describe('no formal-risk implications', () => {
  const visible = INVESTIGATE_TOOLS.flatMap((t) => [t.name, t.blurb, t.uses, ...t.prompts])
    .join(' ')
    .toLowerCase()

  it.each([
    'carries more risk',
    'risk score',
    'risk level',
    'risk rating',
    'confidence',
    'probability',
    'should buy',
    'should sell',
    'recommend',
  ])('never says %s', (phrase) => {
    // `variability` is allowed and deliberate; a formal risk grade is not.
    expect(visible).not.toContain(phrase)
  })

  it('mentions forecasting only to disclaim it', () => {
    // A blunt substring ban would fail on "No scoring or forecasting", which is
    // the disclaimer we WANT. So every occurrence must be a negated one.
    const occurrences = visible.match(/[^.]*forecast[^.]*/g) || []
    for (const sentence of occurrences) expect(sentence).toMatch(/\bno\b|\bnot\b|never/)
  })

  it('keeps the approved concentration-and-variability framing and its scope', () => {
    const risk = getTool('risk')
    expect(risk.name).toBe('Concentration & variability')
    expect(risk.uses).toContain('No scoring or forecasting')
  })
})

describe('prompts are answerable from the real payloads', () => {
  it('does not ask the screener about unusual moves — it has no session history', () => {
    const screener = getTool('screener')
    expect(SENT_BY_ENDPOINT.screener).not.toContain('sessions')
    expect(screener.prompts.join(' ').toLowerCase()).not.toContain('unusual')
    expect(screener.uses.toLowerCase()).not.toContain('daily closes')
  })

  it('keeps valuation prompts, because valuation fields really are sent', () => {
    for (const field of ['market_cap', 'pe_ratio', 'forward_pe', 'eps']) {
      expect(SENT_BY_ENDPOINT.compare).toContain(field)
    }
    expect(getTool('compare').prompts).toContain('Compare these on valuation')
  })

  it('asks compare about volatility, which beta and the 52-week range support', () => {
    expect(SENT_BY_ENDPOINT.compare).toContain('beta')
    expect(getTool('compare').prompts).toContain('Which has been more volatile?')
  })

  it('never claims a tool reads data its endpoint does not send', () => {
    // The screener and compare tools receive no price history at all.
    for (const id of ['screener', 'compare']) {
      expect(getTool(id).uses.toLowerCase()).not.toMatch(/price history|session/)
    }
  })
})

describe('answerablePrompts', () => {
  it('hides portfolio prompts until there is a holding', () => {
    const out = answerablePrompts({ hasPortfolio: false, hasWatchlist: true })
    expect(out.every((p) => !p.tool.needsPortfolio)).toBe(true)
  })

  it('hides watchlist prompts until there is a watchlist', () => {
    const out = answerablePrompts({ hasPortfolio: true, hasWatchlist: false })
    expect(out.every((p) => !p.tool.needsWatchlist)).toBe(true)
  })

  it('offers every workspace prompt once everything is available', () => {
    const out = answerablePrompts({ hasPortfolio: true, hasWatchlist: true })
    expect(out).toHaveLength(INVESTIGATE_TOOLS.reduce((n, t) => n + t.prompts.length, 0))
  })

  it('draws only from tools the workspace actually offers', () => {
    const ids = new Set(answerablePrompts({ hasPortfolio: true, hasWatchlist: true }).map((p) => p.tool.id))
    expect([...ids].every((id) => getTool(id).investigate)).toBe(true)
  })
})

describe('registry integrity', () => {
  it('keeps a runnable entry for every tool', () => {
    for (const tool of AI_TOOLS) expect(typeof tool.run).toBe('function')
  })
})
