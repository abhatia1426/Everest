import { DEMO_HOLDINGS, DEMO_WATCHLIST } from './panels'

/**
 * 04 — PORTFOLIO, derived.
 *
 * ONE SOURCE OF TRUTH, SHARED WITH 03 AND 05.
 *
 * Every figure here is either a value the product already carries or plain
 * arithmetic on it. `DEMO_HOLDINGS` is the same array section 03 contours and
 * section 05 cuts its section through, so the three drawings cannot disagree
 * about what is owned or how much of it there is.
 *
 * The book's headline figures come from the product's own `PortfolioPanel`
 * (see landing/panels) rather than being restated here, for the same reason:
 * the marketing surface must not be able to publish a total the app does not.
 */

/**
 * THE BOOK.
 *
 * These three are the product's own numbers, verbatim from `PortfolioPanel`
 * and from section 03's title block, which both already print them.
 *
 * Deliberately NOT included: the +$2,407.02 that the product prints beside the
 * percentage. The five named positions move $1,100.21 between them today, so
 * printing both a per-position dollar move and a book dollar move on the same
 * spread invites an addition that does not come out — the remaining 9.9% of
 * capital would have to have moved 7.2% to close the gap. The percentage says
 * the same thing and cannot be summed against the entries.
 *
 * This is the whole reason the register prints dollars per position and the
 * margin prints only a percentage for the book.
 */
export const BOOK = { total: 179386.4, change: 1.36, positions: 14 }

/** Share of capital the named positions account for. */
export const COVERED = DEMO_HOLDINGS.reduce((a, h) => a + h.weight, 0)

/**
 * TODAY'S MOVE, IN DOLLARS, FOR ONE POSITION.
 *
 * `value` is the position's CURRENT value and `change` is the day's percentage,
 * so the prior close is `value / (1 + change/100)` and the move is what is left
 * over. Multiplying `value × change` instead — the obvious version — overstates
 * every gain and understates every loss, because it applies today's percentage
 * to a figure that already contains it. At NVDA's +1.65% that error is $11.
 */
const dayMove = (h) => h.value - h.value / (1 + h.change / 100)

/**
 * THE REGISTER, heaviest first.
 *
 * Ordered by weight so the book reads heaviest-first, and each entry carries
 * the offset at which it starts as a share of the whole. `top` and `height` are
 * in percent of book, which means the geometry IS the weight — there is no
 * scaling factor between the number and the page, and none can drift in.
 *
 * The last entry is the capital the register does not name: 9 further
 * positions, whatever is left of 100%. Showing it is not a footnote — a
 * register of five entries that silently added up to less than the total would
 * be the book quietly lying about what is in it.
 */
export const SEGMENTS = (() => {
  const named = [...DEMO_HOLDINGS].sort((a, b) => b.weight - a.weight)

  /*
   * RANK BY WHAT IT MOVED, which is the reading the column could never give.
   *
   * Sorted on the SIGNED dollar move, not its magnitude: a position that took
   * money off the book has not "moved it more" than one that put less on. AMZN
   * is last on this ranking because it is the only drag, which is the honest
   * ordering and the one a reader expects.
   */
  const byMove = [...named].sort((a, b) => dayMove(b) - dayMove(a))

  const rows = []
  let top = 0

  named.forEach((h, i) => {
    rows.push({
      ...h,
      key: h.ticker,
      named: true,
      top,
      height: h.weight,
      move: dayMove(h),
      /*
       * TWO RANKS, TWO DENOMINATORS, BOTH STATED.
       *
       * Capital rank is against the whole book of 14: the unnamed 9 share 9.9%
       * and so average 1.1% each, which puts every one of them below AMZN's
       * 12.3% — the top five here really are the top five of fourteen.
       *
       * Move rank is against the 5 NAMED only, because the other nine
       * positions' moves are not in the data and cannot be inferred. Printing
       * it as "of 14" would be a fabricated denominator.
       */
      capitalRank: i + 1,
      moveRank: byMove.indexOf(h) + 1,
    })
    top += h.weight
  })

  rows.push({
    key: '__rest',
    named: false,
    top,
    /* Rounded because the demo weights are: 100 - 90.1 lands on 9.900000000000006
       in binary floating point, and a register whose last entry is 9.9000000001%
       of book is a register with a bug in it. */
    height: Math.round((100 - top) * 10) / 10,
    count: BOOK.positions - named.length,
  })

  return rows
})()

/** The named positions, in register order. */
export const NAMED = SEGMENTS.filter((s) => s.named)

/** The heaviest position — the one entry the register lets speak at full volume. */
export const LEAD = NAMED[0]

/** The unnamed remainder, kept separately because it is annotated differently. */
export const REST = SEGMENTS[SEGMENTS.length - 1]

/**
 * What the five named positions moved between them today.
 *
 * The margin's denominator when it ranks a position by move, and the only
 * aggregate dollar figure this section is allowed to print. It is labelled as
 * the named positions' move everywhere it appears, never as the book's.
 */
export const NAMED_MOVE = NAMED.reduce((a, h) => a + h.move, 0)

/**
 * Concentration, as one sentence's worth of arithmetic.
 *
 * The single fact the register's shape already shows and the margin states in
 * words, so a reader who does not read shapes still gets it.
 */
export const TOP_THREE = Math.round(NAMED.slice(0, 3).reduce((a, h) => a + h.weight, 0) * 10) / 10

/**
 * Watched names.
 *
 * Named in the edge annotation and nowhere else. They carry no capital, so they
 * have no height on a register measured in capital — the same distinction 03
 * draws with spot heights over unmarked ground, stated here in one line rather
 * than given an entry it has not earned.
 */
export const WATCHED = DEMO_WATCHLIST

/** 1 -> "1st". Used for both rankings in the margin. */
export function ordinal(n) {
  const tens = n % 100
  if (tens >= 11 && tens <= 13) return `${n}th`
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`
}

/**
 * THE REMARK.
 *
 * The one line of prose in the margin, generated from the two ranks rather than
 * authored per ticker — so it cannot say something the figures above it do not
 * support, and so it stays true if the demo data ever changes.
 *
 * The divergence between the two ranks IS the section's argument: weight tells
 * you what you own, and nothing at all about what moved you.
 */
export function remark(s) {
  const drift = s.moveRank - s.capitalRank

  if (drift === 0) {
    if (s.capitalRank === 1) return "Your largest position, and today's largest mover."
    return 'Its weight and its effect on the book line up.'
  }

  if (drift > 0) return 'It carries more of your capital than of today’s move.'
  return 'It moved the book more than its weight would suggest.'
}
