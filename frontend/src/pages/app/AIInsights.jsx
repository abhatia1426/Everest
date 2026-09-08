import { useCallback, useMemo, useState } from 'react'

import { AnalysisStage } from '../../components/ai/AnalysisStage'
import { AttributionBeam } from '../../components/ai/AttributionBeam'
import { Investigate } from '../../components/ai/Investigate'
import { RecentRuns } from '../../components/ai/RecentRuns'
import { TodaysBrief } from '../../components/ai/TodaysBrief'
import { Segmented } from '../../components/ui/Segmented'
import { TickerAutocomplete } from '../../components/search/TickerAutocomplete'
import { CompanyLogo } from '../../components/ui/CompanyLogo'
import { useToast } from '../../components/ui/Toast'
import { useApi } from '../../hooks/useApi'
import { useMode } from '../../hooks/useMode'
import { useSessionHistory } from '../../hooks/useSessionHistory'
import { useWatchlist } from '../../hooks/useWatchlist'
import { TTL } from '../../lib/cache'
import { INVESTIGATE_TOOLS, answerablePrompts, getTool, initialValues, missingFields } from '../../lib/aiTools'
import { api } from '../../lib/api'
import { buildBrief, groundingFor } from '../../lib/brief'
import { equityOrFallback } from '../../lib/equitySource'
import { fmtMoneyRounded } from '../../lib/format'
import { X } from 'lucide-react'

/**
 * AI Insights — a measured intelligence brief with an investigation workspace
 * attached, in that order of importance.
 *
 * THE PAGE IS TWO HALVES AND THEY ARE NOT PEERS.
 *
 * The attribution beam and Today's Brief are MEASURED: pure arithmetic over
 * the user's own positions, quotes, closes, watchlist and contracts, computed
 * in `lib/attribution.js` and `lib/brief.js`, which never touch the network or
 * the model. Investigate and Analysis are GENERATED: one request to a provider
 * that can be missing, throttled or broken.
 *
 * They are separate components over separate data on purpose. Every AI failure
 * state on this page degrades the right-hand column ONLY — the brief renders
 * identically whether a key is configured or not, because nothing in it was
 * ever produced by a model. That is the promise the header makes, and the
 * architecture is what keeps it true rather than a claim in a tooltip.
 */
const HISTORY_KEY = 'everest_ai_history'
const MAX_HISTORY = 20
const BENCHMARK = 'SPY'

function readHistory() {
  try {
    const parsed = JSON.parse(localStorage.getItem(HISTORY_KEY))
    return Array.isArray(parsed) ? parsed.slice(0, MAX_HISTORY) : []
  } catch {
    return []
  }
}

/** Module scope so the impure clock call is never in a component body. */
function makeHistoryEntry(tool, values, result) {
  const at = new Date().toISOString()
  return { key: `${tool.id}-${at}`, toolId: tool.id, toolName: tool.name, at, values, result }
}

function persistHistory(next) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next))
  } catch {
    /* history is a convenience; quota failures are not fatal */
  }
  return next
}

