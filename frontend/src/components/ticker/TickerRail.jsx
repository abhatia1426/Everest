import { Link, useNavigate } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'

import { fmtPercent } from '../../lib/format'

/**
 * The contextual ticker rail.
 *
 * TWO JOBS, deliberately kept apart:
 *
 *   · A RETURN AFFORDANCE on the left. It is a breadcrumb, not a route change.
 *     Entering a ticker from the Watchlist must not make "Watchlist" the active
 *     global route — the user is on a security page, and painting the nav
 *     otherwise misstates where they are. Global nav already resolves
 *     `/app/ticker/:symbol` to no active item; this rail is what carries the
 *     "where I came from" information instead.
 *
 *     When the browser has history to go back to, the control goes BACK — which
 *     returns to the actual origin, whichever page that was, with its scroll
 *     and filters intact. Landing on the URL directly (a bookmark, a share)
 *     gives no origin to return to, so it links to the Watchlist instead.
 *
 *   · FAST SECURITY-TO-SECURITY MOVEMENT on the right, over the user's real
 *     watchlist with each name's real day move. The symbol being viewed is
 *     always present even when it is not watched, because a rail that hid the
 *     current page would be disorienting.
 */
export function TickerRail({ symbol, items }) {
  const navigate = useNavigate()
  // `window.history.state.idx` is React Router's own entry index. Above zero
  // means there is somewhere in this session to go back to.
  const canGoBack = typeof window !== 'undefined' && (window.history.state?.idx ?? 0) > 0

  return (
    <div className="flex shrink-0 items-center gap-[11px] px-[18px] pb-2.5 max-[760px]:px-3.5">
      {canGoBack ? (
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="flex shrink-0 cursor-pointer items-center gap-1.5 text-[12px] font-semibold
            text-text-tertiary transition-colors duration-150 hover:text-text-primary"
        >
          <ChevronLeft size={12} strokeWidth={2} />
          Back
        </button>
      ) : (
        <Link
          to="/app/watchlist"
          className="flex shrink-0 items-center gap-1.5 text-[12px] font-semibold text-text-tertiary
            transition-colors duration-150 hover:text-text-primary"
        >
          <ChevronLeft size={12} strokeWidth={2} />
          Watchlist
        </Link>
      )}

      <span className="h-[13px] w-px shrink-0" style={{ background: 'var(--border-strong)' }} />

      <div
        className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto"
        style={{ scrollbarWidth: 'none' }}
      >
        {items.map((item) => {
          const active = item.ticker === symbol
          const measured = typeof item.change_percent === 'number'
          return (
            <Link
              key={item.ticker}
              to={`/app/ticker/${item.ticker}`}
              aria-current={active ? 'page' : undefined}
              className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[8px]
                font-display text-[11.5px] tracking-[-0.02em] transition-colors duration-150"
              style={{
                padding: '5px 10px',
                fontWeight: active ? 800 : 700,
                background: active ? 'var(--accent-blue)' : 'var(--panel-bg)',
                color: active ? 'var(--brand-ink)' : 'var(--text-secondary)',
                boxShadow: active
                  ? '0 8px 18px -10px var(--accent-blue)'
                  : 'var(--shadow-surface)',
              }}
            >
              {item.ticker}
              {/* An em dash where there is no quote — never a 0.0%, which would
                  assert a flat session nobody observed. */}
              <span
                className="num text-[10px] font-bold"
                style={{
                  fontFamily: 'inherit',
                  color: active
                    ? 'rgba(255,255,255,.8)'
                    : measured
                      ? item.change_percent >= 0
                        ? 'var(--accent-green)'
                        : 'var(--accent-red)'
                      : 'var(--text-tertiary)',
                }}
              >
                {measured ? fmtPercent(item.change_percent) : '—'}
              </span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
