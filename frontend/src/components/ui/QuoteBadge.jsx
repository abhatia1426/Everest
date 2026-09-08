import { AlertTriangle, Clock } from 'lucide-react'

import { QUOTE_STATE, quoteLabel, quoteTone } from '../../lib/quotes'

/**
 * Provenance for a displayed price.
 *
 * One component, used by every surface that shows a quote, so a ticker cannot
 * be presented as live on one page and cached on another. It renders nothing
 * for a genuinely live quote — a badge on every price would be noise, and the
 * absence of a badge is itself the signal that the number is current.
 */
/**
 * Row-level provenance, as a dot.
 *
 * The label form is right for a single headline figure and wrong for a list:
 * eleven rows of "Unavailable" down the right edge of the dashboard was more
 * ink than the prices themselves, and it read as an error state rather than as
 * metadata. A 4px dot carries the same five states, keeps the full sentence in
 * the tooltip and the accessible name, and disappears entirely when a quote is
 * live — so the eye only stops where something is actually off.
 */
const DOT_TONE = {
  [QUOTE_STATE.DELAYED]: 'bg-text-tertiary/60',
  [QUOTE_STATE.CACHED]: 'bg-warn',
  [QUOTE_STATE.COST_BASIS]: 'bg-warn',
  [QUOTE_STATE.UNAVAILABLE]: 'bg-text-tertiary/45',
}

export function QuoteDot({ quote, className = '' }) {
  const label = quoteLabel(quote)
  if (!label) return null

  const timing = quote.fetchedAt
    ? ` · fetched ${new Date(quote.fetchedAt).toLocaleTimeString()}`
    : ''

  return (
    <span
      className={`inline-block h-[5px] w-[5px] shrink-0 rounded-full ${
        DOT_TONE[quote.state] || DOT_TONE[QUOTE_STATE.UNAVAILABLE]
      } ${className}`}
      title={`${label}${timing}`}
      role="img"
      aria-label={label}
    />
  )
}

export function QuoteBadge({ quote, className = '', showIcon = true }) {
  const label = quoteLabel(quote)
  if (!label) return null

  const isWarning =
    quote.state === QUOTE_STATE.COST_BASIS ||
    quote.state === QUOTE_STATE.CACHED ||
    quote.state === QUOTE_STATE.UNAVAILABLE

  const Icon = isWarning ? AlertTriangle : Clock

  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-semibold ${quoteTone(
        quote,
      )} ${className}`}
      title={
        quote.fetchedAt
          ? `Fetched ${new Date(quote.fetchedAt).toLocaleTimeString()}`
          : undefined
      }
    >
      {showIcon ? <Icon size={10} className="shrink-0" /> : null}
      {label}
    </span>
  )
}
