/**
 * The Portfolio page's derivation layer.
 *
 * Every figure the approved `Everest Portfolio.dc.html` draws is arithmetic on
 * the positions `/pnl` already returns. Keeping that arithmetic here — pure,
 * exported and tested — rather than inside the components is what makes it
 * possible to assert that the concentration ribbon, the ledger rows and the
 * footer totals are all reading the SAME numbers. In the design they are three
 * views of one model; if each component derived its own, they could disagree
 * mid-render and nothing would catch it.
 *
 * THE ONE RULE THAT SHAPES ALL OF IT: a figure we did not measure is `null`,
 * never `0`. The backend values a quote-less holding at the user's own cost
 * basis and raises `price_stale`, so `change_percent` on such a row is either
 * absent or meaningless — summing it as zero would report "flat today" for a
 * day we simply did not observe.
 */

import { equityOrFallback } from './equitySource'

/** The sector a holding is filed under, with the reference-data fallback. */
export function sectorOf(position) {
  const reference = equityOrFallback(position.ticker)
  const named =
    position.sector && position.sector !== 'Unknown' ? position.sector : reference.sector
  return named || 'Unclassified'
}

/**
 * One position → one ledger row.
 *
 * `dayAbs` is derived from the previous close implied by `change_percent`
 * (`value - value / (1 + pct/100)`), which is the design's `val - prev`. The
 * backend's own `day_change` uses `value * pct/100` instead — a percentage of
 * the WRONG base — so the row figures and any book figure summed from them are
 * computed here rather than mixed with that one.
 */
export function toHolding(position) {
  const marketValue = position.market_value ?? 0
  const changePercent = position.change_percent
  const measured = typeof changePercent === 'number' && !position.price_stale

  return {
    id: position.id,
    ticker: position.ticker,
    name:
      position.company && position.company !== position.ticker
        ? position.company
        : equityOrFallback(position.ticker).name,
    sector: sectorOf(position),
    qty: position.qty ?? 0,
    avgCost: position.avg_cost ?? 0,
    costBasis: position.cost_basis ?? 0,
    price: position.current_price ?? null,
    priceStale: Boolean(position.price_stale),
    marketValue,
    unrealized: position.unrealized_pnl ?? 0,
    pnlPercent: position.pnl_percent ?? null,
    changePercent: measured ? changePercent : null,
    dayAbs: measured ? marketValue - marketValue / (1 + changePercent / 100) : null,
    measured,
    raw: position,
  }
}

/**
 * The whole book, plus the scales every bar in the page is drawn against.
 *
 * The scales live on the book rather than on the row because they are
 * relative to the FULL portfolio, not to the filtered view. A weight bar that
 * rescaled itself when a sector filter was applied would make a 4% holding
 * look like a 40% one.
 */
export function buildBook(positions = []) {
  const rows = positions.map(toHolding)

  const totalValue = rows.reduce((sum, r) => sum + r.marketValue, 0)
  const totalCost = rows.reduce((sum, r) => sum + r.costBasis, 0)
  const unrealized = rows.reduce((sum, r) => sum + r.unrealized, 0)

  const measured = rows.filter((r) => r.measured)
  const dayAbs = measured.length ? measured.reduce((sum, r) => sum + r.dayAbs, 0) : null
  const prevValue = dayAbs === null ? null : totalValue - dayAbs
  const dayPercent = prevValue ? (dayAbs / prevValue) * 100 : null

  const sectors = new Map()
  for (const row of rows) sectors.set(row.sector, (sectors.get(row.sector) || 0) + row.marketValue)

  const byValue = [...rows].sort((a, b) => b.marketValue - a.marketValue)
  const rankByTicker = new Map(byValue.map((r, i) => [r.ticker, i]))

  return {
    rows,
    byValue,
    rankByTicker,
    sectors,
    totalValue,
    totalCost,
    unrealized,
    unrealizedPercent: totalCost ? (unrealized / totalCost) * 100 : null,
    dayAbs,
    dayPercent,
    measuredCount: measured.length,
    // Bar scales. `|| 1` only guards the divide; a zero numerator still
    // yields a zero-width bar, which is correct.
    maxValue: Math.max(...rows.map((r) => r.marketValue), 0) || 1,
    maxAbsUnrealized: Math.max(...rows.map((r) => Math.abs(r.unrealized)), 0) || 1,
    sumAbsUnrealized: rows.reduce((sum, r) => sum + Math.abs(r.unrealized), 0) || 1,
  }
}

/** Search + sector narrowing, matching the design's `visible` predicate. */
export function filterHoldings(rows, { query = '', sector = '' } = {}) {
  const needle = query.trim().toLowerCase()

  return rows.filter((row) => {
    if (sector && row.sector !== sector) return false
    if (!needle) return true
    return (
      row.ticker.toLowerCase().includes(needle) ||
      String(row.name).toLowerCase().includes(needle) ||
      row.sector.toLowerCase().includes(needle)
    )
  })
}

/**
 * The sortable columns, keyed exactly as the ledger headers are.
 *
 * `of` returns null for anything unmeasured so `sortHoldings` can sink those
 * rows to the bottom in BOTH directions — a holding with no quote should never
 * win the top slot of a "best day" ordering by virtue of missing data.
 */
export const LEDGER_SORTS = {
  ticker: null, // string compare, handled separately
  qty: (r) => r.qty,
  basis: (r) => r.avgCost,
  price: (r) => (r.priceStale ? null : r.price),
  day: (r) => r.changePercent,
  value: (r) => r.marketValue,
  unrealized: (r) => r.unrealized,
  contribution: (r) => r.unrealized,
  weight: (r) => r.marketValue,
}

