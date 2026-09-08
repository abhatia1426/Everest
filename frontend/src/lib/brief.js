/**
 * Today's Brief — deterministic measurements over the user's own records.
 *
 * THIS FILE NEVER CALLS THE MODEL, and nothing downstream of it does either.
 * That separation is the product's central claim: when the AI provider is
 * missing, rate-limited or broken, the brief is unaffected, because none of it
 * was ever generated. Everything below is arithmetic over figures the user can
 * find on the Portfolio, Watchlist and Options routes.
 *
 * WHAT AN ITEM MAY SAY. Each item restates a number and names where that
 * number came from. There are no causes ("NVDA rose ON EARNINGS"), no
 * forecasts, no ratings, no confidence scores and no recommendations, because
 * Everest has no data that would support any of them — it has positions,
 * quotes, daily closes, a watchlist and tracked contracts, and that is all.
 *
 * WHAT AN ITEM MAY NOT DO. An item that cannot be measured is OMITTED rather
 * than emitted with a dash or a zero. A brief of four honest measurements is
 * the correct output for a book we only partly priced; six items where two are
 * placeholders would imply a completeness we do not have.
 *
 * Definitions are borrowed, never re-invented: `averageDailyMove` comes from
 * the watchlist monitor, sector grouping matches the portfolio route, and
 * contract expiry matches the options book — so the same fact never gets two
 * different numbers on two different screens.
 */

import { averageDailyMove, toCloses } from './monitor'
import { buildAttribution } from './attribution'

/* --------------------------------------------------------------- helpers */

const src = (name, detail) => ({ name, detail })

/** Total return across a close series, first → last, in percent. */
export function seriesReturn(closes) {
  if (!Array.isArray(closes) || closes.length < 2) return null
  const first = closes[0]
  const last = closes[closes.length - 1]
  if (!first) return null
  return ((last - first) / first) * 100
}

/**
 * Reconstruct the book's daily market value from per-holding closes.
 *
 * ALL-OR-NOTHING, deliberately. Summing shares × close over only the holdings
 * whose history came back would produce a curve for a SMALLER portfolio than
 * the user owns, and comparing that to SPY would be a comparison of two
 * different things presented as one. So a single missing or short series makes
 * the whole reconstruction unavailable, and the missing symbols are named so
 * the gap is attributable rather than mysterious.
 */
export function reconstructBook(positions, candlesFor) {
  const rows = positions.filter((p) => typeof p.qty === 'number' && p.qty !== 0)
  if (rows.length === 0) return { series: null, missing: [], length: 0 }

  const closesByTicker = new Map()
  const missing = []

  for (const row of rows) {
    const closes = toCloses(candlesFor(row.ticker))
    if (closes.length < 2) missing.push(row.ticker)
    else closesByTicker.set(row.ticker, closes)
  }

  if (missing.length > 0) return { series: null, missing, length: 0 }

  // Align on the shortest series so every session in the curve is a session
  // every holding actually traded — padding a short one would invent value.
  const length = Math.min(...[...closesByTicker.values()].map((c) => c.length))
  if (length < 2) return { series: null, missing: rows.map((r) => r.ticker), length: 0 }

  const series = []
  for (let i = 0; i < length; i += 1) {
    let value = 0
    for (const row of rows) {
      const closes = closesByTicker.get(row.ticker)
      value += row.qty * closes[closes.length - length + i]
    }
    series.push(value)
  }

  return { series, missing: [], length }
}

/* ------------------------------------------------------------ the builder */

/**
 * @param {object}   input
 * @param {object}   input.pnl          /pnl payload
 * @param {Array}    input.watchlist    watchlist rows (ticker, change_percent)
 * @param {Array}    input.options      enriched contracts (ticker, dte, ...)
 * @param {Function} input.candlesFor   ticker → daily candles (may be empty)
 * @param {string}   input.benchmark    benchmark symbol, default SPY
 */
