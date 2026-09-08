import { createContext, useCallback, useContext, useMemo, useState } from 'react'

import { QUOTE_STATE } from '../lib/quotes'

/**
 * One book-level answer to "how much should I trust the numbers on screen?".
 *
 * Provenance is per-quote everywhere else, which is right for a row but wrong
 * for the chrome: the top bar cannot annotate nine holdings individually, and
 * repeating a per-row label there would just be a tenth copy of information
 * already on the page.
 *
 * So the page that owns the book publishes ONE aggregate — computed by
 * lib/quotes.aggregateQuoteState, meaning the indicator can never claim more
 * confidence than the least trustworthy holding it summarises — and the shell
 * renders it. Routes that do not own a book simply never publish, and the
 * indicator stays hidden rather than showing a stale verdict from a page the
 * user has already left.
 */
const BookStateContext = createContext(null)

export function BookStateProvider({ children }) {
  const [book, setBook] = useState(null)

  /*
   * `clear` is as important as `publish`. Without it, navigating from the
   * dashboard to Settings would leave the last book verdict pinned in the
   * chrome above a page that has nothing to do with it.
   */
  const clear = useCallback(() => setBook(null), [])

  const value = useMemo(() => ({ book, publish: setBook, clear }), [book, clear])

  return <BookStateContext.Provider value={value}>{children}</BookStateContext.Provider>
}

/** Shell-side reader. Null until a route publishes. */
export function useBookState() {
  return useContext(BookStateContext)?.book ?? null
}

/**
 * Page-side writer.
 *
 * Returns stable callbacks so a caller can publish from an effect without the
 * effect re-running on every render.
 */
export function useBookStatePublisher() {
  const context = useContext(BookStateContext)
  return {
    publish: context?.publish ?? noop,
    clear: context?.clear ?? noop,
  }
}

function noop() {}

/** Copy for the aggregate. Live needs no words — absence is the signal. */
export function bookStateLabel(state) {
  switch (state) {
    case QUOTE_STATE.LIVE:
      return null
    case QUOTE_STATE.DELAYED:
      return 'At close'
    case QUOTE_STATE.CACHED:
      return 'Cached prices'
    case QUOTE_STATE.COST_BASIS:
      return 'Cost basis'
    default:
      return 'Prices unavailable'
  }
}
