import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Info, RefreshCw, X } from 'lucide-react'

import { MountainPeak } from './Brand'

const CLIMB_COPY = ['Climbing the data...', 'Reaching new heights...', 'Summiting the markets...']
const AI_COPY = ['Climbing the data...', 'Reaching new heights...', 'Summiting the markets...']

/** Rotating loading copy. Cycles so long waits never feel frozen. */
export function LoadingCopy({ variant = 'climb', className = '' }) {
  const lines = variant === 'ai' ? AI_COPY : CLIMB_COPY
  const [index, setIndex] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => setIndex((i) => (i + 1) % lines.length), 2200)
    return () => clearInterval(timer)
  }, [lines.length])

  return (
    <span
      key={index}
      className={`animate-fade-in text-sm text-text-secondary ${className}`}
      role="status"
      aria-live="polite"
    >
      {lines[index]}
    </span>
  )
}

export function LoadingScreen({ variant = 'climb', className = '' }) {
  return (
    <div className={`flex flex-col items-center justify-center gap-5 py-20 ${className}`}>
      <MountainPeak size={88} className="animate-pulse-soft text-text-secondary/50" />
      <LoadingCopy variant={variant} />
    </div>
  )
}

export function InlineLoader({ variant = 'climb' }) {
  return (
    <div className="flex items-center gap-3 py-8">
      <MountainPeak size={28} className="animate-pulse-soft shrink-0 text-text-secondary/50" />
      <LoadingCopy variant={variant} />
    </div>
  )
}

export function Skeleton({ className = '', style }) {
  return <div className={`skeleton ${className}`} style={style} aria-hidden="true" />
}

/**
 * Placeholder shaped like the table it stands in for. Matching the real row
 * height keeps the page from jumping when data lands.
 */
export function TableSkeleton({ rows = 5, columns = 6 }) {
  return (
    <div className="p-5" aria-hidden="true">
      <div className="mb-4 flex gap-4 border-b border-subtle pb-3">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={i} className="h-2.5 flex-1" />
        ))}
      </div>
      <div className="space-y-4">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex items-center gap-4">
            {Array.from({ length: columns }).map((_, c) => (
              <Skeleton key={c} className={`h-4 flex-1 ${c === 0 ? 'max-w-[90px]' : ''}`} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

/** Placeholder grid matching the holdings/watchlist card layout. */
export function CardGridSkeleton({ count = 6, height = 232 }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} style={{ height }} className="rounded-card" />
      ))}
    </div>
  )
}

export function EmptyState({ title, description, action, icon: Icon }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="relative mb-6">
        <MountainPeak size={92} className="text-text-secondary/25" />
        {Icon ? (
          <span className="absolute inset-x-0 bottom-3 grid place-items-center">
            <Icon size={22} className="text-accent" strokeWidth={1.6} />
          </span>
        ) : null}
      </div>
      <h3 className="t-section">{title}</h3>
      {description ? (
        <p className="t-body mt-2.5 max-w-sm text-[13px]">{description}</p>
      ) : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  )
}

const NOTICE_TONE = {
  info: { wrap: 'border-accent/25 bg-accent/10 text-accent', Icon: Info },
  warn: { wrap: 'border-warn/25 bg-warn/10 text-warn', Icon: AlertTriangle },
  success: { wrap: 'border-up/25 bg-up/10 text-up', Icon: CheckCircle2 },
}

/**
 * Inline, dismissible message. Shares the compact ErrorState shape so notices
 * and errors read identically wherever they appear.
 */
export function Notice({ tone = 'info', children, onDismiss }) {
  const { wrap, Icon } = NOTICE_TONE[tone] || NOTICE_TONE.info

  return (
    <div
      role="status"
      className={`flex items-start gap-2.5 rounded-control border px-3.5 py-2.5 text-sm ${wrap}`}
    >
      <Icon size={15} className="mt-0.5 shrink-0" />
      <span className="flex-1">{children}</span>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="-my-0.5 -mr-1 grid h-6 w-6 shrink-0 cursor-pointer place-items-center
            rounded transition-opacity duration-150 hover:opacity-70"
        >
          <X size={13} />
        </button>
      ) : null}
    </div>
  )
}

export function ErrorState({ error, onRetry, compact = false }) {
  const message = error?.message || 'Something went wrong.'

  if (compact) {
    return (
      <div className="flex items-center gap-2 rounded-control border border-down/25 bg-down/10 px-3.5 py-2.5 text-sm text-down">
        <AlertTriangle size={15} className="shrink-0" />
        <span>{message}</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-4 grid h-12 w-12 place-items-center rounded-full bg-down/12">
        <AlertTriangle size={22} className="text-down" />
      </div>
      <h3 className="t-section">Something slipped</h3>
      <p className="t-body mt-2.5 max-w-sm text-[13px]">{message}</p>
      {onRetry ? (
        <button type="button" onClick={() => onRetry()} className="btn-ghost mt-5 cursor-pointer">
          <RefreshCw size={14} />
          Try again
        </button>
      ) : null}
    </div>
  )
}
