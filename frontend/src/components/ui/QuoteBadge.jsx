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
