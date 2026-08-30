import { DEMO_HOLDINGS, DEMO_WATCHLIST } from './panels'

/**
 * THE FIELD — a real topographic surface computed from the book.
 *
 * The brief for section 03 is that contours must represent something financial
 * rather than decorate the page, so this file does the actual work: it builds a
 * scalar elevation field out of the portfolio, then extracts genuine iso-lines
 * from it with marching squares. Nothing here is drawn by hand.
 *
 * THE PROJECTION (stated on the map itself, because an unlabelled axis is a
 * decoration):
 *
 *   easting   sector, ordered by the sector's share of the book
 *   northing  session move, -2.7% at the bottom to +2.7% at the top
 *   elevation share of capital
 *
 * So a peak is a position, its height is how much of your money is in it, and
 * the contours are lines of equal weight. Where the rings crowd, capital is
 * concentrated — which is the one thing a plan view shows better than any
 * table, and it is read at a glance rather than computed.
 *
 * Everything is derived at module load from the same seeded product data the
 * rest of the page uses, so the map is identical on every render and every
 * visit, and it moves when the product data moves.
 */

/* Sectors are laid out left to right by their weight in the book, so the
   heaviest ground is nearest the origin and the eye reads the map in the order
   the capital is actually committed. */
const SECTOR_EASTING = {
  Technology: 0.19,
  Semiconductors: 0.35,
  Pharmaceuticals: 0.49,
  Retail: 0.63,
  Media: 0.8,
  Automobiles: 0.89,
}

/*
 * Nothing is plotted east of here. The elevation scale lives in the right
 * margin (see Terrain.jsx), and at the first attempt a watchlist mark at 0.93
 * landed on top of the 25% tick. A map reserves its margin for the scale.
 */

const MOVE_RANGE = 3.2

const northingFor = (change) => 0.5 - (change / MOVE_RANGE) * 0.34

/**
 * Spread names WITHIN their sector band, deterministically.
 *
 * Random jitter put AAPL and MSFT — both Technology, both near-flat on the
 * session — almost on top of each other, and their labels collided into an
 * unreadable stack. Distributing a sector's members evenly across a narrow band
 * guarantees separation, and it is also the more honest projection: they are
 * genuinely adjacent ground, not the same point.
 */
function spread(items, key) {
  const bySector = new Map()
  items.forEach((it) => {
    const k = it.sector
    if (!bySector.has(k)) bySector.set(k, [])
    bySector.get(k).push(it)
  })
  const out = new Map()
  bySector.forEach((members) => {
    members.forEach((m, idx) => {
      const n = members.length
      const offset = n === 1 ? 0 : (idx / (n - 1) - 0.5) * 0.16
      out.set(m[key], offset)
    })
  })
  return out
}

const HOLD_OFFSET = spread(DEMO_HOLDINGS, 'ticker')

/** Owned positions: these carry elevation. */
export const STATIONS = DEMO_HOLDINGS.map((h) => ({
  ...h,
  x: (SECTOR_EASTING[h.sector] ?? 0.5) + (HOLD_OFFSET.get(h.ticker) ?? 0),
  y: northingFor(h.change),
}))

/**
 * Watched names: SPOT HEIGHTS, not peaks.
 *
 * A surveyor marks a measured point with no contour around it when there is no
 * landform there. Nothing is invested in these, so they contribute nothing to
 * the field — they are positions on the map with no ground under them, which is
 * exactly the honest reading and needs no caption to explain.
 */
const WATCH_OFFSET = spread(DEMO_WATCHLIST, 'ticker')

export const SPOT_HEIGHTS = DEMO_WATCHLIST.map((w) => ({
  ...w,
  x: (SECTOR_EASTING[w.sector] ?? 0.5) + (WATCH_OFFSET.get(w.ticker) ?? 0),
  y: northingFor(w.change),
}))

/* ------------------------------------------------------------------ field */

const NX = 132
const NY = 84

/**
 * Peak width.
 *
 * At 0.115 every position merged into a single amoeba that filled the plate —
 * technically a correct sum of Gaussians and useless as a map: no summits, no
 * separation, nothing to read. 0.082 was still one landmass with a lobe. At
 * 0.055 the peak diameter falls below the spacing between sectors, so each
 * position raises its own hill and same-sector neighbours join along a saddle,
 * which is the one relationship worth showing.
 */
