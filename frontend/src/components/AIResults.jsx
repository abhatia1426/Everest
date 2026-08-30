import { AlertTriangle, ArrowDownRight, ArrowUpRight, CalendarClock, Target } from 'lucide-react'

/** Confidence 1-10 rendered as a labelled meter — never colour alone. */
export function ConfidenceMeter({ score }) {
  const value = Math.min(Math.max(Number(score) || 0, 0), 10)
  const tone = value >= 7 ? 'bg-up' : value >= 4 ? 'bg-warn' : 'bg-down'
  const label = value >= 7 ? 'High' : value >= 4 ? 'Moderate' : 'Low'

  return (
    <div className="rounded-lg border border-subtle bg-tint/[0.02] p-3.5">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
          Confidence
        </span>
        <span className="num text-sm font-bold">
          {value}/10 <span className="ml-1 text-xs font-medium text-text-secondary">{label}</span>
        </span>
      </div>
      <div
        className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-tint/[0.06]"
        role="meter"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={10}
        aria-label={`Confidence ${value} out of 10`}
      >
        <div
          className={`h-full rounded-full ${tone} transition-[width] duration-500 ease-out`}
          style={{ width: `${value * 10}%` }}
        />
      </div>
    </div>
  )
}

function PointList({ title, points = [], icon: Icon, tone }) {
  if (points.length === 0) return null
  return (
    <section className={`rounded-lg border p-4 ${tone.border} ${tone.bg}`}>
      <h4 className={`mb-3 flex items-center gap-2 text-sm font-bold ${tone.text}`}>
        <Icon size={15} />
        {title}
      </h4>
      <ul className="space-y-2.5">
        {points.map((point, index) => (
          <li
            key={index}
            style={{ animationDelay: `${index * 60}ms` }}
            className="flex animate-fade-up gap-2.5 text-sm leading-relaxed text-text-secondary"
          >
            <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${tone.dot}`} />
            <span>{point}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function ThesisResult({ result }) {
  if (!result) return null

  return (
    <div className="animate-fade-up space-y-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="text-lg font-bold tracking-tight text-text-primary">{result.ticker}</span>
        <span
          className={`rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${
            result.direction === 'short' ? 'bg-down/15 text-down' : 'bg-up/15 text-up'
          }`}
        >
          {result.direction}
        </span>
      </div>

      {result.summary ? (
        <p className="rounded-lg bg-tint/[0.03] p-3.5 text-sm leading-relaxed text-text-secondary">
          {result.summary}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <PointList
          title="Bull case"
          points={result.bull_case}
          icon={ArrowUpRight}
          tone={{ border: 'border-up/20', bg: 'bg-up/[0.05]', text: 'text-up', dot: 'bg-up' }}
        />
        <PointList
          title="Bear case"
          points={result.bear_case}
          icon={ArrowDownRight}
          tone={{ border: 'border-down/20', bg: 'bg-down/[0.05]', text: 'text-down', dot: 'bg-down' }}
        />
      </div>

      <PointList
        title="Key risks"
        points={result.key_risks}
        icon={AlertTriangle}
        tone={{
          border: 'border-warn/20',
          bg: 'bg-warn/[0.05]',
          text: 'text-warn',
          dot: 'bg-warn',
        }}
      />

      <ConfidenceMeter score={result.confidence} />
      {result.confidence_rationale ? (
        <p className="text-xs leading-relaxed text-text-secondary">{result.confidence_rationale}</p>
      ) : null}
    </div>
  )
}

const SEVERITY_TONE = {
  high: 'bg-down/12 text-down',
  medium: 'bg-warn/12 text-warn',
  low: 'bg-accent/12 text-accent',
}

export function AnalystResult({ result }) {
  if (!result) return null

  const contributors = (list, tone) =>
    (list || []).map((row, index) => (
      <li
        key={`${row.ticker}-${index}`}
        style={{ animationDelay: `${index * 50}ms` }}
        className="flex animate-fade-up items-start gap-3 rounded-lg bg-tint/[0.02] p-3"
      >
        <span className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-bold ${tone}`}>
          {row.ticker}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold">{row.contribution}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-text-secondary">{row.note}</p>
        </div>
      </li>
    ))

  return (
    <div className="animate-fade-up space-y-5">
      <p className="rounded-lg bg-tint/[0.03] p-3.5 text-sm leading-relaxed text-text-secondary">
        {result.summary}
      </p>

      {result.sector_concentration?.length ? (
        <section>
          <h4 className="mb-2.5 text-xs font-bold uppercase tracking-wider text-text-secondary">
            Sector concentration
          </h4>
          <ul className="space-y-2">
            {result.sector_concentration.map((row, index) => (
              <li key={`${row.sector}-${index}`} className="animate-fade-up rounded-lg bg-tint/[0.02] p-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-semibold">{row.sector}</span>
                  <span className="num text-sm font-bold text-accent">
                    {Number(row.weight_percent).toFixed(1)}%
                  </span>
                </div>
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-tint/[0.06]">
                  <div
                    className="h-full rounded-full bg-accent transition-[width] duration-500"
                    style={{ width: `${Math.min(Number(row.weight_percent) || 0, 100)}%` }}
                  />
                </div>
                <p className="mt-2 text-xs leading-relaxed text-text-secondary">{row.comment}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {result.risk_flags?.length ? (
        <section>
          <h4 className="mb-2.5 text-xs font-bold uppercase tracking-wider text-text-secondary">
            Risk flags
          </h4>
          <ul className="space-y-2">
            {result.risk_flags.map((flag, index) => (
              <li key={index} className="animate-fade-up rounded-lg border border-subtle bg-tint/[0.02] p-3">
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase ${
                      SEVERITY_TONE[String(flag.severity).toLowerCase()] || SEVERITY_TONE.low
                    }`}
                  >
                    {flag.severity}
                  </span>
                  <span className="text-sm font-semibold">{flag.title}</span>
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-text-secondary">{flag.detail}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {result.top_performers?.length ? (
          <section>
            <h4 className="mb-2.5 text-xs font-bold uppercase tracking-wider text-up">Top performers</h4>
            <ul className="space-y-2">{contributors(result.top_performers, 'bg-up/15 text-up')}</ul>
          </section>
        ) : null}
        {result.detractors?.length ? (
          <section>
            <h4 className="mb-2.5 text-xs font-bold uppercase tracking-wider text-down">Detractors</h4>
            <ul className="space-y-2">{contributors(result.detractors, 'bg-down/15 text-down')}</ul>
          </section>
        ) : null}
      </div>
    </div>
  )
}

export function EarningsResult({ result }) {
  if (!result) return null

  return (
    <div className="animate-fade-up space-y-5">
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="text-lg font-bold tracking-tight text-text-primary">{result.ticker}</span>
        <span className="flex items-center gap-1.5 rounded-md bg-accent/12 px-2 py-1 text-xs font-semibold text-accent">
          <CalendarClock size={13} />
          {result.next_report}
        </span>
      </div>

      {result.analyst_expectations?.length ? (
        <section>
          <h4 className="mb-2.5 text-xs font-bold uppercase tracking-wider text-text-secondary">
            Analyst expectations
          </h4>
          <dl className="grid gap-2 sm:grid-cols-2">
            {result.analyst_expectations.map((row, index) => (
              <div
                key={index}
                style={{ animationDelay: `${index * 50}ms` }}
                className="animate-fade-up rounded-lg bg-tint/[0.02] p-3"
              >
                <dt className="text-xs font-semibold text-text-secondary">{row.metric}</dt>
                <dd className="mt-1 text-sm font-semibold">{row.expectation}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      {result.last_quarter_recap ? (
        <section>
          <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-text-secondary">
            Last quarter recap
          </h4>
          <p className="rounded-lg bg-tint/[0.02] p-3.5 text-sm leading-relaxed text-text-secondary">
            {result.last_quarter_recap}
          </p>
        </section>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <PointList
          title="Metrics to watch"
          points={result.key_metrics_to_watch}
          icon={Target}
          tone={{ border: 'border-accent/20', bg: 'bg-accent/[0.05]', text: 'text-accent', dot: 'bg-accent' }}
        />
        <PointList
          title="Catalysts"
          points={result.catalysts}
          icon={ArrowUpRight}
          tone={{ border: 'border-up/20', bg: 'bg-up/[0.05]', text: 'text-up', dot: 'bg-up' }}
        />
      </div>
    </div>
  )
}
