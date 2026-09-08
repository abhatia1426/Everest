import { useEffect, useMemo, useRef, useState } from 'react'

import { fmtDate, fmtMoneyRounded, fmtMoney, fmtSignedMoney } from '../../lib/format'
import { ESTIMATE_DISCLOSURE, runwayScale, runwayTicks } from '../../lib/options'

/**
 * THE EXPIRY RUNWAY — the Options page's signature visualisation, and the
 * reason this page is a runway rather than a table of contracts.
 *
 * ENCODING, exactly as the approved `Everest Options.dc.html` draws it:
 *
 *   horizontal position   expiry, on a square-root time axis
 *   block height          estimated contract value
 *   first seven days      amber zone, hatched
 *   calls                 solid Everest blue
 *   puts                  neutral hatched treatment
 *   selected contract     outlined in the text colour
 *
 * THE AXIS IS DELIBERATELY NOT LINEAR and the panel says so out loud. Options
 * cluster in the near weeks — three expiries inside a fortnight is normal, and
 * they have to be separable — while a LEAP sits alone eleven months out. A
 * linear axis crushes the cluster against the origin, which is the exact region
 * the page exists to make legible. Ticks carry REAL day counts and every gate
 * carries its real date; those labels are authoritative, the spacing is not.
 *
 * AMBER MEANS TIME, NOTHING ELSE. The near-term zone is a statement about the
 * calendar — "these expire within seven days" — not a risk score, an urgency
 * rating or a recommendation. Green and red stay reserved for money, and
 * call-versus-put is a category carried by blue against hatching rather than by
 * direction colour.
 */

const PLOT_HEIGHT = 126
const MAX_GATE_HEIGHT = 84
const MIN_GATE_HEIGHT = 14

/** Narrowest gap, in CSS pixels, that keeps two gate labels legibly apart. */
const MIN_LABEL_GAP = 52

/**
 * The plot's real width in CSS pixels.
 *
 * Measured rather than inferred from a breakpoint, because the runway also
 * narrows when the book totals sit beside it rather than above it. Same
 * approach, and same reason, as the Watchlist spectrum's track measurement.
 */
