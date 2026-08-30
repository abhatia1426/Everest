import { useMemo } from 'react'

import { fmtCompact } from '../../lib/format'

/**
 * Everest brand visualisation: portfolio value placed on a climbing route.
 *
 * Deliberately restrained — no points, badges, streaks or congratulation
 * copy. It is a scale marker, the way an altimeter is: it tells you where you
 * are on a known route and what the next marker is. The camps are a fixed
 * logarithmic ladder, not a target we invented for the user.
 */
const CAMPS = [
  { name: 'Base Camp', at: 1000 },
  { name: 'Camp I', at: 10000 },
  { name: 'Camp II', at: 50000 },
  { name: 'Camp III', at: 250000 },
  { name: 'Summit', at: 1000000 },
]

export function ClimbProgress({ value, className = '' }) {
  const { pct, current, next, remaining } = useMemo(() => {
    const total = Math.max(Number(value) || 0, 0)

    // Log scale: each camp is roughly an order of magnitude apart, so linear
    // placement would bunch every realistic portfolio against the left edge.
    const min = Math.log10(CAMPS[0].at)
    const max = Math.log10(CAMPS[CAMPS.length - 1].at)
    const position = total <= 0 ? 0 : ((Math.log10(total) - min) / (max - min)) * 100

    const reachedIndex = CAMPS.reduce((acc, camp, i) => (total >= camp.at ? i : acc), -1)

    return {
      pct: Math.min(Math.max(position, 0), 100),
      current: reachedIndex >= 0 ? CAMPS[reachedIndex] : null,
      next: CAMPS[reachedIndex + 1] || null,
      remaining: CAMPS[reachedIndex + 1] ? CAMPS[reachedIndex + 1].at - total : 0,
    }
  }, [value])

  return (
    <div className={className}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
          Route
        </p>
        <p className="text-xs font-semibold text-text-primary">
          {current ? current.name : 'Approach'}
        </p>
      </div>

      {/* Route line with camp markers */}
      <div className="relative mt-4 h-px bg-tint/[0.12]">
        <div
          className="absolute inset-y-0 left-0 bg-accent transition-[width] duration-700 ease-out"
          style={{ width: `${pct}%` }}
        />

        {CAMPS.map((camp, index) => {
          const min = Math.log10(CAMPS[0].at)
          const max = Math.log10(CAMPS[CAMPS.length - 1].at)
          const left = ((Math.log10(camp.at) - min) / (max - min)) * 100
          const reached = (Number(value) || 0) >= camp.at
          const isSummit = index === CAMPS.length - 1

          return (
            <span
              key={camp.name}
              className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${left}%` }}
              title={`${camp.name} · ${fmtCompact(camp.at)}`}
            >
              <span
                className={`block rounded-full transition-colors duration-500 ${
                  isSummit ? 'h-2 w-2' : 'h-1.5 w-1.5'
                } ${reached ? 'bg-accent' : 'bg-tint/[0.2]'}`}
              />
            </span>
          )
        })}
      </div>

      <div className="mt-3 flex items-baseline justify-between gap-3 text-[11px] text-text-secondary">
        <span>{CAMPS[0].name}</span>
        {next ? (
          <span className="num">
            {fmtCompact(remaining)} to {next.name}
          </span>
        ) : (
          <span>Summit reached</span>
        )}
        <span>{CAMPS[CAMPS.length - 1].name}</span>
      </div>
    </div>
  )
}
