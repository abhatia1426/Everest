import { Component, Suspense, useEffect, useState } from 'react'

import { ErrorState, LoadingScreen } from './States'

/**
 * How long a route may take before we admit to the user that we are waiting.
 *
 * Route chunks are preloaded on nav hover/focus (see lib/routes), so the
 * overwhelming majority of navigations resolve in well under a frame and this
 * timer never fires. Showing a loader immediately would mean flashing a
 * spinner over a shell that is already on screen and perfectly usable.
 */
const LOADING_DELAY_MS = 400

/**
 * Renders nothing for the first beat, then a real loading state.
 *
 * This is the piece that turns `fallback={null}` from a fix into a trap: null
 * alone is correct for the fast path and catastrophic for the slow one, where
 * it leaves an empty panel with no indication anything is happening.
 */
function DelayedLoading({ delay = LOADING_DELAY_MS }) {
  const [waited, setWaited] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setWaited(true), delay)
    return () => clearTimeout(timer)
  }, [delay])

  return waited ? <LoadingScreen /> : null
}

/**
 * Catches anything thrown below it — a chunk that failed to download as well as
 * an error thrown while the page renders.
 *
 * `resetKey` is the route path. When it changes we drop the captured error, so
 * one broken route does not poison every subsequent navigation: the user can
 * always click away to somewhere that works.
 */
class ErrorTrap extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidUpdate(prevProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null })
    }
  }

  render() {
    const { error } = this.state
    if (error) return this.props.fallback(error)
    return this.props.children
  }
}

/**
 * One boundary per lazy route: a delayed loading state and an error state with
 * a way out.
 *
 * Recovery is a full reload rather than a re-render. React caches a lazy
 * component's rejection for the lifetime of the module, so re-rendering the
 * same failed route would rethrow the identical error and the retry button
 * would be a lie. A reload refetches the chunk and always works — and a
 * route-level failure is rare enough that losing in-memory state is a fair
 * price for a recovery action that genuinely recovers.
 */
export function RouteBoundary({ children, routeKey, onReload }) {
  const reload = onReload || (() => window.location.reload())

  return (
    <ErrorTrap
      resetKey={routeKey}
      fallback={(error) => <ErrorState error={error} onRetry={reload} />}
    >
      <Suspense fallback={<DelayedLoading />}>{children}</Suspense>
    </ErrorTrap>
  )
}
