import { useEffect, useState } from 'react'

import { getMarketStatus } from '../../lib/marketStatus'

const TONE = {
  open: { dot: 'bg-up', text: 'text-up', bg: 'bg-up/10', pulse: true },
  pre: { dot: 'bg-warn', text: 'text-warn', bg: 'bg-warn/10', pulse: false },
  post: { dot: 'bg-warn', text: 'text-warn', bg: 'bg-warn/10', pulse: false },
  closed: { dot: 'bg-text-secondary', text: 'text-text-secondary', bg: 'bg-tint/[0.05]', pulse: false },
}

/**
 * Live market-session badge. Re-evaluates every 30s so it flips at the open
 * and close without a page refresh.
 */
export function MarketStatus({ compact = false, className = '' }) {
  const [status, setStatus] = useState(getMarketStatus)

  useEffect(() => {
    const timer = setInterval(() => setStatus(getMarketStatus()), 30000)
    return () => clearInterval(timer)
  }, [])

  const tone = TONE[status.state] || TONE.closed

  return (
    <span
      title={status.detail}
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px]
        font-semibold ${tone.bg} ${tone.text} ${className}`}
    >
      <span className="relative flex h-1.5 w-1.5">
        {tone.pulse ? (
          <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${tone.dot} opacity-60`} />
        ) : null}
        <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${tone.dot}`} />
      </span>
      {compact ? null : status.label}
    </span>
  )
}
