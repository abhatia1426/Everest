import { useMemo } from 'react'
import { AlertTriangle } from 'lucide-react'

import { AnimatedNumber } from '../Motion'
import { Skeleton } from '../States'
import { PerformanceChart } from './PerformanceChart'
import { fmtCompact, fmtMoney, fmtPercent, fmtSignedMoney, pnlColor } from '../../lib/format'

/**
 * The portfolio value panel — row 1, left column of the approved Dashboard.
 *
 * Every measurement here is taken from `Everest Dashboard v2.dc.html` rather
 * than interpreted: 22px padding, 10px hero margin, 12px day-row margin, a 22px
 * gap before a 2x2 tile grid at 10px, tiles at 14px radius on `--pnl2` with a
 * 3px accent tick inset 9px from the left.
 */

/**
 * One tile. Design geometry:
 *   padding 12px 12px 12px 15px · radius 14px · background --pnl2
 *   tick    absolute left 9px, top/bottom 13px, width 3px, radius 3px
 *   label   11.5px --dim
 *   value   Archivo 700 19px, -0.035em, margin-top 3px
 *   sub     11px --faint, margin-top 2px
 */
function Tile({ label, value, sub, tick, tone }) {
  return (
    <div
      className="relative overflow-hidden"
      style={{
        padding: '12px 12px 12px 15px',
        borderRadius: 14,
        background: 'var(--nested-bg)',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: 9,
          top: 13,
          bottom: 13,
          width: 3,
          borderRadius: 3,
          background: tick,
        }}
      />
      <div className="truncate text-[11.5px] text-text-secondary">{label}</div>
      <div
        className={`mt-[3px] truncate font-display text-[19px] font-bold leading-none tracking-[-0.035em] ${
          tone || 'text-text-primary'
        }`}
      >
        {value}
      </div>
      <div className="num mt-0.5 truncate text-[11px] text-text-tertiary">{sub}</div>
    </div>
  )
}

function PanelSkeleton() {
  return (
    <div className="flex h-full flex-col">
      <Skeleton className="h-3.5 w-28" />
      <Skeleton className="mt-2.5 h-14 w-56" />
      <Skeleton className="mt-3 h-8 w-44" />
      <div className="mt-[22px] grid flex-1 grid-cols-2 gap-2.5" style={{ minHeight: 150 }}>
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="rounded-[14px]" />
        ))}
      </div>
    </div>
  )
}

