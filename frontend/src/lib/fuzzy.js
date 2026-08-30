/**
 * Small fuzzy matcher tuned for ticker/company lookup.
 *
 * Returns match ranges alongside the score so the UI can highlight exactly
 * the characters that matched — no second pass, no guessing.
 */

/**
 * Greedy subsequence match. Returns merged [start, end) ranges, or null.
 * Consecutive runs are preferred implicitly because we always take the
 * earliest possible position for each query character.
 */
export function matchRanges(text, query) {
  if (!query) return []
  const haystack = text.toLowerCase()
  const needle = query.toLowerCase()

  const ranges = []
  let cursor = 0

  for (const char of needle) {
    const found = haystack.indexOf(char, cursor)
    if (found === -1) return null

    const last = ranges[ranges.length - 1]
    if (last && last[1] === found) last[1] = found + 1
    else ranges.push([found, found + 1])

    cursor = found + 1
  }

  return ranges
}

function longestRun(ranges) {
  return ranges.reduce((max, [start, end]) => Math.max(max, end - start), 0)
}

/**
 * Score one equity against a query. Higher is better; null means no match.
 *
 * Ordering intent, strongest first:
 *   exact ticker  >  ticker prefix  >  name prefix  >  name word prefix
 *   >  ticker subsequence  >  name subsequence
 */
export function scoreEquity(equity, query) {
  const q = query.trim().toLowerCase()
  if (!q) return null

  const ticker = equity.ticker.toLowerCase()
  const name = equity.name.toLowerCase()

  // Exact ticker — always wins.
  if (ticker === q) {
    return { score: 1000, tickerRanges: [[0, equity.ticker.length]], nameRanges: [] }
  }

  if (ticker.startsWith(q)) {
    return { score: 900 - ticker.length, tickerRanges: [[0, q.length]], nameRanges: [] }
  }

  if (name.startsWith(q)) {
    return { score: 800 - name.length / 100, tickerRanges: [], nameRanges: [[0, q.length]] }
  }

  // Start of any word in the company name ("home" -> The *Home* Depot).
  const wordStart = name.indexOf(` ${q}`)
  if (wordStart !== -1) {
    return {
      score: 700 - wordStart,
      tickerRanges: [],
      nameRanges: [[wordStart + 1, wordStart + 1 + q.length]],
    }
  }

  const tickerRanges = matchRanges(equity.ticker, q)
  if (tickerRanges) {
    return { score: 600 + longestRun(tickerRanges) * 10 - ticker.length, tickerRanges, nameRanges: [] }
  }

  const nameRanges = matchRanges(equity.name, q)
  if (nameRanges) {
    return {
      score: 400 + longestRun(nameRanges) * 10 - nameRanges[0][0],
      tickerRanges: [],
      nameRanges,
    }
  }

  return null
}

/**
 * Split text into [{ text, match }] segments for highlighted rendering.
 * Keeps highlight logic out of components.
 */
export function highlightSegments(text, ranges = []) {
  if (!ranges.length) return [{ text, match: false }]

  const segments = []
  let cursor = 0

  for (const [start, end] of ranges) {
    if (start > cursor) segments.push({ text: text.slice(cursor, start), match: false })
    segments.push({ text: text.slice(start, end), match: true })
    cursor = end
  }

  if (cursor < text.length) segments.push({ text: text.slice(cursor), match: false })
  return segments
}
