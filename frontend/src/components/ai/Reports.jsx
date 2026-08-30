import { AlertTriangle, ShieldAlert } from 'lucide-react'

import { Markdown } from './Markdown'
import { AnalystResult, EarningsResult, ThesisResult } from '../AIResults'
import { CompanyLogo } from '../ui/CompanyLogo'
import { equityOrFallback } from '../../lib/equitySource'
import { fmtRelative } from '../../lib/format'

const LEVEL_TONE = {
  high: 'bg-down/15 text-down',
  moderate: 'bg-warn/15 text-warn',
  medium: 'bg-warn/15 text-warn',
  low: 'bg-up/15 text-up',
}

function LevelBadge({ level }) {
  const tone = LEVEL_TONE[String(level || '').toLowerCase()] || 'bg-tint/[0.06] text-text-secondary'
  return (
    <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase ${tone}`}>
      {level}
    </span>
  )
}

/** Banner naming the data the model could not see. Never silently omitted. */
function UnavailableNotice({ tickers = [] }) {
  if (!tickers.length) return null
  return (
    <div className="flex items-start gap-2 rounded-lg border border-warn/25 bg-warn/[0.08] px-3 py-2">
      <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warn" />
      <p className="text-xs text-warn">
        Live market data was unavailable for {tickers.join(', ')}. Those figures are reported as
        unknown rather than estimated.
      </p>
    </div>
  )
}

/* ------------------------------------------------------------- compare */

function CompareReport({ result }) {
  const tickers = result.tickers || []

  return (
    <div className="space-y-5">
      <UnavailableNotice tickers={result.unavailable} />

      <div className="flex flex-wrap gap-3">
        {tickers.map((ticker) => {
          const reference = equityOrFallback(ticker)
          return (
            <span
              key={ticker}
              className="flex items-center gap-2 rounded-xl border border-subtle bg-tint/[0.02] px-3 py-2"
            >
              <CompanyLogo ticker={ticker} name={reference.name} size={26} />
              <span>
                <span className="block text-xs font-bold text-text-primary">{ticker}</span>
                <span className="block text-[10px] text-text-secondary">{reference.sector || '—'}</span>
              </span>
            </span>
          )
        })}
      </div>

      <Markdown>{result.summary}</Markdown>

      <div className="space-y-3">
        {(result.rows || []).map((row) => (
          <section key={row.dimension} className="rounded-xl border border-subtle bg-tint/[0.02] p-4">
            <h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-text-secondary">
              {row.dimension}
            </h4>
            <div className="grid gap-3 sm:grid-cols-2">
              {(row.assessments || []).map((cell) => (
                <div key={`${row.dimension}-${cell.ticker}`}>
                  <div className="flex items-baseline gap-2">
                    <span className="num text-xs font-bold text-text-primary">{cell.ticker}</span>
                    <span className="num text-sm font-semibold text-accent">{cell.value}</span>
                  </div>
                  <p className="mt-0.5 text-xs leading-relaxed text-text-secondary">{cell.note}</p>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      {result.risks?.length ? (
        <section className="rounded-xl border border-warn/20 bg-warn/[0.05] p-4">
          <h4 className="mb-2 flex items-center gap-2 text-sm font-bold text-warn">
            <AlertTriangle size={14} />
            Shared risks
          </h4>
          <ul className="space-y-2">
            {result.risks.map((risk, index) => (
              <li key={index} className="flex gap-2.5 text-sm leading-relaxed text-text-secondary">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-warn" />
                <span>{risk}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {result.verdict ? (
        <section className="rounded-xl border border-accent/20 bg-accent/[0.05] p-4">
          <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-accent">Verdict</h4>
          <Markdown>{result.verdict}</Markdown>
        </section>
      ) : null}
    </div>
  )
}

/* ---------------------------------------------------------------- risk */

function RiskReport({ result }) {
  const weights = Object.entries(result.sector_weights || {}).sort((a, b) => b[1] - a[1])

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2.5">
        <ShieldAlert size={16} className="text-accent" />
        <span className="text-sm font-bold text-text-primary">Overall risk</span>
        <LevelBadge level={result.overall_level} />
      </div>

      <Markdown>{result.summary}</Markdown>

      {weights.length ? (
        <section className="rounded-xl border border-subtle bg-tint/[0.02] p-4">
          <h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-text-secondary">
            Sector exposure
          </h4>
          <ul className="space-y-2.5">
            {weights.map(([sector, weight]) => (
              <li key={sector}>
                <div className="flex items-baseline justify-between gap-3 text-xs">
                  <span className="text-text-secondary">{sector}</span>
                  <span className="num font-bold text-text-primary">{weight.toFixed(1)}%</span>
                </div>
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-tint/[0.08]">
                  <div
                    className="h-full rounded-full bg-accent transition-[width] duration-500"
                    style={{ width: `${Math.min(weight, 100)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="space-y-2">
        {(result.factors || []).map((factor) => (
          <section key={factor.name} className="rounded-xl border border-subtle bg-tint/[0.02] p-4">
            <div className="flex items-center gap-2">
              <LevelBadge level={factor.level} />
              <h4 className="text-sm font-semibold text-text-primary">{factor.name}</h4>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-text-secondary">{factor.finding}</p>
            {factor.evidence ? (
              <p className="num mt-1.5 text-xs text-text-secondary/80">{factor.evidence}</p>
            ) : null}
          </section>
        ))}
      </div>

      {result.diversification_notes?.length ? (
        <section className="rounded-xl border border-accent/20 bg-accent/[0.05] p-4">
          <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-accent">
            Diversification gaps
          </h4>
          <ul className="space-y-2">
            {result.diversification_notes.map((note, index) => (
              <li key={index} className="flex gap-2.5 text-sm leading-relaxed text-text-secondary">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                <span>{note}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}

/* ------------------------------------------------------------ screener */

const VERDICT_TONE = {
  'Strong fit': 'bg-up/15 text-up',
  Fit: 'bg-accent/15 text-accent',
  Watch: 'bg-warn/15 text-warn',
  Avoid: 'bg-down/15 text-down',
}

function ScreenerReport({ result }) {
  return (
    <div className="space-y-3">
      <Markdown>{result.summary}</Markdown>
      {(result.ranked || []).map((row) => (
        <article
          key={row.ticker}
          className="rounded-xl border border-subtle bg-tint/[0.02] p-3.5"
        >
          <div className="flex items-center gap-2.5">
            <span className="num grid h-6 w-6 shrink-0 place-items-center rounded-md bg-accent/15 text-xs font-bold text-accent">
              {row.rank}
            </span>
            <span className="font-bold tracking-tight text-text-primary">{row.ticker}</span>
            <span
              className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                VERDICT_TONE[row.verdict] || 'bg-tint/[0.05] text-text-secondary'
              }`}
            >
              {row.verdict}
            </span>
            <span className="num ml-auto text-xs font-semibold text-text-secondary">
              {Math.round(row.score)}/100
            </span>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-text-secondary">{row.rationale}</p>
        </article>
      ))}
    </div>
  )
}

/* ---------------------------------------------------------- dispatcher */

const REPORTS = {
  analyst: AnalystResult,
  thesis: ThesisResult,
  earnings: EarningsResult,
  compare: CompareReport,
  risk: RiskReport,
  screener: ScreenerReport,
}

export function ToolReport({ toolId, result }) {
  const Component = REPORTS[toolId]
  if (!Component || !result) return null

  return (
    <div className="animate-fade-up">
      <Component result={result} />
      {result.ran_at ? (
        <p className="mt-4 border-t pt-3 text-[11px] text-text-secondary">
          Generated {fmtRelative(result.ran_at)} · AI-generated interpretation of your data, not
          financial advice.
        </p>
      ) : null}
    </div>
  )
}