function ValuePanel({ pnl, positions, pricesStale }) {
  const dayUp = (pnl?.day_change ?? 0) >= 0
  const holdings = pnl?.position_count ?? 0

  const measured = useMemo(
    () => positions.filter((p) => typeof p.change_percent === 'number' && !p.price_stale),
    [positions],
  )
  const best = useMemo(
    () =>
      measured.length === 0
        ? null
        : measured.reduce((a, b) => (b.change_percent > a.change_percent ? b : a)),
    [measured],
  )

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2.5">
        {/*
          The label names the figure honestly. When quotes are unavailable the
          hero IS the cost basis, and calling it "total portfolio" would make
          the copy and the number disagree.
        */}
        <span className="text-[13px] font-semibold text-text-secondary">
          {pricesStale ? 'Portfolio cost basis' : 'Total portfolio'}
        </span>
      </div>

      <div
        className="num-hero mt-2.5"
        style={{
          fontSize: 'clamp(40px, 4.2vw, 60px)',
          letterSpacing: '-0.05em',
          lineHeight: 1,
        }}
      >
        <AnimatedNumber
          value={(pricesStale ? pnl?.total_cost : pnl?.total_value) ?? 0}
          format={(v) => fmtMoney(v)}
        />
      </div>

      {pricesStale ? (
        <span
          className="mt-3 inline-flex w-fit items-center gap-2 rounded-full px-[11px] py-1.5
            text-[12.5px] font-semibold text-warn"
          style={{ background: 'var(--warn-soft)' }}
        >
          <AlertTriangle size={13} />
          Showing cost basis until quotes return
        </span>
      ) : measured.length === 0 ? (
        /*
         * NO MEASURED MOVE IS NOT A ZERO MOVE.
         *
         * `/pnl` sums day_change over positions and contributes 0 for any
         * holding whose change_percent is null, so an empty book — and a book
         * whose every quote failed — both arrive here as day_change: 0. Painted
         * into the green "+0.00%" pill that reads as "the market was flat
         * today", which is an assertion we did not measure.
         */
        <div className="mt-3 text-[12.5px] text-text-tertiary">
          {positions.length === 0
            ? 'No positions yet'
            : 'No measured move today — awaiting live quotes'}
        </div>
      ) : (
        <div className="mt-3 flex items-center gap-[9px]">
          <div
            className="num flex items-center gap-1.5 rounded-full text-[14px] font-bold tracking-[-0.02em]"
            style={{
              padding: '6px 11px',
              background: dayUp ? 'var(--up-soft)' : 'var(--down-soft)',
              color: dayUp ? 'var(--accent-green)' : 'var(--accent-red)',
            }}
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 12 12"
              fill="currentColor"
              aria-hidden="true"
              style={{ transform: dayUp ? 'none' : 'rotate(180deg)' }}
            >
              <path d="M6 1.5l4.4 7.5H1.6z" />
            </svg>
            {fmtPercent(pnl?.day_change_percent)}
          </div>
          <span className={`num text-[13.5px] font-semibold ${pnlColor(pnl?.day_change)}`}>
            {fmtSignedMoney(pnl?.day_change)}
          </span>
          <span className="text-[12.5px] text-text-tertiary">today</span>
        </div>
      )}

      {/*
        FOUR TILES at the design's exact 2x2 geometry, but NOT its exact set.
        The design's slots are Equity / Cash / Total return / Best today; ours
        are Cost basis / Holdings / Total return / Best today.

        CASH IS GONE, and that is a stronger position than the em dash it
        replaces. Everest models no cash balance anywhere — not on the user,
        not in /portfolio, not in /pnl. A tile reading "Cash —" still asserts
        that cash is a concept this product tracks and merely failed to fill,
        which is a claim about the roadmap rather than about the data. There is
        no cash model to be unavailable, so the slot carries a real measurement
        instead: how many positions the portfolio holds.

        Slot 1 carries Cost basis rather than Equity because with no cash the
        two are the same figure and Equity would only restate the hero above
        it. Cost basis is the other half of the return already shown and comes
        straight from /pnl.
      */}
      <div
        className="mt-[22px] grid flex-1 grid-cols-2 gap-2.5"
        style={{ gridAutoRows: '1fr', minHeight: 150 }}
      >
        <Tile
          label="Cost basis"
          // fmtCompact is the shared bare-number formatter and carries no
          // currency; the symbol is added here rather than by changing a
          // helper other surfaces depend on.
          value={`$${fmtCompact(pnl?.total_cost)}`}
          sub="invested capital"
          tick="var(--accent-blue)"
        />
        <Tile
          label="Holdings"
          value={holdings}
          sub={holdings === 1 ? 'position' : 'positions'}
          tick="var(--border-strong)"
        />
        <Tile
          label="Total return"
          value={pricesStale ? '—' : fmtSignedMoney(pnl?.unrealized_pnl)}
          sub={
            pricesStale ? 'needs live quotes' : `${fmtPercent(pnl?.unrealized_percent)} all time`
          }
          tick={pricesStale ? 'var(--border-strong)' : 'var(--accent-green)'}
          tone={pricesStale ? 'text-text-tertiary' : pnlColor(pnl?.unrealized_pnl)}
        />
        <Tile
          label="Best today"
          value={best ? best.ticker : '—'}
          sub={best ? `${fmtPercent(best.change_percent)} on the day` : 'no measured moves'}
          tick={best ? 'var(--accent-green)' : 'var(--border-strong)'}
          tone={best ? 'text-up' : 'text-text-tertiary'}
        />
      </div>
    </div>
  )
}

export function PortfolioInstrument({ pnl, positions = [], loading, pricesStale, mode }) {
  return (
    /*
     * Design row 1: `minmax(300px,.86fr) minmax(0,1.9fr)`, gap 14px, stretch.
     *
     * The collapse is at 1241px, NOT at Tailwind's `xl` (1280px). The approved
     * shell's own rule is `@media (max-width:1240px)`, so `xl:` was rendering
     * a single column across 1241-1279 where the design still draws two — a
     * 39px band that disagreed with the source file for no data reason.
     */
    <div className="grid grid-cols-1 gap-3.5 min-[1241px]:grid-cols-[minmax(300px,0.86fr)_minmax(0,1.9fr)] min-[1241px]:items-stretch">
      <section className="module" style={{ padding: 22 }}>
        {loading ? (
          <PanelSkeleton />
        ) : (
          <ValuePanel pnl={pnl} positions={positions} pricesStale={pricesStale} />
        )}
      </section>

      <PerformanceChart mode={mode} />
    </div>
  )
}
