import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'

import { Skeleton } from '../States'
import { Panel } from '../ui/Surface'

/**
 * Observations measured from the user's own book (see lib/insights) — not
 * generated text. The AI tools are a separate, clearly-labelled surface, and
 * conflating the two would be a trust problem, not a layout one.
 *
 * Treated as an accent-edged typographic list rather than nested cards: v2
 * gave each insight its own tinted, bordered box, so three observations
 * produced three competing colour fields inside one panel.
 */
const TONE_COLOR = {
  info: 'var(--accent-blue)',
  warn: 'var(--accent-amber)',
  up: 'var(--accent-green)',
  down: 'var(--accent-red)',
}

export function InsightRail({ insights = [], loading }) {
  return (
    <Panel
      title="What stands out"
      action={
        <Link
          to="/app/ai"
          className="inline-flex cursor-pointer items-center gap-1 text-[11px] font-semibold
            text-accent transition-opacity duration-150 hover:opacity-80"
        >
          AI tools
          <ArrowRight size={12} />
        </Link>
      }
    >
      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-12 w-full rounded-panel" />
          ))}
        </div>
      ) : insights.length === 0 ? (
        <p className="px-1 py-10 text-center text-[13px] text-text-secondary">
          Observations appear as your book grows. Everything here is measured from your own
          holdings — for generated analysis, use the AI tools.
        </p>
      ) : (
        <ul className="space-y-3.5">
          {insights.map((insight) => (
            <li
              key={insight.id}
              className="border-l-2 pl-3.5"
              style={{ borderColor: TONE_COLOR[insight.tone] || TONE_COLOR.info }}
            >
              <p className="t-eyebrow">{insight.label}</p>
              <p className="mt-1 text-[13px] leading-relaxed text-text-primary">
                {insight.ticker ? (
                  <Link
                    to={`/app/ticker/${insight.ticker}`}
                    className="cursor-pointer transition-colors duration-150 hover:text-accent"
                  >
                    {insight.text}
                  </Link>
                ) : (
                  insight.text
                )}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}
