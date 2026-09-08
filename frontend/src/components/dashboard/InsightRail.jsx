import { Link } from 'react-router-dom'

import { Skeleton } from '../States'

/**
 * "Needs a look" — measurements, not generated prose.
 *
 * Every string here restates arithmetic performed on the user's own positions
 * and watchlist in lib/insights.js. Nothing is model-generated, and the
 * `derived` badge says so on the surface rather than in a comment: the AI
 * workspace is a separate, clearly-labelled destination, and letting a
 * deterministic measurement and a Gemini sentence share one visual treatment
 * would be a trust problem rather than a layout one.
 *
 * The badge is neutral, never brand blue. Blue is reserved for selection and
 * primary action; a provenance label is neither.
 */

/*
 * A small square glyph per observation, tinted by tone.
 *
 * `warn` is amber ONLY where the observation is genuinely time-sensitive or
 * degraded (stale quotes). Concentration is structural, not urgent, so it
 * takes brand blue; direction takes green or red. Spending amber on ordinary
 * facts is what makes a real warning stop registering.
 */
const TONE = {
  info: { glyph: '%', color: 'var(--accent-blue)', bg: 'var(--brand-soft)' },
  warn: { glyph: '!', color: 'var(--accent-amber)', bg: 'var(--warn-soft)' },
  up: { glyph: '↑', color: 'var(--accent-green)', bg: 'var(--up-soft)' },
  down: { glyph: '↓', color: 'var(--accent-red)', bg: 'var(--down-soft)' },
}

export function InsightRail({ insights = [], loading }) {
  return (
    <section className="module" style={{ padding: 20 }}>
      <div className="flex items-center gap-[9px]">
        <h2 className="font-display text-[19px] font-bold tracking-[-0.035em] text-text-primary">
          Needs a look
        </h2>
        {/* The design's provenance chip: 10.5px/600 on --pnl2. It is the one
            place this module says it is measured rather than generated. */}
        <span
          className="rounded-full text-[10.5px] font-semibold text-text-tertiary"
          style={{ padding: '3px 8px', background: 'var(--nested-bg)' }}
        >
          derived
        </span>
      </div>

      {loading ? (
        <div className="mt-3 space-y-4">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-11 w-full" />
          ))}
        </div>
      ) : insights.length === 0 ? (
        <p className="py-8 text-[13px] leading-relaxed text-text-secondary">
          Observations appear as your portfolio grows. Everything here is measured from your own
          holdings — for written analysis, use the AI tools.
        </p>
      ) : (
        <ul className="mt-1.5">
            {insights.slice(0, 3).map((insight) => {
              const tone = TONE[insight.tone] || TONE.info
              const body = (
                <>
                  <span
                    className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-[9px]
                      font-display text-[12px] font-bold"
                    style={{ background: tone.bg, color: tone.color }}
                    aria-hidden="true"
                  >
                    {tone.glyph}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[12.5px] font-bold tracking-[-0.01em] text-text-primary">
                      {insight.label}
                    </span>
                    <span className="mt-[3px] block text-[11.5px] leading-[1.45] text-text-secondary">
                      {insight.text}
                    </span>
                  </span>
                </>
              )

              return (
                <li
                  key={insight.id}
                  style={{ borderBottom: '1px solid var(--border)' }}
                >
                  {insight.ticker ? (
                    <Link
                      to={`/app/ticker/${insight.ticker}`}
                      className="flex gap-[11px] transition-opacity duration-150 hover:opacity-80"
                      style={{ padding: '12px 0' }}
                    >
                      {body}
                    </Link>
                  ) : (
                    <div className="flex gap-[11px]" style={{ padding: '12px 0' }}>
                      {body}
                    </div>
                  )}
                </li>
              )
            })}
        </ul>
      )}
    </section>
  )
}
