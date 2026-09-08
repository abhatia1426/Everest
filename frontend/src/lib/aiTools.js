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
 *
 * TWO NAMES PER TOOL, ON PURPOSE.
 *
 * `registryName` is the internal name — Portfolio Analyst, Risk Analyzer — and
 * it stays, because it is what the backend route, the stored run history and
 * the report components are keyed to. `name` is what a person reads: "What
 * moved my portfolio". Leading with the registry name made the workspace a
 * list of instruments to configure rather than a list of questions you could
 * ask, and "Risk Analyzer" in particular implied a formal risk model — VaR, a
 * score — that this tool does not compute and must not suggest.
 *
 * `uses` states what the tool actually reads, and is shown to the user rather
 * than kept as a comment: it is the honest answer to "what did it look at".
 *
 * `uses` AND `prompts` ARE A CONTRACT WITH `routers/ai.py`, NOT A DESCRIPTION
 * OF AMBITION. Each string was checked against the payload its endpoint
 * actually builds. If a prompt asks something the payload cannot support, the
 * prompt is wrong — not the backend — and it comes out. Two were removed on
 * exactly that basis:
 *
 *   · "Which carries more risk?" implied a risk model. `/ai/compare` sends
 *     beta and a 52-week range, which measure VARIABILITY, so the question is
 *     now asked in those terms.
 *   · "Which watchlist names are moving unusually?" implied the screener sees
 *     session history. It does not — `/ai/screener` sends quotes only. That
 *     question IS answered on this route, deterministically, by the "Unusual
 *     watchlist move" item in Today's Brief, which does have the closes.
 *
 * Valuation prompts stay: `/ai/compare` and `/ai/screener` genuinely receive
 * market cap, P/E (and forward P/E and EPS for compare) from the quote's
 * reference fields.
 *
 * `investigate` marks the tools the AI Insights workspace offers. Thesis and
 * Earnings are registry members and remain fully functional, but they are NOT
 * offered there: a bull/bear thesis carries a 1-10 confidence score and an
 * earnings brief carries analyst expectations and catalysts, and that route's
 * contract is that it never shows a confidence score, a forecast or an analyst
 * opinion. Offering them would contradict the page around them.
 */
export const AI_TOOLS = [
  {
    id: 'analyst',
    name: 'What moved my portfolio',
    registryName: 'Portfolio Analyst',
    icon: BrainCircuit,
    blurb: 'Plain-English breakdown of what you hold and how today landed across it.',
    uses: 'Positions, weights, unrealised P&L and today’s change per holding',
    investigate: true,
    needsPortfolio: true,
    fields: [],
    prompts: ['What drove my portfolio today?', 'Which positions contributed most?'],
    run: ({ mode }) => api.aiAnalyst(mode),
  },
  {
    id: 'risk',
    name: 'Concentration & variability',
    registryName: 'Risk Analyzer',
    icon: ShieldAlert,
    blurb: 'Where your weight sits, and how variable the things you hold have been.',
    uses:
      'Position weights, sector weights, beta and 52-week range. No scoring or forecasting.',
    investigate: true,
    needsPortfolio: true,
    fields: [],
    prompts: ['Where am I most concentrated?'],
    run: ({ mode }) => api.aiRisk(mode),
  },
  {
    id: 'thesis',
    name: 'Trade Thesis',
    registryName: 'Trade Thesis',
    investigate: false,
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
    name: 'Compare side by side',
    registryName: 'Stock Comparison',
    icon: GitCompare,
    blurb: 'Two to four symbols across valuation, performance, fundamentals and variability.',
    uses: 'Quotes, valuation multiples, beta and 52-week range for two to four symbols',
    investigate: true,
    fields: [
      { key: 'tickers', kind: 'tickers', label: 'Tickers', required: true, min: 2, max: 4 },
    ],
    prompts: ['Compare these on valuation', 'Which has been more volatile?'],
    run: ({ values }) => api.aiCompare(values.tickers || []),
  },
  {
    id: 'earnings',
    name: 'Earnings Prep',
    registryName: 'Earnings Prep',
    investigate: false,
    icon: CalendarClock,
    blurb: 'Expectations, last-quarter recap, metrics to watch and catalysts.',
    fields: [{ key: 'ticker', kind: 'ticker', label: 'Ticker', required: true }],
    prompts: ['What should I watch this quarter?', 'What questions should I be asking?'],
    run: ({ values }) => api.aiEarnings(values.ticker),
  },
  {
    id: 'screener',
    name: 'Rank my watchlist',
    registryName: 'Watchlist Screener',
    icon: ListFilter,
    blurb: 'Rank your watchlist against a growth, value, momentum or dividend style.',
    uses: 'Watchlist quotes, market cap, P/E and 52-week range',
    investigate: true,
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
    prompts: ['Which fits a value style?', 'Where does each sit in its 52-week range?'],
    run: ({ values, watchlistTickers }) =>
      api.aiScreener({ tickers: watchlistTickers, style: values.style || 'growth' }),
  },
]

export function getTool(id) {
  return AI_TOOLS.find((tool) => tool.id === id)
}

/** The tools the AI Insights workspace offers. See the note on `investigate`. */
export const INVESTIGATE_TOOLS = AI_TOOLS.filter((tool) => tool.investigate)

/**
 * Prompts Everest can ANSWER RIGHT NOW, given what this user actually has.
 *
 * A suggestion the product cannot honour is worse than no suggestion: it
 * teaches the user to expect an answer, then fails. So a prompt whose tool is
 * blocked — no holdings, no watchlist — is dropped rather than shown disabled,
 * and nothing here proposes a question about news, causes or forecasts, which
 * Everest has no data for at any time.
 */
export function answerablePrompts({ hasPortfolio, hasWatchlist }) {
  const out = []
  for (const tool of INVESTIGATE_TOOLS) {
    if (tool.needsPortfolio && !hasPortfolio) continue
    if (tool.needsWatchlist && !hasWatchlist) continue
    for (const prompt of tool.prompts) out.push({ prompt, tool })
  }
  return out
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
