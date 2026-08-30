import { Loader2, Star } from 'lucide-react'

/**
 * Watchlist toggle. Presentational — membership and mutation come from
 * `useWatchlist`, so the star can never disagree with the list itself.
 */
export function WatchlistButton({ ticker, watched, busy, onToggle, variant = 'button' }) {
  const label = watched ? `Remove ${ticker} from watchlist` : `Add ${ticker} to watchlist`

  if (variant === 'icon') {
    return (
      <button
        type="button"
        onClick={onToggle}
        disabled={busy}
        aria-label={label}
        aria-pressed={watched}
        title={label}
        className={`grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-full
          transition-all duration-150 hover:scale-105 disabled:cursor-not-allowed
          disabled:opacity-60 ${
            watched ? 'bg-warn/12 text-warn' : 'text-text-secondary hover:bg-tint/[0.06]'
          }`}
      >
        {busy ? (
          <Loader2 size={16} className="animate-spin" />
        ) : (
          <Star size={17} className={watched ? 'fill-current' : undefined} />
        )}
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={busy}
      aria-pressed={watched}
      className={watched ? 'btn-ghost cursor-pointer' : 'btn-primary cursor-pointer'}
    >
      {busy ? (
        <Loader2 size={15} className="animate-spin" />
      ) : (
        <Star size={15} className={watched ? 'fill-current text-warn' : undefined} />
      )}
      {watched ? 'On watchlist' : 'Add to watchlist'}
    </button>
  )
}
