import { lazy } from 'react'

/**
 * Lazy route components with preloading.
 *
 * Charting libraries are heavy and only needed inside /app, so the routes stay
 * code-split. But a code-split route has a cost the previous setup paid in
 * full: the FIRST navigation to each page had to download its chunk before
 * anything could render, behind a full-page loading screen.
 *
 * Wrapping each import in a memoised loader lets us start that download on
 * hover/focus — by the time the click lands the chunk is usually already in
 * memory, so `lazy` resolves synchronously and the page renders on the next
 * frame with no fallback at all.
 */
function preloadable(importer) {
  let promise = null
  // Memoised: hovering a link ten times must not start ten downloads.
  const load = () => {
    promise =
      promise ||
      // A rejection must NOT be memoised. A chunk request that failed once —
      // a dropped connection, a flaky tunnel — would otherwise be cached as a
      // permanent failure, and every later hover and navigation would replay
      // the same error without ever retrying the download. Clearing the slot
      // lets the next attempt genuinely re-request the chunk.
      importer().catch((error) => {
        promise = null
        throw error
      })
    return promise
  }

  const Component = lazy(load)
  Component.preload = load
  return Component
}

export const Dashboard = preloadable(() => import('../pages/app/Dashboard'))
export const Portfolio = preloadable(() => import('../pages/app/Portfolio'))
export const Watchlist = preloadable(() => import('../pages/app/Watchlist'))
export const TickerDetail = preloadable(() => import('../pages/app/TickerDetail'))
export const AIInsights = preloadable(() => import('../pages/app/AIInsights'))
export const Options = preloadable(() => import('../pages/app/Options'))
export const Settings = preloadable(() => import('../pages/app/Settings'))

/** Path → component, so the nav can preload by destination. */
const BY_PATH = {
  '/app': Dashboard,
  '/app/portfolio': Portfolio,
  '/app/watchlist': Watchlist,
  '/app/ai': AIInsights,
  '/app/options': Options,
  '/app/settings': Settings,
}

/** Start downloading a route's chunk. Safe to call repeatedly. */
export function preloadRoute(path) {
  const target = path?.startsWith('/app/ticker/') ? TickerDetail : BY_PATH[path]
  // Swallow here only: a speculative prefetch that fails is not an error the
  // user should ever see, and an unhandled rejection would surface as a
  // console error on a page that is working fine. The real navigation still
  // retries and still reports failure through RouteBoundary.
  target?.preload?.()?.catch(() => {})
}

/**
 * Warm the two routes a signed-in user is most likely to open next.
 *
 * Deliberately narrow. Preloading all six chunks on login would compete for
 * bandwidth with the data requests the visible page is waiting on, which makes
 * the current page slower to make a hypothetical next one faster.
 */
export function preloadLikelyRoutes() {
  // Same reasoning as preloadRoute: speculative, so failure is silent.
  const warm = () => {
    Portfolio.preload().catch(() => {})
    Watchlist.preload().catch(() => {})
  }

  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(warm)
  } else {
    setTimeout(warm, 1500)
  }
}