const SIGMA = 0.055

/** Contour interval, in percentage points of the book. */
export const INTERVAL = 2

/**
 * Build a terrain for a plate of a given shape.
 *
 * THE ASPECT HAS TO BE BAKED IN. A peak that is circular in normalised space
 * renders as an ellipse as wide as the plate is wide, so the field must know
 * the plate's proportions to produce summits that are round ON SCREEN — which
 * is the only place anyone looks at them.
 *
 * That is also why there are two of these. The phone plate is portrait, and
 * reusing the landscape field there would have stretched every summit sideways
 * into a smear. Two fields, each correct for its own sheet, is a few
 * milliseconds at module load and the alternative is a distorted map.
 */
function makeTerrain(w, h) {
  const ratio = h / w
  const field = new Float32Array(NX * NY)

  for (let j = 0; j < NY; j += 1) {
    const y = j / (NY - 1)
    for (let i = 0; i < NX; i += 1) {
      const x = i / (NX - 1)
      let v = 0
      for (const s of STATIONS) {
        const dx = x - s.x
        const dy = (y - s.y) * ratio
        v += s.weight * Math.exp(-(dx * dx + dy * dy) / (2 * SIGMA * SIGMA))
      }
      field[j * NX + i] = v
    }
  }

  const peak = Math.max(...field)

  /**
   * Marching squares.
   *
   * The standard 16-case lookup: classify each cell's four corners against the
   * level, then emit the segments crossing it with linear interpolation along
   * the edges. Saddle cases (5 and 10) emit both segments; resolving their
   * orientation consistently matters less than never dropping one, because a
   * missing segment shows up as a gap in a ring and the ground stops reading as
   * closed.
   */
  const segmentsAt = (level) => {
    const segs = []
    const at = (i, j) => field[j * NX + i]

    for (let j = 0; j < NY - 1; j += 1) {
      for (let i = 0; i < NX - 1; i += 1) {
        const tl = at(i, j)
        const tr = at(i + 1, j)
        const br = at(i + 1, j + 1)
        const bl = at(i, j + 1)

        let idx = 0
        if (tl > level) idx |= 8
        if (tr > level) idx |= 4
        if (br > level) idx |= 2
        if (bl > level) idx |= 1
        if (idx === 0 || idx === 15) continue

        const t = (a, b) => (level - a) / (b - a)
        const T = [i + t(tl, tr), j]
        const R = [i + 1, j + t(tr, br)]
        const B = [i + t(bl, br), j + 1]
        const L = [i, j + t(tl, bl)]

        switch (idx) {
          case 1: case 14: segs.push([L, B]); break
          case 2: case 13: segs.push([B, R]); break
          case 3: case 12: segs.push([L, R]); break
          case 4: case 11: segs.push([T, R]); break
          case 6: case 9: segs.push([T, B]); break
          case 7: case 8: segs.push([L, T]); break
          case 5: segs.push([L, T]); segs.push([B, R]); break
          case 10: segs.push([L, B]); segs.push([T, R]); break
          default: break
        }
      }
    }
    return segs
  }

  /* Highest ground first, so the sheet plots from the summits outward — the
     order a surveyor works in, and it means the biggest positions are legible
     before the fine detail arrives. */
  const levels = []
  for (let level = INTERVAL; level < peak; level += INTERVAL) levels.push(level)
  levels.reverse()

  const sx = w / (NX - 1)
  const sy = h / (NY - 1)
  const contours = levels.map((level) => ({
    level,
    index: (level / INTERVAL) | 0,
    d: segmentsAt(level)
      .map(
        ([a, b]) =>
          `M${(a[0] * sx).toFixed(1)},${(a[1] * sy).toFixed(1)}` +
          `L${(b[0] * sx).toFixed(1)},${(b[1] * sy).toFixed(1)}`,
      )
      .join(''),
  }))

  return { w, h, peak, contours }
}

/** The desktop sheet, and the phone sheet. */
export const SHEET_WIDE = makeTerrain(1600, 1000)
/* Square, not portrait. The five holdings' session moves span barely two
   percent, so the northing band is naturally shallow — on a 1000x1180 sheet
   that left the bottom third of the map empty. A square plate spends the
   phone's width on the axis the data actually uses. */
export const SHEET_TALL = makeTerrain(1000, 1000)