function usePlotWidth() {
  const ref = useRef(null)
  const [width, setWidth] = useState(900)

  useEffect(() => {
    const node = ref.current
    if (!node || typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(([entry]) => {
      const next = Math.round(entry.contentRect.width)
      if (next > 0) setWidth(next)
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return [ref, width]
}

/**
 * Which gates may carry a text label.
 *
 * A square-root axis packs the near weeks tightly on purpose, and at 660px
 * three expiries inside a fortnight put their dates on top of each other —
 * two overlapping labels are strictly worse than one. Blocks, tooltips and
 * accessible names are NEVER dropped: only the redundant text is, and the
 * selected gate always keeps its own, displacing a neighbour if it must.
 */
function labelledGates(gates, plotWidth, selectedId) {
  const labelled = new Set()
  let lastX = -Infinity

  for (const gate of gates) {
    const x = (gate.fraction / 100) * plotWidth
    if (x - lastX >= MIN_LABEL_GAP) {
      labelled.add(gate.expiry)
      lastX = x
    }
  }

  const selected = gates.find((gate) => gate.rows.some((row) => row.id === selectedId))
  if (selected && !labelled.has(selected.expiry)) {
    const x = (selected.fraction / 100) * plotWidth
    for (const gate of gates) {
      if (
        labelled.has(gate.expiry) &&
        Math.abs((gate.fraction / 100) * plotWidth - x) < MIN_LABEL_GAP
      ) {
        labelled.delete(gate.expiry)
      }
    }
    labelled.add(selected.expiry)
  }

  return labelled
}

function tagStyle(isCall) {
  return isCall
    ? { backgroundColor: 'var(--accent-blue)', backgroundImage: 'none', border: 'var(--accent-blue)' }
    : {
        backgroundColor: 'var(--track-bg)',
        backgroundImage: 'var(--hatch-strong)',
        border: 'var(--border-strong)',
      }
}

const LEGEND = [
  { key: 'Call', ...tagStyle(true) },
  { key: 'Put', ...tagStyle(false) },
  {
    key: 'Selected',
    backgroundColor: 'var(--panel-bg)',
    backgroundImage: 'none',
    border: 'var(--text-primary)',
  },
]

function Gate({ gate, x, labelled, selectedId, onSelect }) {
  const height = gate.height
  const anySelected = gate.rows.some((row) => row.id === selectedId)

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={gate.label}
      title={gate.label}
      onClick={() => onSelect(gate.rows[0].id)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelect(gate.rows[0].id)
        }
      }}
      className="absolute bottom-0 flex w-[34px] -translate-x-1/2 cursor-pointer flex-col
        items-center justify-end rounded-[4px] outline-none transition-opacity duration-150
        focus-visible:ring-2 focus-visible:ring-accent"
      style={{ left: `${x}%`, opacity: anySelected ? 1 : 0.92 }}
    >
      <span
        className="num whitespace-nowrap font-display text-[10px] font-bold tracking-[-0.03em]"
        style={{
          color: anySelected ? 'var(--text-primary)' : 'var(--text-secondary)',
          visibility: labelled ? 'visible' : 'hidden',
        }}
      >
        {gate.priced ? fmtMoneyRounded(gate.value) : '—'}
      </span>

      <span
        className="mt-[3px] flex w-full flex-col justify-end gap-[2px]"
        style={{ height }}
        aria-hidden="true"
      >
        {gate.rows.map((row) => {
          const tag = tagStyle(row.isCall)
          const selected = row.id === selectedId
          // Unpriced contracts still occupy the gate — they exist and they
          // expire — but they cannot claim a height they were never measured
          // at, so they sit at the minimum sliver.
          const share = gate.value > 0 && row.value ? (row.value / gate.value) * height : 0

          return (
            <span
              key={row.id}
              title={`${row.ticker} ${fmtMoney(row.strike)} ${row.type} · ${row.qty}x · ${
                row.priced ? `${fmtMoney(row.value)} estimated value` : 'no estimated value'
              }`}
              className="w-full rounded-[2px]"
              style={{
                height: Math.max(4, share),
                minHeight: 3,
                backgroundColor: tag.backgroundColor,
                backgroundImage: tag.backgroundImage,
                boxShadow: `0 0 0 1px ${selected ? 'var(--text-primary)' : tag.border}`,
              }}
            />
          )
        })}
      </span>
    </div>
  )
}

export function ExpiryRunway({ views, selectedId, onSelect }) {
  const [plotRef, plotWidth] = usePlotWidth()

  const model = useMemo(() => {
    if (views.length === 0) return null

    /*
      A THIRTY-DAY FLOOR under the horizon. With a single contract expiring in
      two days the axis would end at two days, which pushes the only gate to
      the right edge and makes the seven-day zone cover the entire field — a
      band that shades everything says nothing. The floor keeps the near-term
      zone a proportion of a readable month. Ticks still carry real day counts,
      so nothing about the scale is misstated.
    */
    const horizon = Math.max(30, ...views.map((view) => Math.max(view.dte, 0)))
    const x = runwayScale(horizon)
    const fraction = (days) => x(days) - 2

    const byExpiry = new Map()
    for (const view of views) {
      if (!byExpiry.has(view.expiry)) byExpiry.set(view.expiry, [])
      byExpiry.get(view.expiry).push(view)
    }

    const gates = [...byExpiry.entries()]
      .map(([expiry, rows]) => ({
        expiry,
        rows,
        dte: rows[0].dte,
        value: rows.reduce((sum, row) => sum + (row.value || 0), 0),
        pnl: rows.reduce((sum, row) => sum + (row.pnl || 0), 0),
        priced: rows.some((row) => row.priced),
      }))
      .sort((a, b) => a.dte - b.dte)

    const maxValue = Math.max(...gates.map((gate) => gate.value), 1)

    return {
      horizon,
      x,
      gates: gates.map((gate) => ({
        ...gate,
        fraction: fraction(gate.dte) / 0.94,
        height: Math.max(MIN_GATE_HEIGHT, (gate.value / maxValue) * MAX_GATE_HEIGHT),
        label:
          `${fmtDate(gate.expiry)} · ${gate.dte} ${gate.dte === 1 ? 'day' : 'days'} · ` +
          `${gate.rows.length} contract${gate.rows.length === 1 ? '' : 's'} · ` +
          `${gate.priced ? `${fmtMoney(gate.value)} estimated value · ${fmtSignedMoney(gate.pnl)} estimated P/L` : 'no estimated value'}`,
      })),
      ticks: runwayTicks(horizon).map((day) => ({
        day,
        x: x(day),
        label: day === 0 ? 'today' : `${day}d`,
        shift: day === 0 ? '0' : day === horizon ? '-100%' : '-50%',
      })),
    }
  }, [views])

  const labelled = useMemo(
    () => (model ? labelledGates(model.gates, plotWidth, selectedId) : new Set()),
    [model, plotWidth, selectedId],
  )

  if (!model) return null

  const zoneWidth = model.x(7)

  return (
    <div className="relative min-w-0 p-[16px_20px_13px] max-[760px]:p-[16px_14px_13px]">
      <div className="mb-1.5 flex flex-wrap items-baseline gap-2.5">
        <span className="text-[10px] font-bold uppercase tracking-[0.11em] text-text-primary">
          Expiry runway
        </span>
        <span className="text-[11px] text-text-tertiary">
          Every tracked contract on one time axis — block height is estimated contract value
        </span>

        <div className="flex-1" />

        {/*
          THE DISTORTION IS DISCLOSED, not buried in a tooltip alone. A chart
          that stretches the near weeks and compresses the far months has to
          say so where it is read, or the reader measures distance and gets a
          wrong answer about time.
        */}
        <span
          className="flex cursor-help items-center gap-1.5 whitespace-nowrap text-[10px] text-warn"
          title={
            'Horizontal spacing is deliberately not linear. The near weeks are stretched so ' +
            'contracts expiring soon are separable, and later months are compressed toward the ' +
            'right — so the gap between two gates is not proportional to the days between them. ' +
            'Read the date and day count on each gate: those are the authoritative values. Ticks ' +
            'show where 7, 30, 60 and 90 days actually fall.'
          }
        >
          <svg width="26" height="8" viewBox="0 0 26 8" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden="true">
            <path d="M1 6.5V1.5M6 6.5V2.5M13 6.5V3.5M25 6.5V4.5" />
          </svg>
          Spacing is not linear time
          <span
            className="flex h-[13px] w-[13px] items-center justify-center rounded-full text-[8.5px] font-extrabold"
            style={{ border: '1px solid rgb(var(--accent-amber-rgb) / 0.5)' }}
            aria-hidden="true"
          >
            i
          </span>
        </span>

        <div className="flex items-center gap-3 max-[560px]:hidden">
          {LEGEND.map((item) => (
            <span
              key={item.key}
              className="flex items-center gap-[5px] whitespace-nowrap text-[10px] text-text-tertiary"
            >
              <span
                className="h-2.5 w-2.5 rounded-[2px]"
                style={{
                  backgroundColor: item.backgroundColor,
                  backgroundImage: item.backgroundImage,
                  border: `1px solid ${item.border}`,
                }}
                aria-hidden="true"
              />
              {item.key}
            </span>
          ))}
        </div>
      </div>

      <div ref={plotRef} className="relative" style={{ height: PLOT_HEIGHT }}>
        {/* The near-term zone. Amber is a statement about the calendar. */}
        <span
          title="The first seven days. Contracts inside this band expire within a week."
          className="absolute bottom-0 left-0 top-0 rounded-md hatch-warn"
          style={{
            width: `${zoneWidth}%`,
            backgroundColor: 'var(--warn-soft)',
            borderRight: '1px dashed rgb(var(--accent-amber-rgb) / 0.5)',
          }}
        />

        {model.ticks.map((tick) => (
          <span
            key={`grid-${tick.day}`}
            aria-hidden="true"
            className="absolute bottom-0 top-0 w-px"
            style={{ left: `${tick.x}%`, background: 'var(--border)', opacity: tick.day === 0 ? 0 : 0.9 }}
          />
        ))}

        {model.gates.map((gate) => (
          <Gate
            key={gate.expiry}
            gate={gate}
            x={model.x(gate.dte)}
            labelled={labelled.has(gate.expiry)}
            selectedId={selectedId}
            onSelect={onSelect}
          />
        ))}
      </div>

      <div className="relative mt-0.5 h-px" style={{ background: 'var(--border-strong)' }} />

      <div className="relative mt-1 h-[30px]">
        {model.ticks.map((tick) => (
          <span
            key={`tick-${tick.day}`}
            className="num absolute top-0 whitespace-nowrap text-[10px]"
            style={{
              left: `${tick.x}%`,
              transform: `translateX(${tick.shift})`,
              fontWeight: tick.day === 7 ? 700 : 500,
              color: tick.day === 7 ? 'var(--accent-amber)' : 'var(--text-tertiary)',
            }}
          >
            {tick.label}
          </span>
        ))}

        {model.gates.map((gate) => {
          if (!labelled.has(gate.expiry)) return null
          const selected = gate.rows.some((row) => row.id === selectedId)
          const shift = gate.fraction > 92 ? '-88%' : gate.fraction < 4 ? '-12%' : '-50%'
          return (
            <span
              key={`date-${gate.expiry}`}
              className="num absolute top-[15px] whitespace-nowrap text-[9.5px]"
              style={{
                left: `${model.x(gate.dte)}%`,
                transform: `translateX(${shift})`,
                fontWeight: selected ? 700 : 500,
                color: selected
                  ? 'var(--text-primary)'
                  : gate.dte <= 7
                    ? 'var(--accent-amber)'
                    : 'var(--text-tertiary)',
              }}
            >
              {fmtDate(gate.expiry, { month: 'short', day: 'numeric' })}
            </span>
          )
        })}
      </div>

      <span className="sr-only">{ESTIMATE_DISCLOSURE}</span>
    </div>
  )
}
