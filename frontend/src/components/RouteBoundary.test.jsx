import { lazy } from 'react'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { RouteBoundary } from './RouteBoundary'

/**
 * The failure this component exists to prevent: a lazy route whose chunk never
 * arrives leaving the content area blank forever, with no loading state, no
 * error and no way back. Every test here is a variant of "the user is never
 * left staring at nothing".
 */

function deferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('resolved routes', () => {
  it('renders the route content', async () => {
    render(
      <RouteBoundary routeKey="/app">
        <p>Dashboard</p>
      </RouteBoundary>,
    )
    expect(await screen.findByText('Dashboard')).toBeInTheDocument()
  })

  it('shows no loading state at all when a preloaded chunk resolves quickly', async () => {
    const { promise, resolve } = deferred()
    const Lazy = lazy(() => promise)

    render(
      <RouteBoundary routeKey="/app">
        <Lazy />
      </RouteBoundary>,
    )

    // The whole point of the delay: chunks are preloaded on hover, so the
    // common case must not flash a loader over already-rendered chrome.
    expect(screen.queryByRole('status')).not.toBeInTheDocument()

    await act(async () => {
      resolve({ default: () => <p>Portfolio</p> })
      await promise
    })
    expect(await screen.findByText('Portfolio')).toBeInTheDocument()
  })
})

describe('slow routes', () => {
  it('reveals a loading state once the wait stops being brief', async () => {
    const { promise } = deferred()
    const Lazy = lazy(() => promise)

    render(
      <RouteBoundary routeKey="/app">
        <Lazy />
      </RouteBoundary>,
    )

    expect(screen.queryByRole('status')).not.toBeInTheDocument()

    await act(async () => {
      vi.advanceTimersByTime(600)
    })

    // Something is on screen — the user is not staring at a blank panel.
    expect(screen.getByRole('status')).toBeInTheDocument()
  })
})

describe('failed routes', () => {
  it('shows an error instead of a permanently blank panel', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const Lazy = lazy(() => Promise.reject(new Error('Failed to fetch dynamically imported module')))

    render(
      <RouteBoundary routeKey="/app">
        <Lazy />
      </RouteBoundary>,
    )

    expect(await screen.findByText('Something slipped')).toBeInTheDocument()
  })

  it('offers a working recovery action', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const reload = vi.fn()
    const Lazy = lazy(() => Promise.reject(new Error('boom')))

    render(
      <RouteBoundary routeKey="/app" onReload={reload}>
        <Lazy />
      </RouteBoundary>,
    )

    const retry = await screen.findByRole('button', { name: /try again/i })
    await userEvent.click(retry)
    expect(reload).toHaveBeenCalled()
  })

  it('catches render errors thrown by the page itself, not just chunk loads', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    function Explodes() {
      throw new Error('render blew up')
    }

    render(
      <RouteBoundary routeKey="/app">
        <Explodes />
      </RouteBoundary>,
    )
    expect(await screen.findByText('Something slipped')).toBeInTheDocument()
  })

  it('clears the error when the user navigates to another route', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    function Explodes() {
      throw new Error('render blew up')
    }

    const { rerender } = render(
      <RouteBoundary routeKey="/app">
        <Explodes />
      </RouteBoundary>,
    )
    expect(await screen.findByText('Something slipped')).toBeInTheDocument()

    // A broken route must not poison every subsequent navigation.
    rerender(
      <RouteBoundary routeKey="/app/portfolio">
        <p>Portfolio</p>
      </RouteBoundary>,
    )
    expect(await screen.findByText('Portfolio')).toBeInTheDocument()
    expect(screen.queryByText('Something slipped')).not.toBeInTheDocument()
  })
})