export function buildBrief({
  pnl,
  watchlist = [],
  options = [],
  candlesFor = () => [],
  benchmark = 'SPY',
} = {}) {
  const positions = pnl?.positions || []
  const items = []

  const attribution = buildAttribution(positions)
  const { contributors, detractors, gainSum, lossSum } = attribution

  /* ------------------------------------------------ biggest contributor */
  const topGain = contributors[0]
  if (topGain) {
    items.push({
      id: 'top-contributor',
      label: 'Biggest contributor',
      labelTone: 'up',
      ticker: topGain.ticker,
      sector: topGain.sector,
      statement: `${topGain.ticker} added more to today's move than any other holding.`,
      figure: topGain.contribution,
      figureKind: 'money',
      figureTone: 'up',
      figureNote: `${topGain.shares} shares × ${topGain.price - topGain.prevClose >= 0 ? '+' : '−'}$${Math.abs(topGain.price - topGain.prevClose).toFixed(2)} since prev close`,
      proof: {
        kind: 'bar',
        segments: [{ fraction: topGain.contribution / gainSum, tone: 'up' }],
        axisLeft: `${Math.round((topGain.contribution / gainSum) * 100)}% of all gains today`,
        axisRightMoney: gainSum,
        axisRightSuffix: 'gained',
        tip: `${topGain.ticker} contributed ${topGain.contribution.toFixed(2)} of the ${gainSum.toFixed(2)} added by the ${contributors.length} holding${contributors.length === 1 ? '' : 's'} that rose today.`,
      },
      sources: [
        src('Portfolio positions', 'Shares you hold, from your own records'),
        src('Quotes', 'Live price and previous close'),
      ],
      route: { label: `Open ${topGain.ticker}`, to: `/app/ticker/${topGain.ticker}` },
    })
  }

  /* -------------------------------------------------- biggest detractor */
  const topLoss = detractors[0]
  if (topLoss) {
    items.push({
      id: 'top-detractor',
      label: 'Biggest detractor',
      labelTone: 'down',
      ticker: topLoss.ticker,
      sector: topLoss.sector,
      statement: `${topLoss.ticker} took the most off your portfolio today.`,
      figure: topLoss.contribution,
      figureKind: 'money',
      figureTone: 'down',
      figureNote: `${topLoss.shares} shares × −$${Math.abs(topLoss.price - topLoss.prevClose).toFixed(2)} since prev close`,
      proof: {
        kind: 'bar',
        segments: [{ fraction: Math.abs(topLoss.contribution) / lossSum, tone: 'down' }],
        axisLeft: `${Math.round((Math.abs(topLoss.contribution) / lossSum) * 100)}% of all losses today`,
        axisRightMoney: lossSum,
        axisRightSuffix: 'lost',
        tip: `${topLoss.ticker} accounted for ${Math.abs(topLoss.contribution).toFixed(2)} of the ${lossSum.toFixed(2)} lost across the ${detractors.length} holding${detractors.length === 1 ? '' : 's'} that fell today.`,
      },
      sources: [
        src('Portfolio positions', 'Shares you hold, from your own records'),
        src('Quotes', 'Live price and previous close'),
      ],
      route: { label: `Open ${topLoss.ticker}`, to: `/app/ticker/${topLoss.ticker}` },
    })
  }

  /* ------------------------------------------------------- concentration */
  //
  // Sector weights come off the same `allocation` block the Portfolio route
  // renders, so the two screens cannot disagree about what "largest sector"
  // means. Unknown is excluded from the headline claim but stays in the
  // denominator — dropping it would inflate every other weight.
  const allocation = (pnl?.allocation || []).filter((slice) => (slice.value || 0) > 0)
  const totalValue = pnl?.total_value || 0
  if (allocation.length > 0 && totalValue > 0) {
    const named = allocation.filter((s) => s.sector && s.sector !== 'Unknown')
    const top = named[0]
    if (top) {
      const weightOf = (slice) => (slice.value / totalValue) * 100
      const topThree = allocation.slice(0, 3)
      const topThreeWeight = topThree.reduce((sum, s) => sum + weightOf(s), 0)

      items.push({
        id: 'concentration',
        label: 'Concentration',
        labelTone: 'neutral',
        statement: `${top.sector} is your largest sector, and your top three sectors hold ${topThreeWeight.toFixed(0)}% of your portfolio.`,
        figure: weightOf(top),
        figureKind: 'percent',
        figureTone: 'neutral',
        figureNote: `${top.value} of ${totalValue} market value`,
        figureNoteKind: 'money-pair',
        figureNoteValues: [top.value, totalValue],
        proof: {
          kind: 'bar',
          segments: topThree.map((slice) => ({
            fraction: weightOf(slice) / 100,
            tone: 'brand',
          })),
          axisLeft: topThree
            .map((slice) => `${slice.sector} ${weightOf(slice).toFixed(0)}%`)
            .join(' · '),
          axisRight: `${(100 - topThreeWeight).toFixed(0)}% elsewhere`,
          tip: `Sector weights are market value by sector over the portfolio's total market value. Everest groups holdings by the sector on each equity record.`,
        },
        sources: [
          src('Portfolio positions', 'Market value per holding'),
          src('Sector allocation', `Sector grouping across ${allocation.length} sectors`),
        ],
        route: { label: 'Open Portfolio', to: '/app/portfolio' },
      })
    }
  }

  /* ---------------------------------------------- unusual watchlist move */
  //
  // "Unusual" is SIZE AGAINST THIS NAME'S OWN NORMAL DAY — today's absolute
  // move divided by its mean absolute daily move over the session window. It
  // is not a signal, a score or a direction call: a name that routinely swings
  // 6% is not flagged for swinging 6% today, and the ratio deliberately drops
  // the sign.
  const unusual = watchlist
    .map((row) => {
      const normal = averageDailyMove(candlesFor(row.ticker))
      const day = row.change_percent
      if (typeof day !== 'number' || !normal) return null
      return { ticker: row.ticker, day, normal, ratio: Math.abs(day) / normal }
    })
    .filter(Boolean)
    .sort((a, b) => b.ratio - a.ratio)[0]

  if (unusual && unusual.ratio >= 1) {
    // Run the track to a whole multiple above today's reading, so the bar
    // never pins to the end while the figure claims something larger.
    const ceiling = Math.max(3, Math.ceil(unusual.ratio))
    items.push({
      id: 'unusual-watchlist',
      label: 'Unusual watchlist move',
      labelTone: 'neutral',
      ticker: unusual.ticker,
      statement: `${unusual.ticker} moved ${unusual.ratio.toFixed(1)} times its normal daily move — the largest gap on your watchlist.`,
      figure: unusual.day,
      figureKind: 'percent',
      figureTone: unusual.day >= 0 ? 'up' : 'down',
      figureNote: `normal day is ${unusual.normal.toFixed(2)}% over the last sessions`,
      proof: {
        kind: 'bar',
        segments: [
          { fraction: unusual.ratio / ceiling, tone: unusual.day >= 0 ? 'up' : 'down' },
        ],
        markFraction: 1 / ceiling,
        axisLeft: `tick is one normal day (${unusual.normal.toFixed(2)}%)`,
        axisRight: `${ceiling}× normal`,
        tip: `Today's move of ${Math.abs(unusual.day).toFixed(2)}% against this name's average day-to-day move of ${unusual.normal.toFixed(2)}%. Size only — direction is not part of the ratio. The tick marks one normal day.`,
      },
      sources: [
        src('Watchlist', `${watchlist.length} tracked name${watchlist.length === 1 ? '' : 's'}`),
        src('Quotes', "Today's change"),
        src('Price history', 'Average daily move over the session window'),
      ],
      route: { label: `Open ${unusual.ticker}`, to: `/app/ticker/${unusual.ticker}` },
    })
  }

  /* ------------------------------------------------ nearest option expiry */
  const dated = options
    .filter((o) => typeof o.dte === 'number' && o.dte >= 0)
    .sort((a, b) => a.dte - b.dte)
  const soonest = dated[0]
  if (soonest) {
    const horizon = Math.max(dated[dated.length - 1].dte, 1)
    items.push({
      id: 'nearest-expiry',
      label: 'Time-sensitive',
      labelTone: 'warn',
      ticker: soonest.ticker,
      statement: `Your ${soonest.ticker} $${Number(soonest.strike).toFixed(2)} ${soonest.type} expires in ${soonest.dte} day${soonest.dte === 1 ? '' : 's'}, the soonest contract you track.`,
      figure: soonest.dte,
      figureKind: 'days',
      figureTone: 'warn',
      figureNote: `${soonest.expiry} · ${soonest.qty} contract${Number(soonest.qty) === 1 ? '' : 's'}`,
      proof: {
        kind: 'bar',
        segments: [{ fraction: soonest.dte / horizon, tone: 'warn' }],
        axisLeft: 'today',
        axisRight: `${horizon} days to your last expiry`,
        tip: `Days between today and the contract's expiry date, on the same ${horizon}-day scale as the rest of your tracked contracts.`,
      },
      sources: [
        src('Options', `${options.length} tracked contract${options.length === 1 ? '' : 's'}`),
      ],
      route: { label: 'Open Options', to: '/app/options' },
    })
  }

  /* --------------------------------------------------- portfolio vs SPY */
  const book = reconstructBook(positions, candlesFor)
  const benchCloses = toCloses(candlesFor(benchmark))

  if (book.series && benchCloses.length >= 2) {
    // Compare over the SAME number of sessions on both sides, or the headline
    // difference is a difference of windows as much as of performance.
    const window = Math.min(book.series.length, benchCloses.length)
    const mine = book.series.slice(-window)
    const bench = benchCloses.slice(-window)
    const mineReturn = seriesReturn(mine)
    const benchReturn = seriesReturn(bench)

    if (mineReturn !== null && benchReturn !== null) {
      const relative = mineReturn - benchReturn
      items.push({
        id: 'vs-benchmark',
        label: 'Against the market',
        labelTone: 'neutral',
        statement: `Over the last ${window} sessions your portfolio returned ${mineReturn >= 0 ? '+' : '−'}${Math.abs(mineReturn).toFixed(2)}% against ${benchmark}'s ${benchReturn >= 0 ? '+' : '−'}${Math.abs(benchReturn).toFixed(2)}%.`,
        figure: relative,
        figureKind: 'percent',
        figureTone: relative >= 0 ? 'up' : 'down',
        figureNote: `difference over the same ${window} sessions`,
        proof: {
          kind: 'spark',
          mine,
          bench,
          mineReturn,
          benchReturn,
          benchmark,
          tip: `Your holdings' combined market value across ${window} daily closes, against ${benchmark} over the same closes. Both are price return: neither line includes dividends, and the portfolio curve holds today's share counts constant, so it does not reflect trades made during the window.`,
        },
        sources: [
          src('Price history', `${window} sessions per holding`),
          src(`${benchmark} benchmark history`, 'Same window, same closes'),
        ],
        route: { label: 'Open Dashboard', to: '/app' },
      })
    }
  }

  /* ----------------------------------------------------------- breadth */
  if (attribution.measured.length >= 3) {
    const up = contributors.length
    const down = detractors.length
    items.push({
      id: 'breadth',
      label: 'Breadth today',
      labelTone: 'neutral',
      statement: `${up} of your ${attribution.measured.length} priced holdings advanced and ${down} declined.`,
      figure: attribution.net,
      figureKind: 'money',
      figureTone: attribution.net >= 0 ? 'up' : 'down',
      figureNote: 'net across every measured holding',
      proof: {
        kind: 'bar',
        segments: [
          { fraction: up / attribution.measured.length, tone: 'up' },
          { fraction: down / attribution.measured.length, tone: 'down' },
        ],
        axisLeft: `${up} advancing`,
        axisRight: `${down} declining`,
        tip: `Counts of holdings whose current price is above or below their previous close. ${attribution.flat.length} unchanged. Holdings without both prices are not counted either way.`,
      },
      sources: [
        src('Portfolio positions', `${positions.length} holdings`),
        src('Quotes', 'Price against previous close'),
      ],
      route: { label: 'Open Portfolio', to: '/app/portfolio' },
    })
  }

  return {
    items,
    attribution,
    /* Everything the brief could NOT measure, so the UI can say so once,
       plainly, instead of leaving the user to notice absences. */
    limitations: buildLimitations({ attribution, book, benchCloses, benchmark, watchlist, options }),
  }
}

