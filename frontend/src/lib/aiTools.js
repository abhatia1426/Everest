import { BrainCircuit, CalendarClock, GitCompare, ListFilter, Scale, ShieldAlert } from 'lucide-react'

import { api } from './api'

/**
 * The AI tool registry.
 *
 * Adding a tool means adding one entry here — an id, some metadata, a field
 * spec and a `run` function. The workspace renders the selector, the form, the
 * prompts and the history generically from this list, so no new screen, route
 * or layout work is needed. Report rendering is the only per-tool component,
 * and it is looked up by id in `components/ai/Reports.jsx`.
 *
 * Field kinds: 'ticker' (autocomplete), 'tickers' (multi), 'text', 'choice'.
 */
export const AI_TOOLS = [
  {
    id: 'analyst',
    name: 'Portfolio Analyst',
    icon: BrainCircuit,
    blurb: 'Plain-English breakdown of what you hold and why it behaves as it does.',
    needsPortfolio: true,
    fields: [],
    prompts: ['Explain my portfolio', 'Where am I concentrated?', 'What is driving my returns?'],
    run: ({ mode }) => api.aiAnalyst(mode),
  },
  {
    id: 'risk',
    name: 'Risk Analyzer',
    icon: ShieldAlert,
    blurb: 'Concentration, sector exposure, volatility and diversification gaps.',
    needsPortfolio: true,
    fields: [],
    prompts: ['What are my biggest risks?', 'How diversified am I?', 'Am I over-exposed anywhere?'],
    run: ({ mode }) => api.aiRisk(mode),
  },
  {
    id: 'thesis',
    name: 'Trade Thesis',
    icon: Scale,
    blurb: 'Structured bull and bear case with a confidence score for one ticker.',
    fields: [
      { key: 'ticker', kind: 'ticker', label: 'Ticker', required: true },
      {
        key: 'direction',
        kind: 'choice',
        label: 'Direction',
        options: [
          { value: 'long', label: 'Long' },
          { value: 'short', label: 'Short' },
        ],
        initial: 'long',
      },
      { key: 'price_target', kind: 'number', label: 'Target', placeholder: 'Optional' },
    ],
    prompts: ['Create a bull/bear thesis', 'What factors should I research?'],
    run: ({ values }) =>
      api.aiThesis({
        ticker: values.ticker,
        direction: values.direction || 'long',
        price_target: values.price_target ? Number(values.price_target) : null,
        include_news: true,
      }),
  },
  {
    id: 'compare',
    name: 'Stock Comparison',
    icon: GitCompare,
    blurb: 'Two to four symbols across valuation, performance, fundamentals and risk.',
    fields: [
      { key: 'tickers', kind: 'tickers', label: 'Tickers', required: true, min: 2, max: 4 },
    ],
    prompts: ['Compare these on valuation', 'Which carries more risk?'],
    run: ({ values }) => api.aiCompare(values.tickers || []),
  },
  {
    id: 'earnings',
    name: 'Earnings Prep',
    icon: CalendarClock,
    blurb: 'Expectations, last-quarter recap, metrics to watch and catalysts.',
    fields: [{ key: 'ticker', kind: 'ticker', label: 'Ticker', required: true }],
    prompts: ['What should I watch this quarter?', 'What questions should I be asking?'],
    run: ({ values }) => api.aiEarnings(values.ticker),
  },
  {
    id: 'screener',
    name: 'Watchlist Screener',
    icon: ListFilter,
    blurb: 'Rank your watchlist against a growth, value, momentum or dividend style.',
    needsWatchlist: true,
    fields: [
      {
        key: 'style',
        kind: 'choice',
        label: 'Style',
        options: [
          { value: 'growth', label: 'Growth' },
          { value: 'value', label: 'Value' },
          { value: 'momentum', label: 'Momentum' },
          { value: 'dividend', label: 'Dividend' },
        ],
        initial: 'growth',
      },
    ],
    prompts: ['Rank my watchlist', 'Which fits a value style?'],
    run: ({ values, watchlistTickers }) =>
      api.aiScreener({ tickers: watchlistTickers, style: values.style || 'growth' }),
  },
]

export function getTool(id) {
  return AI_TOOLS.find((tool) => tool.id === id)
}

/** Initial form values for a tool, derived from its field spec. */
export function initialValues(tool) {
  const values = {}
  for (const field of tool?.fields || []) {
    values[field.key] = field.initial ?? (field.kind === 'tickers' ? [] : '')
  }
  return values
}

/** Which required fields are still missing — drives the disabled state. */
export function missingFields(tool, values) {
  return (tool?.fields || [])
    .filter((field) => {
      if (!field.required) return false
      const value = values[field.key]
      if (field.kind === 'tickers') return (value || []).length < (field.min || 1)
      return !String(value || '').trim()
    })
    .map((field) => field.label)
}
