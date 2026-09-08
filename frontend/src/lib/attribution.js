/**
 * Attribution — who moved the book today, in dollars.
 *
 * This is the measured half of AI Insights and it is deliberately pure: no
 * fetching, no clock, no model. Every number here is arithmetic over figures
 * the user already has on other screens, which is what lets the workspace say
 * "calculated directly from your Everest data" without qualification.
 *
 * THE ONE DEFINITION
 *
 *     contribution = shares × (current price − previous close)
 *
 * Not `market_value × change_percent`. That form is the portfolio route's
 * day-change figure and it is a different quantity — it evaluates to
 * shares × price × (price − prev) / prev, which overstates a riser and
 * understates a faller by the ratio price/prev. On a name up 8% that is an 8%
 * error in the attributed dollars, and the beam's whole claim is that its
 * widths ARE the dollars. So the beam computes its own leg from the two prices
 * and never reuses the aggregate.
 *
 * WHAT COUNTS AS MEASURABLE
 *
 * Both legs must be real provider reads. A holding with no live price is
 * carried at cost basis upstream (`price_stale`), and a holding with no
 * previous close has no yesterday to compare against. Either way the day's
 * contribution is UNKNOWN, and unknown is not zero: a $0 segment would tell
 * the user that name sat still, which is a claim we did not measure. Those
 * holdings are listed in `unmeasured` and the summary reports `complete:
 * false` so the UI can say the attribution is partial rather than implying it
 * accounts for the whole book.
 */

/** One holding's contribution to today, or an honest null. */
export function contributionOf(position) {
  const ticker = position?.ticker || ''
  const shares = typeof position?.qty === 'number' ? position.qty : null
  const price = typeof position?.current_price === 'number' ? position.current_price : null
  const prevClose =
    typeof position?.previous_close === 'number' ? position.previous_close : null

  // `price_stale` means `current_price` is standing in the user's cost basis.
  // Differencing a cost basis against yesterday's close would produce a number
  // that looks like a day move and is not one.
  const measurable =
    shares !== null &&
    price !== null &&
    prevClose !== null &&
    prevClose !== 0 &&
    !position?.price_stale

  return {
    ticker,
    company: position?.company || ticker,
    sector: position?.sector || 'Unknown',
    shares,
    price,
    prevClose,
    measurable,
    contribution: measurable ? shares * (price - prevClose) : null,
    dayPercent: measurable ? ((price - prevClose) / prevClose) * 100 : null,
    marketValue: typeof position?.market_value === 'number' ? position.market_value : null,
  }
}

/**
 * The whole book's attribution.
 *
 * Contributors and detractors are each sorted by magnitude, so the beam reads
 * outward from the anchor in order of impact.
 */
export function buildAttribution(positions = []) {
  const rows = positions.map(contributionOf)
  const measured = rows.filter((row) => row.measurable)
  const unmeasured = rows.filter((row) => !row.measurable)

  const contributors = measured
    .filter((row) => row.contribution > 0)
    .sort((a, b) => b.contribution - a.contribution)
  const detractors = measured
    .filter((row) => row.contribution < 0)
    .sort((a, b) => a.contribution - b.contribution)

  // A holding that genuinely did not move IS measured — it just belongs to
  // neither side. Counting it as flat is a statement we can support.
  const flat = measured.filter((row) => row.contribution === 0)

  const gainSum = contributors.reduce((sum, row) => sum + row.contribution, 0)
  const lossSum = Math.abs(detractors.reduce((sum, row) => sum + row.contribution, 0))

  return {
    rows,
    measured,
    unmeasured,
    contributors,
    detractors,
    flat,
    gainSum,
    lossSum,
    net: gainSum - lossSum,
    /** Sum of the market value the attribution actually covers. */
    coveredValue: measured.reduce((sum, row) => sum + (row.marketValue || 0), 0),
    complete: rows.length > 0 && unmeasured.length === 0,
    hasData: measured.length > 0,
  }
}

/**
 * Beam geometry, in percentages of the track.
 *
 * Detractors stack leftward from the previous-close anchor, contributors
 * rightward, both on ONE dollar scale — so a given width is the same number of
 * dollars on either side and the net is the visible difference between the two
 * runs rather than a figure taken on trust. The anchor lands wherever the two
 * sides balance, which is why no space is left over.
 */
const TRACK_PADDING = 2

export function layoutBeam(attribution) {
  const { contributors, detractors, gainSum, lossSum, net } = attribution
  const span = gainSum + lossSum

  if (!span) {
    return { segments: [], zeroX: 50, netX: 50, hasSpan: false }
  }

  // Percent of track per dollar.
  const unit = (100 - TRACK_PADDING * 2) / span
  const zeroX = TRACK_PADDING + lossSum * unit

  const segments = []

  let offset = 0
  contributors.forEach((row, index) => {
    const width = row.contribution * unit
    segments.push({
      key: `up-${row.ticker}`,
      row,
      side: 'contributor',
      x: zeroX + offset,
      width,
      // Successive names step down in strength so the beam reads as an
      // ordered run rather than one undifferentiated block of green.
      mix: Math.max(38, 92 - index * 11),
      delay: index * 45,
      shareOfSide: row.contribution / gainSum,
    })
    offset += width
  })

  offset = 0
  detractors.forEach((row, index) => {
    const width = Math.abs(row.contribution) * unit
    offset += width
    segments.push({
      key: `down-${row.ticker}`,
      row,
      side: 'detractor',
      x: zeroX - offset,
      width,
      mix: Math.max(38, 92 - index * 13),
      delay: index * 45,
      shareOfSide: Math.abs(row.contribution) / lossSum,
    })
  })

  return {
    segments,
    zeroX,
    netX: zeroX + net * unit,
    hasSpan: true,
  }
}

/**
 * Which segments are wide enough to carry a label without colliding.
 *
 * Labels alternate rows so two adjacent names do not overlap, and anything
 * narrower than the threshold goes unlabelled rather than clipped — the
 * tooltip still names it.
 */
const LABEL_MIN_WIDTH = 7

export function beamLabels(layout, { max = 5 } = {}) {
  return layout.segments
    .filter((segment) => segment.width >= LABEL_MIN_WIDTH)
    .sort((a, b) => b.width - a.width)
    .slice(0, max)
    .map((segment, index) => ({
      key: segment.key,
      ticker: segment.row.ticker,
      contribution: segment.row.contribution,
      side: segment.side,
      x: segment.x + segment.width / 2,
      row: index % 2,
    }))
}