/* --------------------------------------------------------- limitations */

function buildLimitations({ attribution, book, benchCloses, benchmark, watchlist, options }) {
  const notes = []

  if (attribution.unmeasured.length > 0) {
    const names = attribution.unmeasured.map((r) => r.ticker).join(', ')
    notes.push({
      id: 'unmeasured-holdings',
      text: `${attribution.unmeasured.length} of ${attribution.rows.length} holdings have no live price or no previous close (${names}), so today's attribution does not account for them. They are not counted as unchanged.`,
    })
  }

  if (book.missing.length > 0) {
    notes.push({
      id: 'incomplete-history',
      text: `Session history is missing for ${book.missing.join(', ')}, so your portfolio cannot be reconstructed over the window and the ${benchmark} comparison is unavailable. Everest does not compare a partial book.`,
    })
  } else if (book.series && benchCloses.length < 2) {
    notes.push({
      id: 'missing-benchmark',
      text: `${benchmark} history is unavailable right now, so the benchmark comparison is not shown.`,
    })
  }

  if (watchlist.length === 0) {
    notes.push({
      id: 'no-watchlist',
      text: 'You are not tracking any watchlist names, so unusual-move measurement has nothing to compare.',
    })
  }

  if (options.length === 0) {
    notes.push({
      id: 'no-options',
      text: 'No tracked contracts, so there is no expiry to report.',
    })
  }

  return notes
}

