/**
 * Squarified treemap layout.
 *
 * WHY A TREEMAP AT ALL: the Dashboard's allocation module answers one question —
 * "how is my money distributed" — and it has to answer it pre-attentively, in a
 * cell roughly a third of the page wide. Columns rank well but spend their
 * height on the largest item and leave the tail unreadable; a treemap gives
 * every position an AREA proportional to its weight, so a 2% holding is
 * visibly 2% rather than a stub.
 *
 * The algorithm is Bruls/Huizing/van Wijk squarification: greedily grow a row
 * along the shorter side of the remaining rectangle for as long as doing so
 * improves the worst aspect ratio in that row, then lay the row out and recurse
 * on what is left. Squarish tiles matter because area is only judgeable when
 * the shapes are comparable — a 1:40 sliver reads as smaller than a square of
 * the same area.
 *
 * Pure geometry, no rendering and no colour: kept separate so it is testable
 * and so the Dashboard's treemap stays the only thing that decides how a tile
 * LOOKS. Coordinates come back in the same units as the `width`/`height` passed
 * in, so callers typically pass 100/100 and emit percentages.
 */

/**
 * @param {Array<{ key: string, value: number }>} items
 * @param {number} width
 * @param {number} height
 * @returns {Array<{ key, value, x, y, w, h }>} laid-out tiles, largest first
 */
export function squarify(items, width = 100, height = 100) {
  const positive = items
    .filter((item) => Number.isFinite(item.value) && item.value > 0)
    .sort((a, b) => b.value - a.value)

  if (positive.length === 0 || width <= 0 || height <= 0) return []

  const out = []
  let remaining = positive
  let x = 0
  let y = 0
  let w = width
  let h = height

  // Bounded: each pass removes at least one item, but the guard keeps a
  // degenerate input (zero-area rect, NaN leaking in) from spinning forever.
  let guard = 0
  while (remaining.length > 0 && guard++ < 1000) {
    if (remaining.length === 1) {
      out.push({ ...remaining[0], x, y, w, h })
      break
    }

    const total = remaining.reduce((sum, item) => sum + item.value, 0)
    const short = Math.min(w, h)
    const area = w * h

    if (total <= 0 || short <= 0 || area <= 0) break

    // Grow the row while the worst aspect ratio keeps improving.
    let best = 1
    let bestWorst = Infinity
    for (let k = 1; k <= remaining.length; k += 1) {
      const row = remaining.slice(0, k)
      const sum = row.reduce((acc, item) => acc + item.value, 0)
      const length = ((sum / total) * area) / short

      let worst = 0
      for (const item of row) {
        const side = (item.value / sum) * short
        worst = Math.max(
          worst,
          side > 0 && length > 0 ? Math.max(side / length, length / side) : Infinity,
        )
      }

      if (worst < bestWorst) {
        bestWorst = worst
        best = k
      } else {
        // Ratios are unimodal along k — once it worsens it keeps worsening.
        break
      }
    }

    const row = remaining.slice(0, best)
    remaining = remaining.slice(best)

    const sum = row.reduce((acc, item) => acc + item.value, 0)
    const fraction = sum / total

    if (w >= h) {
      // Lay the row down the left edge, then advance x.
      const rowW = w * fraction
      let cy = y
      let used = 0
      row.forEach((item, index) => {
        // Last tile absorbs the rounding remainder so rows close exactly.
        const rowH = index === row.length - 1 ? h - used : h * (item.value / sum)
        out.push({ ...item, x, y: cy, w: rowW, h: rowH })
        cy += rowH
        used += rowH
      })
      x += rowW
      w -= rowW
    } else {
      // Lay the row across the top edge, then advance y.
      const rowH = h * fraction
      let cx = x
      let used = 0
      row.forEach((item, index) => {
        const rowW = index === row.length - 1 ? w - used : w * (item.value / sum)
        out.push({ ...item, x: cx, y, w: rowW, h: rowH })
        cx += rowW
        used += rowW
      })
      y += rowH
      h -= rowH
    }
  }

  return out
}
