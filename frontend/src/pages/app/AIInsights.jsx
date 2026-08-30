import { useCallback, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Check,
  Copy,
  PanelRightClose,
  PanelRightOpen,
  RefreshCw,
  Sparkles,
  X,
} from 'lucide-react'

import { Segmented } from '../../components/ui/Segmented'
import { StaggerGroup, StaggerItem } from '../../components/Motion'
import { TickerAutocomplete } from '../../components/search/TickerAutocomplete'
import { EmptyState, ErrorState, InlineLoader, Notice } from '../../components/States'
import { ToolReport } from '../../components/ai/Reports'
import { CompanyLogo } from '../../components/ui/CompanyLogo'
import { Panel, Surface } from '../../components/ui/Surface'
import { useToast } from '../../components/ui/Toast'
import { useApi } from '../../hooks/useApi'
import { TTL } from '../../lib/cache'
import { useMode } from '../../hooks/useMode'
import { useWatchlist } from '../../hooks/useWatchlist'
import { AI_TOOLS, getTool, initialValues, missingFields } from '../../lib/aiTools'
import { api } from '../../lib/api'
import { equityOrFallback } from '../../lib/equitySource'
import { deriveInsights } from '../../lib/insights'
import { fmtMoney, fmtRelative } from '../../lib/format'

const HISTORY_KEY = 'everest_ai_history'
const MAX_HISTORY = 20

function readHistory() {
  try {
    const parsed = JSON.parse(localStorage.getItem(HISTORY_KEY))
    return Array.isArray(parsed) ? parsed.slice(0, MAX_HISTORY) : []
  } catch {
    return []
  }
}

/** Builds a history entry. Module scope so the impure clock call is never in
 *  a component body, where React's purity rule cannot tell render from handler. */
function makeHistoryEntry(tool, values, result) {
  const at = new Date().toISOString()
  return {
    key: `${tool.id}-${at}`,
    toolId: tool.id,
    toolName: tool.name,
    at,
    values,
    result,
  }
}

function persistHistory(next) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next))
  } catch {
    /* history is a convenience; quota failures are not fatal */
  }
  return next
}

/* ------------------------------------------------------- context summary */

/**
 * What the model is being given. Shown before any run so the user knows what
 * an answer is grounded in — and, just as importantly, what it is not.
 *
 * Reuses deriveInsights() rather than recomputing weights here, so the
 * dashboard and the workspace can never disagree about the same portfolio.
 */
