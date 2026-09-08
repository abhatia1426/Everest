import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'

import { Sparkline } from '../Sparkline'
import { Skeleton } from '../States'
import { CompanyLogo } from '../ui/CompanyLogo'
import { QuoteDot } from '../ui/QuoteBadge'
import { equityOrFallback } from '../../lib/equitySource'
import { fmtMoney, fmtPercent, pnlColor } from '../../lib/format'
import { normalizeQuote } from '../../lib/quotes'

const CELL_COUNT = 8

/**
 * The watchlist rail — a row of small instruments.
 *
 * Geometry from `Everest Dashboard v2.dc.html`: container padding
 * 12px 8px 12px 20px, a label block divided by a hairline, cells at
 * 8px 14px 8px 9px with an 11px gap, a 34px mark, 12.5px ticker, 12.5px price,
 * 11.5px move, and a 54x22 sparkline.
 */
function TickerCell({ item }) {
  const view = normalizeQuote(item)
  const up = (item.change_percent ?? 0) >= 0
  const name =
    item.company && item.company !== item.ticker
      ? item.company
      : equityOrFallback(item.ticker).name

  return (
    <Link
      to={`/app/ticker/${item.ticker}`}
      className="group flex shrink-0 items-center gap-[11px] rounded-[16px] transition-colors
        duration-150 hover:bg-tint/[0.05]"
      style={{ padding: '8px 14px 8px 9px' }}
    >
      <span className="grid h-[34px] w-[34px] shrink-0 place-items-center overflow-hidden rounded-full bg-tint/[0.06]">
        <CompanyLogo ticker={item.ticker} name={name} size={34} />
      </span>

      <span className="min-w-0">
        <span className="num flex items-center gap-1.5 text-[12.5px] font-bold tracking-[-0.015em] text-text-primary">
          {item.ticker}
          <QuoteDot quote={view} />
        </span>
        <span className="mt-px flex items-baseline gap-1.5">
          <span className="num text-[12.5px] font-semibold text-text-primary">
            {view.unavailable ? '—' : fmtMoney(view.price)}
          </span>
          <span className={`num text-[11.5px] font-bold ${pnlColor(item.change_percent)}`}>
            {fmtPercent(item.change_percent)}
          </span>
        </span>
      </span>

      <Sparkline data={item.sparkline} width={54} height={22} positive={up} />
    </Link>
  )
}

export function TickerStrip({ items = [], loading }) {
  const cells = items.slice(0, CELL_COUNT)

  if (!loading && cells.length === 0) return null

  return (
    <section className="module flex items-center gap-4" style={{ padding: '12px 8px 12px 20px' }}>
      {/* Design: label block, 16px right padding, hairline divider. */}
      <div
        className="flex shrink-0 flex-col gap-px pr-4"
        style={{ borderRight: '1px solid var(--border)' }}
      >
        <span className="font-display text-[15px] font-bold tracking-[-0.03em] text-text-primary">
          Watchlist
        </span>
        {/* Count comes from the real list, not the visible slice. */}
        <span className="text-[11px] text-text-tertiary">{items.length} tracked</span>
      </div>

      {/*
        Fade the trailing edge. The rail always overflows, and a cell sliced
        mid-logo by the container edge reads as a rendering fault; dissolving
        it says "there is more here" instead.
      */}
      <div
        className="scroll-none flex min-w-0 flex-1 items-center gap-2 overflow-x-auto pr-2"
        style={{
          maskImage: 'linear-gradient(90deg, #000 0, #000 calc(100% - 26px), transparent 100%)',
          WebkitMaskImage:
            'linear-gradient(90deg, #000 0, #000 calc(100% - 26px), transparent 100%)',
        }}
      >
        {loading && cells.length === 0
          ? Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="flex shrink-0 items-center gap-[11px]"
                style={{ padding: '8px 14px 8px 9px' }}
              >
                <Skeleton className="h-[34px] w-[34px] rounded-full" />
                <div>
                  <Skeleton className="h-3 w-12" />
                  <Skeleton className="mt-1.5 h-3 w-20" />
                </div>
                <Skeleton className="h-[22px] w-[54px]" />
              </div>
            ))
          : cells.map((item) => <TickerCell key={item.id ?? item.ticker} item={item} />)}
      </div>

      <Link
        to="/app/watchlist"
        aria-label="View all watchlist"
        className="mr-2 grid h-9 w-9 shrink-0 place-items-center rounded-full text-text-secondary
          transition-colors duration-150 hover:text-text-primary"
        style={{ background: 'var(--nested-bg)' }}
      >
        <ChevronRight size={16} />
      </Link>
    </section>
  )
}
