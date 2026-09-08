/**
 * Observations derived from the user's own data.
 *
 * These are measurements, not advice: every string restates a number that is
 * already on screen elsewhere. Nothing here predicts, recommends, or rates a
 * security — the generative work belongs to the AI tools, which are clearly
 * labelled as such. Keeping this pure also makes it reusable by Phase E.
 */

function pct(part, whole) {
  return whole > 0 ? (part / whole) * 100 : 0
}

/** Percentage move across a sparkline series (first → last). */
function seriesChange(series = []) {
  const points = series.filter((n) => typeof n === 'number' && !Number.isNaN(n))
  if (points.length < 2) return null
  const [first] = points
  const last = points[points.length - 1]
  if (!first) return null
  return ((last - first) / first) * 100
}

export function deriveInsights({ pnl, watchlist = [] } = {}) {
  const insights = []
  const positions = pnl?.positions || []
  const totalValue = pnl?.total_value || 0

  if (positions.length === 0) {
    return insights
  }

  // --- concentration by sector -------------------------------------------
  const allocation = pnl?.allocation || []
  const topSector = allocation.find((slice) => slice.sector && slice.sector !== 'Unknown')
  if (topSector && totalValue > 0) {
    const weight = pct(topSector.value, totalValue)
    if (weight >= 40) {
      insights.push({
        id: 'sector-concentration',
        tone: weight >= 65 ? 'warn' : 'info',
        label: 'Concentration',
        text: `${weight.toFixed(0)}% of your portfolio sits in ${topSector.sector}.`,
      })
    }
  }

  // --- single-position weight --------------------------------------------
  const largest = [...positions].sort(
    (a, b) => (b.market_value || 0) - (a.market_value || 0),
  )[0]
  if (largest && totalValue > 0) {
    const weight = pct(largest.market_value || 0, totalValue)
    if (weight >= 25) {
      insights.push({
        id: 'position-weight',
        tone: weight >= 50 ? 'warn' : 'info',
        label: 'Largest holding',
        ticker: largest.ticker,
        text: `${largest.ticker} is ${weight.toFixed(0)}% of your portfolio value.`,
      })
    }
  }

  // --- breadth today ------------------------------------------------------
  /*
   * How many holdings are down, and the net dollar change. Both are already
   * on the page (the movers bars, the day figure); stating them as one
   * sentence answers "was today broad or was it one name" without the user
   * having to add up six bars.
   *
   * Only counts holdings that HAVE a measured move — a position carried at
   * cost basis has no day change, and counting it as "flat" would assert
   * something we did not measure.
   */
  const measured = positions.filter(
    (p) => typeof p.change_percent === 'number' && !p.price_stale,
  )
  if (measured.length >= 3) {
    const down = measured.filter((p) => p.change_percent < 0).length
    const net = pnl?.day_change ?? 0
    insights.push({
      id: 'breadth-today',
      tone: net >= 0 ? 'up' : 'down',
      label: 'Breadth today',
      text: `${down} of ${measured.length} priced holdings are down; the portfolio's net change is ${
        net >= 0 ? '+' : '−'
      }$${Math.abs(net).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}.`,
    })
  }

  // --- holdings breadth ---------------------------------------------------
  if (positions.length <= 2) {
    insights.push({
      id: 'breadth',
      tone: 'info',
      label: 'Breadth',
      text: `You hold ${positions.length} position${positions.length === 1 ? '' : 's'}.`,
    })
  }

  // --- data quality -------------------------------------------------------
  const stale = positions.filter((p) => p.price_stale)
  if (stale.length > 0) {
    insights.push({
      id: 'stale-prices',
      tone: 'warn',
      label: 'Data',
      text:
        stale.length === positions.length
          ? 'Live prices are unavailable, so values shown are your cost basis.'
          : `${stale.length} of ${positions.length} holdings are priced at cost basis right now.`,
    })
  }

  // --- notable watchlist move (7-day sparkline) ---------------------------
  const moves = watchlist
    .map((item) => ({ ticker: item.ticker, change: seriesChange(item.sparkline) }))
    .filter((row) => row.change !== null)
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))

  if (moves.length > 0 && Math.abs(moves[0].change) >= 5) {
    const move = moves[0]
    insights.push({
      id: 'watchlist-move',
      tone: move.change > 0 ? 'up' : 'down',
      label: 'Watchlist',
      ticker: move.ticker,
      text: `${move.ticker} has moved ${move.change > 0 ? '+' : '−'}${Math.abs(
        move.change,
      ).toFixed(1)}% over the past week.`,
    })
  }

  return insights
}

/** Gainers and losers across any list of quote-shaped rows. */
export function splitMovers(rows = [], { limit = 4 } = {}) {
  const withChange = rows.filter(
    (row) => row.change_percent !== null && row.change_percent !== undefined,
  )

  const gainers = [...withChange]
    .filter((row) => row.change_percent > 0)
    .sort((a, b) => b.change_percent - a.change_percent)
    .slice(0, limit)

  const losers = [...withChange]
    .filter((row) => row.change_percent < 0)
    .sort((a, b) => a.change_percent - b.change_percent)
    .slice(0, limit)

  return { gainers, losers, hasData: withChange.length > 0 }
}