function ContextSummary({ pnl, watchlistItems, insights, mode }) {
  const positions = pnl?.positions || []
  const stale = positions.filter((p) => p.price_stale).length

  return (
    <Panel title="Context">
      <dl className="grid grid-cols-2 gap-3 text-xs">
        <div>
          <dt className="text-text-secondary">Book</dt>
          <dd className="mt-0.5 font-semibold capitalize text-text-primary">{mode}</dd>
        </div>
        <div>
          <dt className="text-text-secondary">Holdings</dt>
          <dd className="num mt-0.5 font-semibold text-text-primary">{positions.length}</dd>
        </div>
        <div>
          <dt className="text-text-secondary">Cost basis</dt>
          <dd className="num mt-0.5 font-semibold text-text-primary">{fmtMoney(pnl?.total_cost)}</dd>
        </div>
        <div>
          <dt className="text-text-secondary">Watchlist</dt>
          <dd className="num mt-0.5 font-semibold text-text-primary">{watchlistItems.length}</dd>
        </div>
      </dl>

      {stale > 0 ? (
        <div className="mt-3">
          <Notice tone="warn">
            {stale} of {positions.length} holdings lack live prices. Analysis uses cost basis and
            will say so.
          </Notice>
        </div>
      ) : null}

      {insights.length > 0 ? (
        <>
          <p className="mb-2 mt-4 text-[11px] font-bold uppercase tracking-wider text-text-secondary">
            Measured from your data
          </p>
          <ul className="space-y-1.5">
            {insights.slice(0, 4).map((insight) => (
              <li
                key={insight.id}
                className="flex gap-2 text-xs leading-relaxed text-text-secondary"
              >
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-accent" />
                <span>{insight.text}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <p className="mt-4 border-t pt-3 text-[11px] leading-relaxed text-text-secondary">
        Everest sends only these figures. Anything a tool cannot measure is reported as unknown
        rather than estimated.
      </p>
    </Panel>
  )
}

/* --------------------------------------------------------- tool selector */

function ToolSelector({ activeId, onSelect, disabledReasons }) {
  return (
    <Surface className="p-2">
      <div className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
        {AI_TOOLS.map((tool) => {
          const Icon = tool.icon
          const active = tool.id === activeId
          const reason = disabledReasons[tool.id]

          return (
            <button
              key={tool.id}
              type="button"
              onClick={() => onSelect(tool.id)}
              aria-pressed={active}
              title={reason || tool.blurb}
              // The blurb only shows on the active tool. Six tools each
              // carrying two lines of description turned the rail into a wall
              // of prose you had to read past to find the one you wanted.
              className={`relative flex min-w-[172px] shrink-0 cursor-pointer items-start gap-2.5
                rounded-control px-3 py-2.5 text-left transition-colors duration-150 lg:min-w-0 ${
                  active
                    ? 'bg-accent/[0.09] text-text-primary'
                    : 'text-text-secondary hover:bg-tint/[0.04] hover:text-text-primary'
                } ${reason ? 'opacity-55' : ''}`}
            >
              {active ? (
                <span
                  aria-hidden="true"
                  className="absolute inset-y-2 left-0 w-[2px] rounded-full bg-accent"
                />
              ) : null}
              <Icon size={15} className={`mt-0.5 shrink-0 ${active ? 'text-accent' : ''}`} />
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold">{tool.name}</span>
                {active || reason ? (
                  <span className="mt-0.5 block text-[11px] leading-snug text-text-secondary">
                    {reason || tool.blurb}
                  </span>
                ) : null}
              </span>
            </button>
          )
        })}
      </div>
    </Surface>
  )
}

/* ------------------------------------------------------------- controls */

function ToolFields({ tool, values, setValues }) {
  const set = (key, value) => setValues((prev) => ({ ...prev, [key]: value }))
  if (!tool.fields.length) return null

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
                        onClick={() =>
                          set(
                            field.key,
                            list.filter((t) => t !== ticker),
                          )
                        }
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

/** Recent runs, as a compact rail rather than a stacked card. */
function HistoryRail({ history, onRestore, onClear }) {
  return (
    <Panel
      title="Recent"
      action={
        history.length ? (
          <button
            type="button"
            onClick={onClear}
            className="cursor-pointer text-[11px] font-semibold text-text-tertiary
              transition-colors duration-150 hover:text-down"
          >
            Clear
          </button>
        ) : null
      }
    >

      {history.length === 0 ? (
        <p className="py-3 text-[11px] leading-relaxed text-text-tertiary">
          Runs appear here so you can revisit them.
        </p>
      ) : (
        <ul className="space-y-1">
          {history.slice(0, 8).map((entry) => (
            <li key={entry.key}>
              <button
                type="button"
                onClick={() => onRestore(entry)}
                className="w-full rounded-control px-2.5 py-2 text-left transition-colors
                  duration-200 hover:bg-tint/[0.05]"
              >
                <span className="block truncate text-xs font-semibold text-text-primary">
                  {entry.toolName}
                </span>
                <span className="mt-0.5 flex items-center justify-between gap-2">
                  <span className="truncate text-[10px] text-text-tertiary">
                    {entry.values?.ticker ||
                      (entry.values?.tickers || []).join(', ') ||
                      entry.values?.style ||
                      'Portfolio'}
                  </span>
                  <span className="shrink-0 text-[10px] text-text-tertiary">
                    {fmtRelative(entry.at)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

/* ------------------------------------------------------------------ page */

export default function AIInsights() {
  const { mode } = useMode()
  const { items: watchlistItems } = useWatchlist()
  const toast = useToast()

  const pnlFetcher = useCallback(() => api.pnl(mode), [mode])
  const { data: pnl } = useApi(pnlFetcher, [mode], { key: `pnl:${mode}`, ttl: TTL.QUOTE })

  const [activeId, setActiveId] = useState(AI_TOOLS[0].id)
  const [values, setValues] = useState(() => initialValues(AI_TOOLS[0]))
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [history, setHistory] = useState(readHistory)
  const [contextOpen, setContextOpen] = useState(true)

  const tool = getTool(activeId)
  const positions = useMemo(() => pnl?.positions || [], [pnl])
  const insights = useMemo(
    () => deriveInsights({ pnl, watchlist: watchlistItems }),
    [pnl, watchlistItems],
  )

  // Tool switching and history restore both set every piece of state together
  // in the handler. Doing this in an effect would mean an extra render pass and
  // a race between "reset the form" and "load the saved run".
  const selectTool = (id) => {
    setActiveId(id)
    setValues(initialValues(getTool(id)))
    setResult(null)
    setError(null)
  }

  const restoreEntry = (entry) => {
    setActiveId(entry.toolId)
    setValues(entry.values || {})
    setResult(entry.result)
    setError(null)
  }

  const disabledReasons = useMemo(() => {
    const reasons = {}
    for (const entry of AI_TOOLS) {
      if (entry.needsPortfolio && positions.length === 0) {
        reasons[entry.id] = 'Needs a holding first'
      }
      if (entry.needsWatchlist && watchlistItems.length === 0) {
        reasons[entry.id] = 'Needs a watchlist ticker'
      }
    }
    return reasons
  }, [positions.length, watchlistItems.length])

  const missing = missingFields(tool, values)
  const blocked = disabledReasons[tool.id]

  const run = async () => {
    setError(null)
    setLoading(true)
    setResult(null)
    try {
      const data = await tool.run({
        mode,
        values,
        watchlistTickers: watchlistItems.map((i) => i.ticker),
      })
      setResult(data)

      const entry = makeHistoryEntry(tool, values, data)
      setHistory((prev) => persistHistory([entry, ...prev].slice(0, MAX_HISTORY)))
    } catch (err) {
      setError(err)
      toast.error(`${tool.name} failed`, err.message)
    } finally {
      setLoading(false)
    }
  }

  const copyReport = async () => {
    if (!result) return
    try {
      await navigator.clipboard.writeText(JSON.stringify(result, null, 2))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
      toast.success('Report copied to clipboard')
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

  return (
    /*
     * Research workspace, not a chat page.
     *
     * Three columns: a tool rail (what can I ask), the report canvas (the
     * answer), and a collapsible context rail (what the answer is grounded in).
     * The canvas is the only thing that scrolls, so the rails stay put while
     * you read — the Cursor/Claude-Desktop arrangement rather than a
     * message feed.
     */
    <div className="mx-auto max-w-[1600px]">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        {/* The route name is already in the topbar; restating it at display
            size with a gradient was decoration, not orientation. */}
        <p className="text-[13px] text-text-secondary">
          Six tools over your own book. Every answer states what it was grounded in.
        </p>
        <button
          type="button"
          onClick={() => setContextOpen((v) => !v)}
          aria-pressed={contextOpen}
          className="btn-ghost px-2.5 py-1.5 text-[12px]"
        >
          {contextOpen ? <PanelRightClose size={14} /> : <PanelRightOpen size={14} />}
          {contextOpen ? 'Hide context' : 'Show context'}
        </button>
      </div>

      <div
        className="grid gap-5"
        style={{
          gridTemplateColumns: contextOpen
            ? 'minmax(220px, 260px) minmax(0, 1fr) minmax(260px, 320px)'
            : 'minmax(220px, 260px) minmax(0, 1fr)',
        }}
      >
        {/* ---------------------------------------------------- tool rail */}
        <aside className="space-y-4 max-lg:hidden">
          <ToolSelector
            activeId={activeId}
            onSelect={selectTool}
            disabledReasons={disabledReasons}
          />
          <HistoryRail history={history} onRestore={restoreEntry} onClear={clearHistory} />
        </aside>

        {/* ------------------------------------------------ report canvas */}
        <section className="min-w-0 space-y-4">
          {/* Mobile tool picker — the rail is desktop-only. */}
          <div className="lg:hidden">
            <ToolSelector
              activeId={activeId}
              onSelect={selectTool}
              disabledReasons={disabledReasons}
            />
          </div>

          {/* The run bar. Controls only — no gradient icon tile, which was
              spending the accent on a decoration next to a button that needs
              it. */}
          <Surface className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <h3 className="t-section">{tool.name}</h3>
                <p className="t-body mt-1 max-w-xl text-[12.5px]">{tool.blurb}</p>
                {/*
                  Stated as prose, not chips. These were rendered as pill-shaped
                  spans that looked pressable but had no handler — an affordance
                  the interface could not honour.
                */}
                <p className="mt-2 text-[11px] leading-relaxed text-text-tertiary">
                  Answers questions like {tool.prompts.slice(0, 2).map((p) => `“${p}”`).join(' or ')}.
                </p>
              </div>

              {result ? (
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={copyReport}
                    className="btn-ghost px-2.5 py-1.5 text-[12px]"
                  >
                    {copied ? <Check size={13} /> : <Copy size={13} />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                  <button
                    type="button"
                    onClick={run}
                    disabled={loading}
                    className="btn-ghost px-2.5 py-1.5 text-[12px]"
                  >
                    <RefreshCw size={13} />
                    Regenerate
                  </button>
                </div>
              ) : null}
            </div>

            {tool.fields.length ? (
              <div className="mt-5">
                <ToolFields tool={tool} values={values} setValues={setValues} />
              </div>
            ) : null}

            <button
              type="button"
              onClick={run}
              disabled={loading || Boolean(blocked) || missing.length > 0}
              className="btn-primary mt-5 w-full"
            >
              <Sparkles size={15} />
              {loading
                ? 'Climbing the data...'
                : blocked
                  ? blocked
                  : missing.length
                    ? `Add ${missing.join(' and ')}`
                    : `Run ${tool.name}`}
            </button>
          </Surface>

          {/* The report itself — a document surface, not a message bubble. */}
          <Surface className="min-h-[420px] p-6 sm:p-8">
            {loading ? (
              <InlineLoader variant="ai" />
            ) : error ? (
              <ErrorState error={error} onRetry={run} />
            ) : result ? (
              <StaggerGroup className="space-y-4">
                <StaggerItem>
                  <ToolReport toolId={tool.id} result={result} />
                </StaggerItem>
              </StaggerGroup>
            ) : (
              <EmptyState
                icon={Sparkles}
                title={`No ${tool.name.toLowerCase()} yet`}
                description={
                  blocked ||
                  'Run the tool to generate a written analysis grounded in the context rail.'
                }
              />
            )}
          </Surface>
        </section>

        {/* --------------------------------------------- context rail */}
        <AnimatePresence initial={false}>
          {contextOpen ? (
            <motion.aside
              key="context"
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 12 }}
              transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
              className="max-xl:hidden"
            >
              <div className="sticky top-24">
                <ContextSummary
                  pnl={pnl}
                  watchlistItems={watchlistItems}
                  insights={insights}
                  mode={mode}
                />
              </div>
            </motion.aside>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  )
}