export default function AIInsights() {
  const { mode } = useMode()
  const { items: watchlistItems } = useWatchlist()
  const toast = useToast()

  /* ------------------------------------------------- measured inputs */

  const pnlFetcher = useCallback(() => api.pnl(mode), [mode])
  const { data: pnl, loading: pnlLoading } = useApi(pnlFetcher, [mode], {
    key: `pnl:${mode}`,
    ttl: TTL.QUOTE,
  })

  const optionsFetcher = useCallback(() => api.options({ mode }), [mode])
  const { data: optionsData } = useApi(optionsFetcher, [mode], {
    key: `options:${mode}`,
    ttl: TTL.QUOTE,
  })

  const positions = useMemo(() => pnl?.positions || [], [pnl])
  const options = useMemo(() => optionsData?.options || [], [optionsData])

  // One batched history request covering the holdings, the watchlist AND the
  // benchmark. The benchmark rides along rather than costing its own call —
  // against an 8-calls-per-minute provider that difference is the difference
  // between the comparison rendering and the whole board going empty.
  const historySymbols = useMemo(
    () => [
      ...positions.map((p) => p.ticker),
      ...watchlistItems.map((item) => item.ticker),
      BENCHMARK,
    ],
    [positions, watchlistItems],
  )
  const { candlesFor } = useSessionHistory(historySymbols)

  const brief = useMemo(
    () =>
      buildBrief({
        pnl,
        watchlist: watchlistItems,
        options,
        candlesFor,
        benchmark: BENCHMARK,
      }),
    [pnl, watchlistItems, options, candlesFor],
  )

  const grounding = useMemo(
    () => groundingFor({ pnl, watchlist: watchlistItems, options, brief }),
    [pnl, watchlistItems, options, brief],
  )

  const { attribution } = brief

  /* ------------------------------------------------ generated inputs */

  const providerFetcher = useCallback(() => api.aiProvider(), [])
  const { data: provider } = useApi(providerFetcher, [], {
    key: 'ai:provider',
    // The pinned model changes on a deploy, not on a clock.
    ttl: TTL.HISTORY,
  })

  const [activeId, setActiveId] = useState(INVESTIGATE_TOOLS[0].id)
  const [values, setValues] = useState(() => initialValues(INVESTIGATE_TOOLS[0]))
  const [ask, setAsk] = useState(INVESTIGATE_TOOLS[0].prompts[0])
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [running, setRunning] = useState(false)
  const [copied, setCopied] = useState(false)
  const [history, setHistory] = useState(readHistory)

  const tool = getTool(activeId)

  const disabledReasons = useMemo(() => {
    const reasons = {}
    for (const entry of INVESTIGATE_TOOLS) {
      if (entry.needsPortfolio && positions.length === 0) reasons[entry.id] = 'Needs a holding'
      if (entry.needsWatchlist && watchlistItems.length === 0) {
        reasons[entry.id] = 'Needs a watchlist ticker'
      }
    }
    return reasons
  }, [positions.length, watchlistItems.length])

  const prompts = useMemo(
    () =>
      answerablePrompts({
        hasPortfolio: positions.length > 0,
        hasWatchlist: watchlistItems.length > 0,
      }),
    [positions.length, watchlistItems.length],
  )

  const selectTool = (id) => {
    const next = getTool(id)
    setActiveId(id)
    setValues(initialValues(next))
    setResult(null)
    setError(null)
    if (next?.prompts?.length) setAsk(next.prompts[0])
  }

  const restoreEntry = (entry) => {
    setActiveId(entry.toolId)
    setValues(entry.values || {})
    setResult(entry.result)
    setError(null)
  }

  const missing = missingFields(tool, values)
  const blocked = disabledReasons[tool.id]

  const run = async () => {
    if (blocked) {
      toast.error(`${tool.name} is unavailable`, blocked)
      return
    }
    if (missing.length > 0) {
      toast.error(`${tool.name} needs more input`, `Add ${missing.join(' and ')}.`)
      return
    }

    setError(null)
    setRunning(true)
    setResult(null)
    try {
      const data = await tool.run({
        mode,
        values,
        watchlistTickers: watchlistItems.map((i) => i.ticker),
      })
      setResult(data)
      setHistory((prev) =>
        persistHistory([makeHistoryEntry(tool, values, data), ...prev].slice(0, MAX_HISTORY)),
      )
    } catch (err) {
      setError(err)
    } finally {
      setRunning(false)
    }
  }

  const copyReport = async () => {
    if (!result) return
    try {
      await navigator.clipboard.writeText(JSON.stringify(result, null, 2))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
      toast.success('Analysis copied to clipboard')
    } catch {
      toast.error('Could not copy', 'Your browser blocked clipboard access.')
    }
  }

  const clearHistory = () => {
    setHistory([])
    try {
      localStorage.removeItem(HISTORY_KEY)
    } catch {
      /* ignore */
    }
  }

  /*
   * The stat strip above the generated prose is MEASURED, and is labelled as
   * such by living in `AnalysisStage`'s measured region. It exists so a reader
   * can check the model's opening sentence against the arithmetic without
   * scrolling back to the brief.
   */
  const measured = useMemo(() => {
    if (!attribution.hasData) return []
    return [
      {
        label: 'Net today',
        value: fmtMoneyRounded(attribution.net, { signed: true }),
        tone: attribution.net >= 0 ? 'text-up' : 'text-down',
      },
      { label: 'Gained', value: fmtMoneyRounded(attribution.gainSum), tone: 'text-up' },
      { label: 'Lost', value: fmtMoneyRounded(attribution.lossSum), tone: 'text-down' },
      {
        label: 'Up / down',
        value: `${attribution.contributors.length} / ${attribution.detractors.length}`,
      },
    ]
  }, [attribution])

  const stage = running ? 'working' : error ? 'error' : result ? 'answer' : 'idle'

  const staleCount = positions.filter((p) => p.price_stale).length

  return (
    <div data-ai-route className="mx-auto max-w-[1600px] space-y-3">
      {/* ------------------------------------------------------- header */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="font-display text-[27px] font-extrabold leading-none tracking-[-0.045em] text-text-primary">
              AI Insights
            </h1>
            <span className="rounded-full bg-accent/[0.16] px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[0.05em] text-accent">
              Measured from your portfolio
            </span>
          </div>
          <p className="mt-1.5 max-w-[820px] text-[12.5px] text-text-tertiary">
            The brief below is calculated directly from your own positions, watchlist and options.
            Written analysis is generated on request from those same figures.
          </p>
        </div>

        {/* Quote health — amber is TIME/attention, never direction. */}
        <span
          title={
            staleCount
              ? `${staleCount} holding${staleCount === 1 ? '' : 's'} have no live quote right now, so they are carried at cost basis and are excluded from today's attribution.`
              : 'Every holding has a live quote, and the daily closes behind the session measures are current.'
          }
          className={`flex shrink-0 cursor-help items-center gap-2 rounded-full border px-3 py-2
            text-[11.5px] font-bold ${
              staleCount
                ? 'border-warn/30 bg-warn/[0.14] text-warn'
                : 'border-subtle text-up'
            }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              staleCount ? 'animate-pulse bg-warn' : 'bg-up'
            }`}
          />
          {positions.length === 0
            ? 'No holdings'
            : staleCount
              ? `${staleCount} at cost basis`
              : 'All quotes live'}
        </span>
      </header>

      {/* -------------------------------------------- attribution beam */}
      {pnlLoading && positions.length === 0 ? null : (
        <AttributionBeam attribution={attribution} />
      )}

      {/* -------------------------------------------------- two columns */}
      <div className="grid grid-cols-1 items-start gap-3 xl:grid-cols-[436px_minmax(0,1fr)]">
        <TodaysBrief items={brief.items} />

        <div className="flex min-w-0 flex-col gap-3">
          <Investigate
            ask={ask}
            onAskChange={setAsk}
            prompts={prompts}
            activeToolId={activeId}
            onSelectTool={selectTool}
            tools={INVESTIGATE_TOOLS}
            disabledReasons={disabledReasons}
            onRun={run}
            running={running}
            provider={provider}
          >
            {tool.fields.length ? (
              <div className="mt-3.5 border-t border-subtle pt-3.5">
                <ToolFields tool={tool} values={values} setValues={setValues} />
              </div>
            ) : null}
          </Investigate>

          <AnalysisStage
            state={stage}
            question={ask}
            tool={tool}
            result={result}
            error={error}
            measured={measured}
            grounding={grounding}
            limitations={brief.limitations}
            provider={provider}
            onRetry={run}
            onCopy={copyReport}
            copied={copied}
          />

          <RecentRuns history={history} onRestore={restoreEntry} onClear={clearHistory} />
        </div>
      </div>
    </div>
  )
}

/* --------------------------------------------------------- tool inputs */

/** Rendered from the registry's field spec, so a new tool needs no new UI. */
function ToolFields({ tool, values, setValues }) {
  const set = (key, value) => setValues((prev) => ({ ...prev, [key]: value }))

  return (
    <div className="flex flex-wrap items-end gap-4">
      {tool.fields.map((field) => {
        if (field.kind === 'ticker') {
          return (
            <div key={field.key} className="w-56">
              <TickerAutocomplete
                id={`ai-${tool.id}-${field.key}`}
                label={field.label}
                value={values[field.key] || ''}
                onChange={(v) => set(field.key, v)}
              />
            </div>
          )
        }

        if (field.kind === 'tickers') {
          const list = values[field.key] || []
          return (
            <div key={field.key} className="w-full">
              <div className="w-56">
                <TickerAutocomplete
                  id={`ai-${tool.id}-${field.key}`}
                  label={`${field.label} (${list.length}/${field.max})`}
                  value=""
                  onChange={() => {}}
                  onSelectEquity={(equity) => {
                    if (list.length >= field.max || list.includes(equity.ticker)) return
                    set(field.key, [...list, equity.ticker])
                  }}
                />
              </div>
              {list.length ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {list.map((ticker) => (
                    <span
                      key={ticker}
                      className="flex items-center gap-1.5 rounded-lg border border-subtle
                        bg-tint/[0.03] py-1 pl-1.5 pr-1 text-xs font-semibold text-text-primary"
                    >
                      <CompanyLogo ticker={ticker} name={equityOrFallback(ticker).name} size={18} />
                      {ticker}
                      <button
                        type="button"
                        aria-label={`Remove ${ticker}`}
                        onClick={() => set(field.key, list.filter((t) => t !== ticker))}
                        className="grid h-5 w-5 cursor-pointer place-items-center rounded
                          text-text-secondary hover:text-down"
                      >
                        <X size={11} />
                      </button>
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          )
        }

        if (field.kind === 'choice') {
          return (
            <div key={field.key}>
              <span className="label">{field.label}</span>
              <Segmented
                label={field.label}
                options={field.options}
                value={values[field.key] || field.initial}
                onChange={(v) => set(field.key, v)}
              />
            </div>
          )
        }

        return (
          <div key={field.key} className="w-32">
            <label htmlFor={`ai-${tool.id}-${field.key}`} className="label">
              {field.label}
            </label>
            <input
              id={`ai-${tool.id}-${field.key}`}
              type="number"
              step="any"
              min="0"
              value={values[field.key] || ''}
              onChange={(e) => set(field.key, e.target.value)}
              placeholder={field.placeholder}
              className="input"
            />
          </div>
        )
      })}
    </div>
  )
}