export function sortHoldings(rows, key = 'value', dir = -1) {
  const sorted = [...rows]

  if (key === 'ticker') {
    /*
     * `dir: 1` means ASCENDING here, exactly as it does for every numeric
     * column. The design file's own comparator negates the string compare
     * while its header still selects `dir: 1` for this column, so clicking
     * "Position" sorted Z→A under an arrow pointing up. That is a defect in
     * the mockup's logic rather than a design decision, and reproducing it
     * would make the one control that states its own direction lie about it.
     */
    return sorted.sort((a, b) => dir * a.ticker.localeCompare(b.ticker))
  }

  const of = LEDGER_SORTS[key] || LEDGER_SORTS.value
  return sorted.sort((a, b) => {
    const x = of(a)
    const y = of(b)
    // Unmeasured always sinks, whichever way the column is pointing.
    if (x === null && y === null) return 0
    if (x === null) return 1
    if (y === null) return -1
    return dir * (x - y)
  })
}

/**
 * The concentration ribbon's segments — by position or by sector.
 *
 * Weight is share of PORTFOLIO market value. There is no other whole it could
 * be a share of: Everest models no cash, so the positions are the portfolio.
 */
export function ribbonSegments(book, mode = 'positions') {
  if (!book.totalValue) return []

  if (mode === 'sectors') {
    const dayBySector = new Map()
    for (const row of book.rows) {
      if (!row.measured) continue
      dayBySector.set(row.sector, (dayBySector.get(row.sector) || 0) + row.dayAbs)
    }

    return [...book.sectors.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([sector, value]) => {
        const day = dayBySector.has(sector) ? dayBySector.get(sector) : null
        const prev = day === null ? null : value - day
        return {
          key: sector,
          label: sector,
          name: sector,
          value,
          weight: (value / book.totalValue) * 100,
          dayPercent: prev ? (day / prev) * 100 : null,
        }
      })
  }

  return book.byValue.map((row) => ({
    key: row.ticker,
    label: row.ticker,
    name: row.name,
    value: row.marketValue,
    weight: (row.marketValue / book.totalValue) * 100,
    dayPercent: row.changePercent,
  }))
}

/** The design's "Top 3 positions make up X% · largest is Y at Z%" sentence. */
export function concentrationSummary(segments) {
  if (segments.length === 0) return null
  const top = segments.slice(0, 3).reduce((sum, s) => sum + s.weight, 0)
  return {
    topCount: Math.min(3, segments.length),
    topWeight: top,
    largest: segments[0].label,
    largestWeight: segments[0].weight,
  }
}

/**
 * Footer totals over whatever the ledger is currently showing.
 *
 * `day` is null rather than 0 when nothing in view was measured, for the same
 * reason the book-level figure is.
 */
export function totalsOf(rows, book) {
  const measured = rows.filter((r) => r.measured)
  const value = rows.reduce((sum, r) => sum + r.marketValue, 0)
  const unrealized = rows.reduce((sum, r) => sum + r.unrealized, 0)
  const absUnrealized = rows.reduce((sum, r) => sum + Math.abs(r.unrealized), 0)

  return {
    count: rows.length,
    value,
    unrealized,
    day: measured.length ? measured.reduce((sum, r) => sum + r.dayAbs, 0) : null,
    // Share of the WHOLE book's absolute P/L, so the filtered figure answers
    // "how much of the portfolio's movement is this slice" rather than
    // trivially summing to 100% of itself.
    contribution: book.sumAbsUnrealized ? (unrealized / book.sumAbsUnrealized) * 100 : null,
    absUnrealized,
    weight: book.totalValue ? (value / book.totalValue) * 100 : 0,
  }
}

/**
 * A smoothed cubic path through `values`, in a `w x h` box.
 *
 * Ported from the approved design's own `smooth()` so the value band's curve
 * has the same tension as the mockup rather than recharts' `monotone`.
 */
export function smoothPath(values, w, h, pad = 0) {
  const points = values.filter((v) => typeof v === 'number' && !Number.isNaN(v))
  if (points.length < 2) return null

  const min = Math.min(...points)
  const max = Math.max(...points)
  const span = max - min || 1

  const pt = points.map((v, i) => [
    (i / (points.length - 1)) * w,
    pad + (1 - (v - min) / span) * (h - pad * 2),
  ])

  let d = `M${pt[0][0].toFixed(1)} ${pt[0][1].toFixed(1)}`
  for (let i = 0; i < pt.length - 1; i += 1) {
    const p0 = pt[i - 1] || pt[i]
    const p1 = pt[i]
    const p2 = pt[i + 1]
    const p3 = pt[i + 2] || pt[i + 1]
    d +=
      ` C${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(1)} ${(p1[1] + (p2[1] - p0[1]) / 6).toFixed(1)},` +
      `${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(1)} ${(p2[1] - (p3[1] - p1[1]) / 6).toFixed(1)},` +
      `${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`
  }
  return d
}

/**
 * Readable ink for a filled swatch — the design's `ink()`, WCAG contrast ratio
 * against white versus near-black. The ribbon's blue ramp spans light and dark
 * shades, so a fixed label colour would fail at one end of it.
 */
export function inkOn(hex) {
  const channel = (c) => {
    const v = c / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const L = 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
  return 1.05 / (L + 0.05) >= (L + 0.05) / 0.07 ? '#FFFFFF' : '#08132E'
}

/** The design's blue ramp, used by rank for both the ribbon and weight bars. */
export const RIBBON_BLUES = [
  '#1E4BD8',
  '#2F6BFF',
  '#4C82FF',
  '#1B49D6',
  '#6E9BFF',
  '#7FA6FF',
  '#8AAFFF',
  '#2A5FE0',
  '#A6C2FF',
  '#5488FF',
  '#B9CEFF',
  '#7AA2FF',
  '#C7D8FF',
]
