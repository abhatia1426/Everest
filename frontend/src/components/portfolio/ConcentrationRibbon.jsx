import { useMemo, useState } from 'react'
import { X } from 'lucide-react'

import { fmtMoney, fmtPercent } from '../../lib/format'
import {
  RIBBON_BLUES,
  concentrationSummary,
  inkOn,
  ribbonSegments,
} from '../../lib/portfolio'

/**
 * The concentration ribbon — band 2 of the approved Portfolio.
 *
 * Geometry from `Everest Portfolio.dc.html`:
 *   surface  20px radius on --panel-bg, padding `14px 16px 15px`
 *   header   eyebrow 11px/700 .09em uppercase, a 2px-padded mode track on
 *            --nested-bg, then the summary sentence at 12px
 *   ribbon   34px tall, 2px gaps, first/last segments rounded 9px on their
 *            outer corners, 3px elsewhere, 3px minimum width
 *   labels   10.5px/800, shown at >4.6% weight, 72% at >2.8%, hidden below
 *   hatch    segments under 2.2% carry the light hatch, because a sliver too
 *            narrow to label still has to be distinguishable from its
 *            neighbour without relying on a 4% shade difference
 *   tooltip  bottom 58px, centred on the segment, near-black with a hairline
 *
 * WHY IT SPANS THE PAGE: it is the ledger's index. Every segment is a row
 * below it, ordered the same way, coloured by the same rank, and clicking one
 * filters the ledger to it. A donut in a corner would rank badly and connect
 * to nothing.
 *
 * The ramp is blue throughout — weight is not a direction, and green/red here
 * would collide with the P/L encoding two columns to the right.
 */
