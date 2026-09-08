import { useCallback, useMemo } from 'react'

import { Skeleton } from '../States'
import { useApi } from '../../hooks/useApi'
import { TTL } from '../../lib/cache'
import { api } from '../../lib/api'

/**
 * Newsroom — row 4, right column of the approved Dashboard.
 *
 * Geometry from `Everest Dashboard v2.dc.html`:
 *   panel   padding 20px, h2 Archivo 700 19px -0.035em + a provenance chip at
 *           10.5px/600 on --pnl2
 *   row     flex, gap 11px, padding 12px 0, hairline under, top-aligned
 *   ticker  11px/700 brand, min-width 40px
 *   body    two stacked lines, the second at 65% opacity
 *   note    14px above, 11px/1.5 faint
 *
 * REAL HEADLINES, NOT THE MOCKUP'S PLACEHOLDER BARS.
 *
 * The design ships grey bars and says so ("Left as placeholders rather than
 * invented copy") because it had no provider attached. Everest does: `/news`
 * returns titled, sourced, dated, sentiment-tagged articles, always at HTTP
 * 200, with a `status` field describing any outage. Rendering the placeholder
 * bars when live copy is available would be preserving a limitation the
 * product does not have.
 *
 * ONE REQUEST, NOT ONE PER HOLDING. `/news` is per-ticker and the provider is
 * rate-limited, so the panel reports on the single largest position — the one
 * holding whose news moves the book most — and is keyed to the same cache
 * entry the ticker page uses, so opening that company costs nothing extra.
 * A portfolio-wide feed would need a backend endpoint that does not exist; the
 * module is scoped honestly rather than faked wide.
 */

const STATUS_COPY = {
  no_articles: 'No recent coverage for this holding.',
  provider_unavailable: 'The news provider is temporarily unavailable.',
  not_configured: 'No news provider is connected.',
}

function timeAgo(iso) {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''

  const hours = Math.round((Date.now() - then) / 3600000)
  if (hours < 1) return 'now'
  if (hours < 24) return `${hours}h`
  return `${Math.round(hours / 24)}d`
}

export function NewsroomPanel({ positions = [], loading }) {
  // The largest position by market value — the holding whose headlines carry
  // the most weight in this book.
  const lead = useMemo(() => {
    if (positions.length === 0) return null
    return positions.reduce((best, p) =>
      (p.market_value || 0) > (best.market_value || 0) ? p : best,
    )
  }, [positions])

  const symbol = lead?.ticker || null
  const fetcher = useCallback(() => api.news(symbol), [symbol])
  const {
    data,
    loading: newsLoading,
    error,
  } = useApi(fetcher, [symbol], {
    key: symbol ? `news:${symbol}` : null,
    ttl: TTL.NEWS,
    // No holdings, no lead symbol, no request.
    enabled: Boolean(symbol),
  })

  /*
   * GATED ON THE CURRENT LEAD SYMBOL, not just on `data`.
   *
   * `useApi` keeps the last successful payload in state when its key changes,
   * which is normally what you want — it avoids a blank flash between routes.
   * Here it meant switching from a populated book to an empty one (Real to
   * Paper) left the previous holding's headlines on screen under a heading
   * that no longer named any company: real articles, attributed to nothing.
   * No symbol, no articles.
   */
  const payload = symbol && data?.ticker === symbol ? data : null
  const articles = (payload?.articles || []).slice(0, 4)
  const busy = loading || (Boolean(symbol) && newsLoading && !payload)

  return (
    <section className="module" style={{ padding: 20 }}>
      <div className="flex items-center gap-[9px]">
        <h2 className="font-display text-[19px] font-bold tracking-[-0.035em] text-text-primary">
          Newsroom
        </h2>
        <span
          className="num rounded-full text-[10.5px] font-semibold text-text-tertiary"
          style={{ padding: '3px 8px', background: 'var(--nested-bg)' }}
        >
          {symbol || 'top holding'}
        </span>
      </div>

      {busy ? (
        <div className="mt-1.5">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex gap-[11px]" style={{ padding: '12px 0' }}>
              <Skeleton className="h-3 w-10 shrink-0" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-2 w-[92%]" />
                <Skeleton className="h-2 w-[58%]" />
              </div>
            </div>
          ))}
        </div>
      ) : articles.length === 0 ? (
        <p className="py-8 text-[13px] leading-relaxed text-text-secondary">
          {!symbol
            ? 'Headlines appear once you hold a position.'
            : error
              ? 'Headlines could not be loaded.'
              : STATUS_COPY[payload?.status] || STATUS_COPY.no_articles}
          <span className="mt-2 block text-[11.5px] text-text-tertiary">
            Nothing is written here that the provider did not return.
          </span>
        </p>
      ) : (
        <>
          <div className="mt-1.5">
            {articles.map((article, index) => (
              <a
                key={article.url || index}
                href={article.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-[11px] transition-opacity duration-150 hover:opacity-80"
                style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}
              >
                <span
                  className="num shrink-0 text-[11px] font-bold text-accent"
                  style={{ minWidth: 40 }}
                >
                  {symbol}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 block text-[12.5px] font-semibold leading-snug text-text-primary">
                    {article.title}
                  </span>
                  <span className="mt-1 block truncate text-[11px] text-text-tertiary">
                    {article.source}
                    {article.published_at ? ` · ${timeAgo(article.published_at)}` : ''}
                  </span>
                </span>
              </a>
            ))}
          </div>

          <p className="mt-3.5 text-[11px] leading-relaxed text-text-tertiary">
            Coverage of {symbol}, your largest holding. Everest has no portfolio-wide feed, so this
            reports on one company rather than implying it covers every holding.
          </p>
        </>
      )}
    </section>
  )
}
