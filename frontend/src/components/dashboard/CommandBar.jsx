import { Link } from 'react-router-dom'
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Plus } from 'lucide-react'

import { ModeBadge } from '../Controls'
import { AnimatedNumber } from '../Motion'
import { Skeleton } from '../States'
import { MetricGroup } from '../ui/MetricGroup'
import { Surface } from '../ui/Surface'
import { fmtMoney, fmtPercent, fmtSignedMoney, pnlColor } from '../../lib/format'

/**
 * The portfolio command bar — the page's single anchor.
 *
 * The v2 hero put a display-size value beside three bordered metric chips and
 * a progress bar, so the number it was trying to emphasise had to compete with
 * four other objects in the same band. Here exactly one element is set at hero
 * size and everything else is a hairline-divided group beneath it. That is the
 * whole hierarchy of the screen, expressed in one component.
 *
 * Quick actions collapsed from four pills to one primary button: Portfolio,
 * Watchlist and AI all live in the sidebar, so three of the four were chrome
 * restating navigation the user already has.
 */
export function CommandBar({ pnl, loading, pricesStale }) {
  if (loading) {
    return (
      <Surface className="p-5 sm:p-6">
        <Skeleton className="h-2.5 w-44" />
        <Skeleton className="mt-4 h-14 w-72" />
        <Skeleton className="mt-3 h-5 w-52" />
        <div className="mt-6 border-t pt-5" style={{ borderColor: 'var(--border)' }}>
          <div className="flex gap-8">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex-1">
                <Skeleton className="h-2 w-20" />
                <Skeleton className="mt-2 h-4 w-24" />
              </div>
            ))}
          </div>
        </div>
      </Surface>
    )
  }

  const dayUp = (pnl?.day_change ?? 0) >= 0
  const holdings = pnl?.position_count ?? 0

  return (
    <Surface className="relative overflow-hidden">
      {/*
        Directional wash — a single, very low-opacity edge tint that encodes
        "up" or "down" before any text is read. Kept to the top-left corner and
        under 8% so it never becomes the aurora it replaced.
      */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background: pricesStale
            ? 'radial-gradient(60% 100% at 0% 0%, rgb(var(--accent-amber-rgb) / 0.07), transparent 60%)'
            : dayUp
              ? 'radial-gradient(60% 100% at 0% 0%, rgb(var(--accent-green-rgb) / 0.07), transparent 60%)'
              : 'radial-gradient(60% 100% at 0% 0%, rgb(var(--accent-red-rgb) / 0.07), transparent 60%)',
        }}
      />

      <div className="relative p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              {/*
                The label tells the truth about which figure this is. v2 kept
                the label as "Total portfolio value" and rendered an em dash
                when quotes were stale, while the badge underneath claimed it
                was showing cost basis — the copy and the number disagreed, and
                the user was left with a void where the anchor should be.
              */}
              <p className="t-eyebrow">
                {pricesStale ? 'Portfolio cost basis' : 'Total portfolio value'}
              </p>
              <ModeBadge />
            </div>

            <p className="num-hero mt-2.5" style={{ fontSize: 'var(--text-hero)' }}>
              <AnimatedNumber
                value={(pricesStale ? pnl?.total_cost : pnl?.total_value) ?? 0}
                format={(v) => fmtMoney(v)}
              />
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-2.5">
              {pricesStale ? (
                <span className="inline-flex items-center gap-2 rounded-control bg-warn/10 px-2.5 py-1 text-[11px] font-semibold text-warn">
                  <AlertTriangle size={12} />
                  Showing cost basis until quotes return
                </span>
              ) : (
                <>
                  <span
                    className={`num inline-flex items-center gap-1.5 text-[15px] font-bold ${
                      dayUp ? 'text-up' : 'text-down'
                    }`}
                  >
                    {dayUp ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
                    {fmtSignedMoney(pnl?.day_change)}
                  </span>
                  <span
                    className={`num rounded-control px-2 py-0.5 text-[13px] font-bold ${
                      dayUp ? 'bg-up/10 text-up' : 'bg-down/10 text-down'
                    }`}
                  >
                    {fmtPercent(pnl?.day_change_percent)}
                  </span>
                  <span className="text-[11px] font-medium text-text-tertiary">today</span>
                </>
              )}
            </div>
          </div>

          <Link to="/app/portfolio" className="btn-primary shrink-0 cursor-pointer">
            <Plus size={15} />
            Add position
          </Link>
        </div>

        <div className="mt-6 border-t pt-5" style={{ borderColor: 'var(--border)' }}>
          <MetricGroup
            items={[
              {
                label: 'Total return',
                value: pricesStale ? '—' : fmtSignedMoney(pnl?.unrealized_pnl),
                tone: pricesStale ? undefined : pnlColor(pnl?.unrealized_pnl),
                hint: pricesStale ? undefined : fmtPercent(pnl?.unrealized_percent),
              },
              // When quotes are stale the hero IS the cost basis, so repeating
              // it here would print the same figure twice in one card.
              ...(pricesStale ? [] : [{ label: 'Cost basis', value: fmtMoney(pnl?.total_cost) }]),
              {
                label: 'Holdings',
                value: holdings,
                hint: holdings === 1 ? 'position' : 'positions',
              },
              // Realized, not day P/L: the day figure is already the second
              // largest element on this card, and restating it four inches
              // lower spends a slot without adding information.
              {
                label: 'Realized P/L',
                value: fmtSignedMoney(pnl?.realized_pnl),
                tone: pnlColor(pnl?.realized_pnl),
              },
            ]}
          />
        </div>
      </div>
    </Surface>
  )
}