export function ConcentrationRibbon({
  book,
  query,
  sector,
  onSelectTicker,
  onSelectSector,
  onClear,
}) {
  const [mode, setMode] = useState('positions')
  const [hovered, setHovered] = useState(-1)

  const segments = useMemo(() => ribbonSegments(book, mode), [book, mode])
  const summary = useMemo(() => concentrationSummary(segments), [segments])

  // Centres, in percent of the ribbon's width, so the tooltip can sit over
  // the segment it describes rather than over the cursor.
  const centres = useMemo(() => {
    const out = []
    let cumulative = 0
    for (const segment of segments) {
      out.push(cumulative + segment.weight / 2)
      cumulative += segment.weight
    }
    return out
  }, [segments])

  if (segments.length === 0) return null

  const activeKey = mode === 'positions' ? query.trim().toUpperCase() : sector
  const hasFilter = Boolean(query || sector)
  const tip = hovered >= 0 ? segments[hovered] : null

  return (
    <section
      className="relative"
      style={{
        borderRadius: 'var(--radius-surface)',
        background: 'var(--panel-bg)',
        boxShadow: 'var(--shadow-surface)',
        padding: '14px 16px 15px',
      }}
      aria-label="Concentration"
    >
      <div className="mb-[11px] flex flex-wrap items-center gap-3">
        <span className="text-[11px] font-bold uppercase tracking-[0.09em] text-text-tertiary">
          Concentration
        </span>

        <div
          className="flex shrink-0 gap-0.5"
          style={{ padding: 2, borderRadius: 999, background: 'var(--nested-bg)' }}
          role="radiogroup"
          aria-label="Group concentration by"
        >
          {[
            ['positions', 'Positions'],
            ['sectors', 'Sectors'],
          ].map(([key, label]) => {
            const active = key === mode
            return (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => {
                  setMode(key)
                  setHovered(-1)
                }}
                className={`cursor-pointer rounded-full text-[11.5px] transition-colors duration-150 ${
                  active ? 'font-bold' : 'font-medium'
                }`}
                style={{
                  padding: '4px 11px',
                  background: active ? 'var(--panel-bg)' : 'transparent',
                  color: active ? 'var(--text-primary)' : 'var(--text-tertiary)',
                }}
              >
                {label}
              </button>
            )
          })}
        </div>

        {summary ? (
          <span className="text-[12px] text-text-secondary">
            Top {summary.topCount} {mode === 'positions' ? 'positions' : 'sectors'} make up{' '}
            <strong className="num font-bold text-text-primary">
              {summary.topWeight.toFixed(1)}%
            </strong>{' '}
            of the portfolio · largest is{' '}
            <strong className="num font-bold text-text-primary">
              {summary.largest} at {summary.largestWeight.toFixed(1)}%
            </strong>
          </span>
        ) : null}

        <div className="flex-1" />

        {hasFilter ? (
          <button
            type="button"
            onClick={onClear}
            className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full text-[11.5px]
              font-semibold text-text-secondary transition-colors duration-150 hover:text-text-primary"
            style={{ padding: '4px 10px', background: 'var(--nested-bg)' }}
          >
            <X size={10} strokeWidth={2.4} />
            Clear
          </button>
        ) : null}
      </div>

      <div className="relative flex h-[34px] gap-0.5">
        {segments.map((segment, index) => {
          const shade = RIBBON_BLUES[index % RIBBON_BLUES.length]
          const on = hovered === index
          const selected = Boolean(activeKey) && activeKey === segment.key.toUpperCase()

          return (
            <button
              key={segment.key}
              type="button"
              aria-pressed={selected}
              aria-label={`${segment.name} — ${segment.weight.toFixed(1)}% of the portfolio`}
              onMouseEnter={() => setHovered(index)}
              onMouseLeave={() => setHovered(-1)}
              onFocus={() => setHovered(index)}
              onBlur={() => setHovered(-1)}
              onClick={() =>
                mode === 'positions'
                  ? onSelectTicker(selected ? '' : segment.key)
                  : onSelectSector(selected ? '' : segment.key)
              }
              className="relative flex cursor-pointer items-center justify-center overflow-hidden
                transition-[filter,transform] duration-150"
              style={{
                flex: segment.weight.toFixed(3),
                minWidth: 3,
                background: shade,
                // Under 2.2% a segment is too narrow to label, so the hatch
                // carries the distinction instead of a shade step nobody can
                // resolve at 4px.
                backgroundImage: segment.weight < 2.2 ? 'var(--hatch-light)' : 'none',
                borderRadius:
                  index === 0
                    ? '9px 3px 3px 9px'
                    : index === segments.length - 1
                      ? '3px 9px 9px 3px'
                      : '3px',
                filter: on ? 'brightness(1.18)' : selected ? 'brightness(1.1)' : 'none',
                transform: on ? 'translateY(-2px)' : 'none',
                outline: selected ? '2px solid var(--text-primary)' : 'none',
                outlineOffset: 2,
              }}
            >
              <span
                className="num whitespace-nowrap text-[10.5px] font-extrabold tracking-[-0.01em]"
                style={{
                  color: inkOn(shade),
                  opacity: segment.weight > 4.6 ? 1 : segment.weight > 2.8 ? 0.72 : 0,
                }}
              >
                {segment.label}
              </span>
            </button>
          )
        })}
      </div>

      {tip ? (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 whitespace-nowrap"
          style={{
            left: `${centres[hovered]}%`,
            bottom: 58,
            // Keyed to itself, not to the theme: the tooltip is a near-black
            // chip carrying white ink in BOTH modes, as the design draws it.
            background: '#111114',
            border: '1px solid rgba(255,255,255,.14)',
            borderRadius: 11,
            padding: '9px 13px',
            boxShadow: '0 22px 44px -18px rgba(0,0,0,.95)',
          }}
          role="status"
        >
          <div className="text-[12.5px] font-bold tracking-[-0.01em] text-[#F7F7F9]">
            {tip.name === tip.label ? tip.label : `${tip.label} · ${tip.name}`}
          </div>
          <div className="mt-[3px] flex items-baseline gap-2">
            <span className="num font-display text-[15px] font-bold tracking-[-0.03em] text-white">
              {tip.weight.toFixed(1)}%
            </span>
            <span className="num text-[11.5px] text-[rgba(247,247,249,.62)]">
              {fmtMoney(tip.value)}
            </span>
            {/* An unmeasured day is an em dash here too, never a green zero. */}
            <span
              className="num text-[11.5px] font-bold"
              style={{
                color:
                  tip.dayPercent === null
                    ? 'rgba(247,247,249,.62)'
                    : tip.dayPercent >= 0
                      ? 'var(--accent-green)'
                      : 'var(--accent-red)',
              }}
            >
              {tip.dayPercent === null ? '—' : fmtPercent(tip.dayPercent)}
            </span>
          </div>
        </div>
      ) : null}
    </section>
  )
}