/**
 * The provenance list — friendly source names and what each one supplied.
 *
 * Names are the ones the user sees elsewhere in the product ("Portfolio
 * positions", not `/pnl`), and no raw payload, tool-call log or debug output is
 * ever surfaced here.
 */
export function groundingFor({ pnl, watchlist = [], options = [], brief }) {
  const positions = pnl?.positions || []
  const attribution = brief?.attribution
  const sources = []

  if (positions.length > 0) {
    sources.push({
      name: 'Portfolio positions',
      detail: `${positions.length} holding${positions.length === 1 ? '' : 's'}`,
    })
    const priced = positions.filter((p) => !p.price_stale).length
    sources.push({
      name: 'Quotes',
      detail:
        priced === positions.length
          ? `${priced} live`
          : `${priced} live · ${positions.length - priced} at cost basis`,
    })
  }

  if ((pnl?.allocation || []).length > 0) {
    sources.push({
      name: 'Sector allocation',
      detail: `${pnl.allocation.length} sector${pnl.allocation.length === 1 ? '' : 's'}`,
    })
  }

  if (watchlist.length > 0) {
    sources.push({
      name: 'Watchlist',
      detail: `${watchlist.length} tracked name${watchlist.length === 1 ? '' : 's'}`,
    })
  }

  if (options.length > 0) {
    sources.push({
      name: 'Options',
      detail: `${options.length} tracked contract${options.length === 1 ? '' : 's'}`,
    })
  }

  if (attribution?.measured?.length) {
    sources.push({ name: 'Price history', detail: 'Daily closes per symbol' })
  }

  return sources
}
