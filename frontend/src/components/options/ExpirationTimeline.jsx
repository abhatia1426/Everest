import { useMemo } from 'react'

import { Panel } from '../ui/Surface'
import { fmtDate, fmtMoney } from '../../lib/format'
import { groupByExpiry } from '../../lib/options'

/**
 * Expiration timeline.
 *
 * The one visual an options book needs and a table cannot give: WHEN does this
 * position stop existing. A DTE column makes you read nine numbers and sort
 * them mentally; a timeline puts the cluster in front of you — three contracts
 * bunched at nine days is a fact you see rather than compute.
 *
 * The axis is capped at 120 days because that is the horizon over which time
 * decay is a live concern; anything further is pinned to the end and labelled,
 * rather than compressing the near dates into an unreadable smear.
 */
const HORIZON = 120

const BAND = [
  { limit: 7, color: 'var(--accent-red)', label: '≤7d' },
  { limit: 30, color: 'var(--accent-amber)', label: '≤30d' },
  { limit: Infinity, color: 'var(--accent-green)', label: '30d+' },
]

function bandFor(dte) {
  return BAND.find((band) => dte <= band.limit) || BAND[BAND.length - 1]
}

export function ExpirationTimeline({ options }) {
  const groups = useMemo(() => groupByExpiry(options), [options])

  if (groups.length === 0) return null

  const maxValue = Math.max(...groups.map((group) => group.value), 1)

  return (
    <Panel title="Expiration timeline">
      <div className="relative pt-6">
        {/* Markers. Height encodes value at that expiry, colour encodes urgency. */}
        <div className="relative h-[86px]">
          {groups.map((group) => {
            const dte = Math.max(group.dte, 0)
            const left = Math.min((dte / HORIZON) * 100, 100)
            const height = Math.max((group.value / maxValue) * 62, 8)
            const band = bandFor(group.dte)

            return (
              <div
                key={group.expiry}
                className="group absolute bottom-0 -translate-x-1/2"
                style={{ left: `${left}%` }}
              >
                <div
                  className="mx-auto w-1.5 rounded-t-sm transition-opacity duration-150
                    group-hover:opacity-80"
                  style={{ height, background: band.color }}
                />
                {/* Tooltip on hover — keeps the axis clean at rest. */}
                <div
                  className="pointer-events-none absolute bottom-full left-1/2 mb-1.5 hidden
                    -translate-x-1/2 whitespace-nowrap rounded-panel px-2 py-1 text-[10px]
                    group-hover:block"
                  style={{
                    background: 'var(--e3-bg)',
                    border: '1px solid var(--e3-border)',
                    boxShadow: 'var(--shadow-e3)',
                  }}
                >
                  <span className="num font-semibold text-text-primary">
                    {fmtDate(group.expiry, { month: 'short', day: 'numeric' })}
                  </span>
                  <span className="num ml-1.5 text-text-secondary">{fmtMoney(group.value)}</span>
                  <span className="ml-1.5 text-text-tertiary">
                    {group.contracts.length}{' '}
                    {group.contracts.length === 1 ? 'contract' : 'contracts'}
                  </span>
                </div>
              </div>
            )
          })}
        </div>

        {/* Axis */}
        <div className="relative h-px w-full" style={{ background: 'var(--border)' }}>
          {[0, 30, 60, 90, 120].map((tick) => (
            <span
              key={tick}
              className="absolute top-0 -translate-x-1/2"
              style={{ left: `${(tick / HORIZON) * 100}%` }}
            >
              <span className="block h-1 w-px" style={{ background: 'var(--border)' }} />
              <span className="num mt-1 block text-[10px] text-text-tertiary">
                {tick === 0 ? 'today' : `${tick}d`}
              </span>
            </span>
          ))}
        </div>

        <div className="mt-6 flex flex-wrap gap-x-4 gap-y-1">
          {BAND.map((band) => (
            <span key={band.label} className="flex items-center gap-1.5 text-[10px]">
              <span
                className="h-2 w-2 rounded-[2px]"
                style={{ background: band.color }}
                aria-hidden="true"
              />
              <span className="text-text-tertiary">{band.label}</span>
            </span>
          ))}
        </div>
      </div>
    </Panel>
  )
}
