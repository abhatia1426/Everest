import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { motion, useReducedMotion, useScroll, useTransform } from 'motion/react'

import { CompanyLogo } from '../ui/CompanyLogo'
import { fmtPercent, fmtSignedMoney } from '../../lib/format'
import { MassifContours, VIEW } from './everest'
import { MaskedLine } from './motion'
import { TextEffect } from './primitives'
import {
  BAND,
  BOOK,
  COVERED,
  GROUND,
  INDICES,
  LEAD,
  NAMES,
  STATIONS,
  extent,
} from './market.data'

/**
 * 05 — MARKET.
 *
 * THE SECTION LINE.
 *
 * A surveyor maps in plan, then cuts a section. Section 03 is the plan view —
 * the book seen from above, contoured by weight. This is the cut: the same
 * survey turned ninety degrees so you are looking at the ground edge-on, with
 * the market as the terrain and today's move as the elevation.
 *
 * That change of PROJECTION is the whole argument of the transition. It is not
 * another map, and it is deliberately not a time series either — an intraday
 * chart is what every other product puts here, and it would make this a
 * mountain website with a stock chart in it. A section reads as an instrument
 * because a section IS one.
 *
 * WHAT IT SAYS, before a single label is read:
 *
 *   · the ground rises and falls — sectors moved differently today
 *   · the band across the frame is where the indices closed — the horizon
 *   · ground above the band beat the market; ground below it did not
 *   · the ground simply STOPS — that is the limit of what you own, and past it
 *     watched names hang over open country with nothing underneath them
 *   · names scatter around their own sector's ridge — AMD sits two points below
 *     the Semiconductors ground that NVDA defines, in the same sector
 *
 * HIERARCHY. One dominant object (the ridge), one dominant name (the heaviest
 * position, which is also the high ground), a quiet band, quieter spot heights,
 * and a nearly invisible structure behind. Nothing else competes.
 *
 * NOT PINNED, and about 115vh. The composition is complete the moment it is on
 * screen; scroll only paces the survey.
 */

/* ============================================================== the sheets */

/**
 * TWO SHEETS, NOT ONE SCALED DOWN.
 *
 * The wide sheet carries every name and the full vertical extent those names
 * demand — TSLA at +2.68% and AMD at −1.93% set the frame. At phone width that
 * same extent squeezes the ridge's 2.4 points of relief into a fifth of the
 * plate and the landscape flattens into a rule. So the compact sheet drops to
 * the four sectors that carry ground and the five names inside them, and takes
 * its extent from those — the same drawing, surveyed at a coarser scale, which
 * is what a real sheet does rather than shrinking its lettering.
 */
const SHEETS = {
  wide: {
    w: 1600,
    h: 660,
    padTop: 78,
    padBot: 122,
    /* The plot starts well inside the frame so the drawing has a left margin
       for its key, mirroring the elevation scale on the right. Instrument
       first, picture inside it — the ground still bleeds off the edge beneath
       the key, so nothing about the market looks bounded. */
    x0: 250,
    x1: 1360,
    axisX: 1400,
    padHi: 0.4,
    padLo: 0.42,
    stations: STATIONS,
    watched: true,
    spots: true,
  },
  compact: {
    w: 720,
    h: 620,
    padTop: 54,
    padBot: 108,
    x0: 34,
    x1: 656,
    axisX: 668,
    padHi: 0.45,
    padLo: 0.55,
    stations: GROUND,
    watched: false,
    /*
     * NO LETTERING ON THE PLATE AT ALL.
     *
     * Measured at 390px: AAPL's flag ran to x=-46, off the left edge of the
     * sheet, and its figure sat on top of the datum key. Five fixed-size
     * annotations cannot share a 380px plate — so the phone gets the drawing
     * clean (ridge, band, datum, four stations) and every name in the ledger
     * beneath it. That is what a survey sheet does when the ground is crowded,
     * and it leaves the phone with a composition rather than a pile.
     */
    spots: false,
  },
}

/**
 * Station names, short enough for a 95px cell.
 *
 * "Semiconductors" set at the label's tracking is 130px wide; four of them on a
 * 380px plate overlapped by 53px, measured. Abbreviating is the only honest fix
 * — rotating or shrinking the lettering would make it unreadable instead of
 * overlapping, which is not an improvement.
 */
const SHORT = {
  Technology: 'Tech',
  Semiconductors: 'Semis',
  Pharmaceuticals: 'Pharma',
  Automobiles: 'Autos',
}

/** The whole coordinate system for a sheet, derived once. */
function geom(sheet) {
  const marks = sheet.stations.flatMap((s) => [...s.names, ...(sheet.watched ? s.watched : [])])
  const ext = extent(
    marks.map((m) => m.change),
    sheet.padHi,
    sheet.padLo,
  )
  const plotH = sheet.h - sheet.padTop - sheet.padBot
  const px = plotH / (ext.hi - ext.lo)
  const cell = (sheet.x1 - sheet.x0) / sheet.stations.length

  const yFor = (p) => sheet.padTop + (ext.hi - p) * px
  const cx = (i) => sheet.x0 + cell * (i + 0.5)

  /* Whole-percent rungs only, and only those the plate actually contains. A
     scale with a clipped label is worse than no scale. */
  const ticks = []
  for (let v = Math.ceil(ext.lo); v <= Math.floor(ext.hi); v += 1) ticks.push(v)

  return { ...sheet, ext, px, cell, yFor, cx, ticks, plotBottom: sheet.padTop + plotH }
}

/**
 * SPOT HEIGHTS, PLACED.
 *
 * A name sits at its own move (elevation) on its own sector's easting. Where a
 * sector holds two positions they straddle the node, which is exactly right:
 * the ridge passes through their weighted mean, so the drawing shows the mean
 * AND the dispersion around it without a word of explanation.
 *
 * Watched names over held ground are offset clear of the node instead, so they
 * read as additional to the ridge rather than as part of what defines it.
 */
function placeMarks(g) {
  const out = []

  g.stations.forEach((s, i) => {
    const c = g.cx(i)
    const span = g.cell * 0.5

    s.names.forEach((h, k) => {
      const solo = s.names.length === 1
      const t = solo ? 0 : (k / (s.names.length - 1)) * 2 - 1
      out.push({
        ...h,
        held: true,
        lead: h.ticker === LEAD.ticker,
        sector: s.sector,
        x: c + t * span * 0.52,
        y: g.yFor(h.change),
        /*
         * A LABEL THAT HANGS AWAY FROM ITS NEIGHBOUR.
         *
         * Two names in one sector sit a cell-width apart at most, and a
         * centred label is wider than that — AAPL's ran straight through
         * MSFT's. Flagging the western name to the west and the eastern one
         * to the east makes the pair diverge instead of collide, which is
         * exactly how a survey sheet annotates two marks on one station.
         */
        side: solo ? 'above' : k === 0 ? 'left' : 'right',
      })
    })

    if (!g.watched) return

    s.watched.forEach((w, k) => {
      const t = s.watched.length === 1 ? 0 : (k / (s.watched.length - 1)) * 2 - 1
      const off = s.weight > 0 ? span * 0.6 : 0
      out.push({
        ...w,
        held: false,
        lead: false,
        sector: s.sector,
        x: c + off + t * span * 0.46,
        y: g.yFor(w.change),
      })
    })
  })

  return out
}

/**
 * A ridge through the section nodes.
 *
 * Catmull-Rom, with every control point CLAMPED to the vertical range of the
 * segment it governs. Unclamped, the spline overshoots its nodes — it would
 * have drawn the Semiconductors ground higher than +1.65%, which on a financial
 * surface is not a smoothing artefact, it is a line claiming a number that did
 * not happen. Terrain may be smooth; it may not exceed its own summit.
 */
function ridgePath(pts, tension = 0.2) {
  if (pts.length < 2) return ''
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`

  for (let i = 0; i < pts.length - 1; i += 1) {
    const p0 = pts[i - 1] ?? pts[i]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2] ?? p2

    const lo = Math.min(p1[1], p2[1])
    const hi = Math.max(p1[1], p2[1])
    const clamp = (v) => Math.min(hi, Math.max(lo, v))

    const c1x = p1[0] + (p2[0] - p0[0]) * tension
    const c1y = clamp(p1[1] + (p2[1] - p0[1]) * tension)
    const c2x = p2[0] - (p3[0] - p1[0]) * tension
    const c2y = clamp(p2[1] - (p3[1] - p1[1]) * tension)

    d += `C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`
  }

  return d
}

/**
 * This section needs its own breakpoint, for the same reason 03 does: the
 * annotations are fixed-size while the plate scales, so the sheet has to change
 * rather than shrink. Kept local so the frozen `Scene` breakpoint is untouched.
 */
function useSheetSize() {
  const [size, setSize] = useState({ compact: false, terse: false })

  useEffect(() => {
    /*
     * TWO THRESHOLDS, because two different things break.
     *
     * `compact` (<1024) swaps the whole sheet. `terse` (<1280) only shortens
     * the station names: measured at 1024 the cells are 117px and
     * "Pharmaceuticals" sets 134px wide, so it ran 17px into "Semiconductors".
     * Swapping sheets over a label collision would be a sledgehammer.
     */
    const wide = window.matchMedia('(max-width: 1023px)')
    const mid = window.matchMedia('(max-width: 1279px)')
    const apply = () => setSize({ compact: wide.matches, terse: mid.matches })
    apply()
    wide.addEventListener('change', apply)
    mid.addEventListener('change', apply)
    return () => {
      wide.removeEventListener('change', apply)
      mid.removeEventListener('change', apply)
    }
  }, [])

  return size
}

/* ============================================================== the section */

export function Market() {
  const surfaceRef = useRef(null)
  const reduce = useReducedMotion()
  const { compact, terse } = useSheetSize()
  const uid = useId().replace(/:/g, '')

  const g = useMemo(() => geom(compact ? SHEETS.compact : SHEETS.wide), [compact])
  const marks = useMemo(() => placeMarks(g), [g])

  const { w: W, h: H } = g
  const baseY = g.yFor(0)
  const bookY = g.yFor(BOOK)
  const bandTop = g.yFor(BAND.hi)
  const bandBottom = g.yFor(BAND.lo)

  /* The ground bleeds off the left edge — the market did not begin at the frame
     — and stops dead at the last sector carrying capital. */
  const leftEdge = -0.05 * W
  const groundEnd = g.cx(GROUND.length - 1)
  const nodes = [
    [leftEdge, g.yFor(GROUND[0].change)],
    ...GROUND.map((s, i) => [g.cx(i), g.yFor(s.change)]),
  ]
  const ridge = ridgePath(nodes)
  /* The ground is bounded below by the section's own base line, not by the
     bottom of the plate. Running it to the frame edge put a tinted block behind
     half the station lettering and left the other half on bare page — the label
     row read as two different rows. A section drawing has a base; this is it. */
  const baseLine = g.plotBottom + 14
  const land = `${ridge}L${groundEnd.toFixed(1)},${baseLine}L${leftEdge.toFixed(1)},${baseLine}Z`

  const lead = marks.find((m) => m.lead)
  const leadMove = (LEAD.value * LEAD.change) / 100
  const HELD = NAMES.filter((n) => n.held)

  /*
   * MEASURED ON THE SURFACE, NOT THE SECTION.
   *
   * The heading is most of a screen tall; driving the timeline from the section
   * meant the survey had finished before the plate was visible. Anchoring to
   * the plate makes the drawing happen while the reader is looking at it.
   *
   * The range ENDS while the whole plate is still on screen. Taken to the
   * conventional 'end 0.5' the survey only completed once the plate's top had
   * left the viewport, so the finished drawing — the thing the section exists
   * to show — was never once visible in full.
   */
  const { scrollYProgress } = useScroll({
    target: surfaceRef,
    offset: ['start 0.95', 'end 0.78'],
  })

  /* THE CARRY, on one timeline. Section 04's contours are still on the page,
     nearly gone; here they collapse onto the datum in the same gesture that
     draws the ridge, so the handover reads as one instrument changing mode
     rather than as two graphics crossfading. */
  const flatten = useTransform(scrollYProgress, [0, 0.42], [1, 0.055])
  /* Section 04 leaves the contours at 0.12 of `--border-strong`, which on the
     dark sheet is about 1.5% alpha — present in the file, invisible on screen.
     Carrying a thing the reader cannot see is not a transition, so Market draws
     the same geometry against `--text-tertiary` instead: the massif is faintly
     THERE when the plate arrives, and flattens onto the datum as the ridge
     draws. Nothing about section 04 changes; only this render of it. */
  const ghost = useTransform(scrollYProgress, [0.04, 0.46], [0.16, 0.035])

  /* The horizon establishes before the terrain does. */
  const horizon = useTransform(scrollYProgress, [0.02, 0.3], [0, 1])
  const draw = useTransform(scrollYProgress, [0.18, 0.72], [0, 1])
  const fill = useTransform(scrollYProgress, [0.4, 0.82], [0, 1])

  return (
    <section id="market" className="relative overflow-hidden pb-[9vh] pt-[8vh]">
      {/* ------------------------------------------------------------- sky */}
      {/*
        HIGH-ALTITUDE AIR, not a background wash. One vertical gradient that
        sits densest at the horizon band and thins to nothing above and below,
        plus a single soft light over the high ground. Both are expressed in the
        theme's accent so the dark sheet reads as night at altitude and the
        light one as alpine daylight — the same air, a different hour.
      */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 top-[18%]"
        aria-hidden="true"
        style={{
          background:
            'linear-gradient(180deg, transparent 0%, rgb(var(--accent-blue-rgb) / 0.06) 46%, transparent 88%)',
        }}
      />

      {/* --------------------------------------------------------- heading */}
      <div className="mx-auto w-full max-w-[1240px] px-[var(--space-page)]">
        <div className="max-w-[560px]">
          <p className="e-label mb-6 flex items-center gap-3">
            <span
              className="h-px w-8 shrink-0"
              style={{ background: 'currentColor', opacity: 0.5 }}
              aria-hidden="true"
            />
            05 — Market
          </p>

          <h2 className="e-title">
            <MaskedLine>The market</MaskedLine>
            <MaskedLine delay={0.08}>
              <span style={{ color: 'var(--text-secondary)' }}>has high ground.</span>
            </MaskedLine>
          </h2>

          <TextEffect className="e-lead mt-7 max-w-[var(--e-measure)]" delay={0.15}>
            A section cut through the session. Ground rises where your capital is; the band across
            it is where the indices closed. Above the band is high ground.
          </TextEffect>
        </div>
      </div>

      {/* -------------------------------------------------------- the plate */}
      {/*
        NO NEATLINE.

        Section 03 is a bounded sheet with a ruled edge and a title block. This
        one runs off the page on purpose: a map has edges, a market does not.
        The absence of the frame is what stops the two sections reading as the
        same drawing twice.
      */}
      <div className="relative mt-12 w-full lg:mt-16">
        {/* THE CARRIED OBJECT — section 04's contours, flattening onto the
            datum. The genuine `MassifContours` the Portfolio section renders
            behind itself, at the same opacity it leaves them at, so the reader
            sees one continuous object rather than a lookalike. */}
        <motion.div
          className="pointer-events-none absolute inset-0"
          aria-hidden="true"
          style={{ opacity: reduce ? 0.045 : ghost }}
        >
          <svg
            className="h-full w-full"
            viewBox={`0 0 ${VIEW.w} ${VIEW.h}`}
            preserveAspectRatio="xMidYMid slice"
          >
            {/*
              `originY`, NOT `transformOrigin`.

              Motion builds an SVG group's transform-origin from originX/originY
              and writes it into style itself, so a raw `transformOrigin` in the
              same style object is silently overwritten with its 50% default —
              verified in the DOM, which reported "50% 50%" for the string this
              component was passing. The contours were collapsing about the
              middle of the massif rather than onto the datum.
            */}
            <motion.g
              style={{
                scaleY: reduce ? 0.055 : flatten,
                originX: 0.5,
                originY: 0.56,
              }}
            >
              <MassifContours count={7} stroke="var(--text-tertiary)" />
            </motion.g>
          </svg>
        </motion.div>

        <div ref={surfaceRef} className="relative w-full" style={{ aspectRatio: `${W} / ${H}` }}>
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="absolute inset-0 h-full w-full"
            aria-hidden="true"
          >
            <defs>
              <clipPath id={`${uid}-ground`}>
                <path d={land} />
              </clipPath>
              <linearGradient
                id={`${uid}-base`}
                x1="0"
                y1={g.padTop}
                x2="0"
                y2={baseLine}
                gradientUnits="userSpaceOnUse"
              >
                <stop offset="0%" stopColor="var(--accent-blue)" stopOpacity="0.19" />
                <stop offset="100%" stopColor="var(--accent-blue)" stopOpacity="0.02" />
              </linearGradient>
              <radialGradient id={`${uid}-light`}>
                <stop offset="0%" stopColor="var(--accent-blue)" stopOpacity="0.14" />
                <stop offset="100%" stopColor="var(--accent-blue)" stopOpacity="0" />
              </radialGradient>
            </defs>

            {/* 1. One soft light over the high ground. */}
            <ellipse
              cx={g.cx(1)}
              cy={g.yFor(GROUND[1]?.change ?? 0)}
              rx={g.cell * 1.5}
              ry={g.cell * 0.85}
              fill={`url(#${uid}-light)`}
            />

            {/* 2. SECTION MARKERS. The quietest structure on the plate: one
                   hairline per easting, so the reader can see the section is
                   divided into ground rather than being a continuous curve. */}
            <g stroke="var(--grid-line)" strokeWidth="1">
              {g.stations.map((s, i) => (
                <line key={s.sector} x1={g.cx(i)} x2={g.cx(i)} y1={g.padTop} y2={g.plotBottom} />
              ))}
            </g>

            {/* 3. THE HORIZON — where the three indices closed, drawn as a band
                   because that is how it is read: above it you beat the market,
                   below it you did not, inside it the difference is noise. It
                   arrives first, extending from the left, because a landscape
                   needs its horizon before it needs its terrain. */}
            {/* Same reason as the contour group: `originX: 0` is the only way
                to make this extend from the left edge. With the raw property it
                grew outward from the centre, which reads as a line appearing
                rather than as a horizon being surveyed. */}
            <motion.g style={{ scaleX: reduce ? 1 : horizon, originX: 0, originY: 0.5 }}>
              <rect
                x="0"
                y={bandTop}
                width={W}
                height={bandBottom - bandTop}
                fill="var(--accent-blue)"
                opacity="0.07"
              />
              {INDICES.map((idx) => (
                <line
                  key={idx.label}
                  x1="0"
                  x2={W}
                  y1={g.yFor(idx.change)}
                  y2={g.yFor(idx.change)}
                  stroke="var(--border-strong)"
                  /* The top edge is the one that decides something — above it
                     you beat every index on the board — so it carries the
                     weight and the two beneath it stay hairlines. */
                  strokeWidth={idx.change === BAND.hi ? 1.4 : 1}
                />
              ))}

              {/* 4. THE DATUM. Section 02 measured against a datum line and 03
                     against a share-of-book scale; here the same rule is the
                     market's zero. It is the one line drawn solid across the
                     whole frame because everything else is read against it. */}
              <line
                x1="0"
                x2={W}
                y1={baseY}
                y2={baseY}
                stroke="var(--border-strong)"
                strokeWidth="1.25"
              />

              {/* 5. THE BOOK LINE — the weighted move of the named positions.
                     The one mark on the drawing that is about you rather than
                     about the market, which is why it is the only dashed
                     accent on the plate. */}
              <line
                x1="0"
                x2={W}
                y1={bookY}
                y2={bookY}
                stroke="var(--accent-blue)"
                strokeWidth="1.25"
                strokeDasharray="2 7"
                opacity="0.75"
              />
            </motion.g>

            {/* 6. THE GROUND.
                   A landmass, not an area fill. It runs to the bottom of the
                   frame so the ridge reads as the top of something solid, and
                   inside it each sector's cell is tinted in proportion to the
                   capital held there — the hypsometric wash of section 03,
                   restated as strata seen edge-on. Where the tint is dense,
                   your money is. */}
            <motion.g
              clipPath={`url(#${uid}-ground)`}
              style={{ opacity: reduce ? 1 : fill }}
            >
              <rect x={leftEdge} y="0" width={W} height={H} fill={`url(#${uid}-base)`} />
              {GROUND.map((s, i) => (
                <rect
                  key={s.sector}
                  x={i === 0 ? leftEdge : g.cx(i) - g.cell / 2}
                  y="0"
                  width={i === 0 ? g.cx(0) + g.cell / 2 - leftEdge : g.cell}
                  height={H}
                  fill="var(--accent-blue)"
                  opacity={0.03 + (s.weight / 100) * 0.16}
                />
              ))}
            </motion.g>

            {/* 7. THE RIDGE — the one dominant object. */}
            <motion.path
              d={ridge}
              fill="none"
              stroke="var(--accent-blue)"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ pathLength: reduce ? 1 : draw }}
            />

            {/* 8. THE SCARP. The ground does not fade out, it ENDS — this is
                   the limit of what you own, and the vertical break says so
                   more plainly than a caption could. */}
            <motion.line
              x1={groundEnd}
              x2={groundEnd}
              y1={g.yFor(GROUND[GROUND.length - 1].change)}
              y2={baseLine}
              stroke="var(--accent-blue)"
              strokeWidth="1"
              strokeDasharray="2 5"
              opacity="0.5"
              style={{ opacity: reduce ? 0.5 : fill }}
            />

            {/* 9. THE SIGHT LINE. A single dropped hairline under the heaviest
                   position — the one name the drawing lets speak — in the same
                   grammar as 03's triangulation marks. */}
            {lead ? (
              <motion.line
                x1={lead.x}
                x2={lead.x}
                y1={lead.y}
                y2={baseY}
                stroke="var(--accent-blue)"
                strokeWidth="1"
                opacity="0.4"
                style={{ opacity: reduce ? 0.4 : fill }}
              />
            ) : null}

            {/* 10. THE ELEVATION SCALE, on the right.
                    Section 02 put its altitude axis at this column labelled in
                    metres, and 03 relabelled the same column in share of book.
                    Here it is again, in percent moved — the axis has not shifted
                    across three sections, only its units have, which is the
                    transition stated as an object rather than asserted in copy. */}
            <g>
              <line
                x1={g.axisX}
                x2={g.axisX}
                y1={g.padTop}
                y2={g.plotBottom}
                stroke="var(--border-strong)"
                strokeWidth="1"
              />
              {g.ticks.map((v) => (
                <line
                  key={v}
                  x1={g.axisX - 7}
                  x2={g.axisX}
                  y1={g.yFor(v)}
                  y2={g.yFor(v)}
                  stroke="var(--border-strong)"
                  strokeWidth="1"
                />
              ))}
            </g>

            {/* 11. Section stations along the foot of the plate. */}
            <g>
              <line
                x1={g.x0}
                x2={g.x1}
                y1={g.plotBottom + 14}
                y2={g.plotBottom + 14}
                stroke="var(--border)"
                strokeWidth="1"
              />
              {g.stations.map((s, i) => (
                <line
                  key={s.sector}
                  x1={g.cx(i)}
                  x2={g.cx(i)}
                  y1={g.plotBottom + 14}
                  y2={g.plotBottom + 24}
                  stroke="var(--border-strong)"
                  strokeWidth="1"
                />
              ))}
            </g>
          </svg>

          {/* ------------------------------------------------- annotations */}
          {/*
            HTML, not SVG text. SVG lettering scales with the plate, so one font
            size reads as a whisper on a phone and as a headline on a tablet. In
            the HTML layer every label is the same size everywhere, and the real
            `CompanyLogo` can be used rather than a drawn stand-in.
          */}

          {/* The elevation scale's rungs. */}
          {g.ticks.map((v) => (
            <span
              key={v}
              className="num absolute -translate-y-1/2 text-[11px] text-text-tertiary"
              style={{ left: `${((g.axisX + 10) / W) * 100}%`, top: `${(g.yFor(v) / H) * 100}%` }}
            >
              {v > 0 ? `+${v}` : v}%
            </span>
          ))}

          {/* The horizontal references, keyed at the left edge in altitude
              order — the reading order of a landscape. */}
          {/* The index range is dropped on the phone: at 380px it is a third of
              the sheet wide and the two figures are already in the edge
              annotation beneath the drawing. */}
          <Reference
            top={(bandTop / H) * 100}
            label="Indices"
            value={compact ? null : `${fmtPercent(BAND.lo)} → ${fmtPercent(BAND.hi)}`}
          />
          {/*
            NAMED FOR WHAT IT ACTUALLY MEASURES.

            Section 04 publishes the whole book's day at +1.36% across 14
            positions. This line is the weighted move of the five positions the
            drawing plots, which is a different number — labelling it "your
            book" would have put two different figures for the same thing on one
            page, and a reader who noticed would be right to stop trusting both.
          */}
          <Reference
            top={(bookY / H) * 100}
            label={`Top ${HELD.length} held`}
            value={fmtPercent(BOOK)}
            accent
          />
          {/* No value on the datum: it is zero by definition, and the extra
              lettering was the only thing reaching far enough right to crowd
              the westernmost spot height. */}
          <Reference top={(baseY / H) * 100} label="Datum" />

          {/* Section stations. */}
          {g.stations.map((s, i) => (
            <div
              key={s.sector}
              className="absolute -translate-x-1/2 text-center"
              style={{ left: `${(g.cx(i) / W) * 100}%`, top: `${((g.plotBottom + 32) / H) * 100}%` }}
            >
              <p
                className="e-label whitespace-nowrap"
                style={{ color: s.weight > 0 ? 'var(--text-secondary)' : 'var(--text-tertiary)' }}
              >
                {terse ? (SHORT[s.sector] ?? s.sector) : s.sector}
              </p>
              <p className="num mt-1 text-[10.5px] text-text-tertiary">
                {s.weight > 0 ? `${s.weight.toFixed(1)}% held` : 'Watched'}
              </p>
            </div>
          ))}

          {/* Spot heights. */}
          {g.spots
            ? marks.map((m, i) => (
                <Mark
                  key={m.ticker}
                  m={m}
                  i={i}
                  W={W}
                  H={H}
                  fill={fill}
                  reduce={reduce}
                  move={leadMove}
                />
              ))
            : null}

          {/* The end of the ground, named at the foot of the scarp — where the
              break actually is, and the one place on the open side of the
              drawing nothing else is competing for. On the phone the open
              ground is only 75px wide, so the label hangs off the plate's right
              edge instead: measured at 390px, the left-anchored version ended
              72px outside the sheet. */}
          <motion.p
            className="e-label absolute whitespace-nowrap !text-text-tertiary"
            style={{
              ...(compact
                ? { right: 'var(--space-page)' }
                : { left: `${((groundEnd + 14) / W) * 100}%` }),
              top: `${((baseLine - 26) / H) * 100}%`,
              opacity: reduce ? 1 : fill,
            }}
          >
            Limit of holdings
          </motion.p>
        </div>
      </div>

      {/* ------------------------------------------------------ the ledger */}
      {/*
        The phone's substitute for inline spot heights, and the place the
        watched names live there. Same rule as 03: when the ground is crowded,
        a real sheet moves its lettering into a legend rather than printing it
        on top of itself.
      */}
      {compact ? (
        <div
          className="mx-auto mt-8 w-full max-w-[1240px] px-[var(--space-page)]"
          style={{ paddingRight: 82 }}
        >
          {/* Side by side from 640px. Stacked, the two groups ran the section
              to 151vh on a tablet — most of it a single column of rows in a
              frame with room for two. */}
          <div className="sm:grid sm:grid-cols-2 sm:gap-x-10">
            {[
              ['Held', HELD],
              ['Watched', NAMES.filter((n) => !n.held)],
            ].map(([group, rows]) => (
              <div key={group} className="mt-5 first:mt-0 sm:mt-0">
                <p className="e-label mb-2">{group}</p>
                {rows.map((n) => (
                  <div
                    key={n.ticker}
                    className="flex items-center gap-3 border-t py-2.5"
                    style={{ borderColor: 'var(--border)', opacity: n.held ? 1 : 0.62 }}
                  >
                    <CompanyLogo ticker={n.ticker} name={n.name} size={20} />
                    <span className="num text-[12.5px] font-semibold text-text-primary">
                      {n.ticker}
                    </span>
                    <span className="truncate text-[10.5px] text-text-tertiary">{n.sector}</span>
                    <span
                      className={`num ml-auto text-[12px] font-semibold ${
                        n.change >= 0 ? 'text-up' : 'text-down'
                      }`}
                    >
                      {fmtPercent(n.change)}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* The sheet's edge annotation — the same register as 03's, outside the
          drawing where a survey states its own projection. It is what lets the
          plate carry no explanatory prose at all. */}
      <div className="mx-auto mt-8 w-full max-w-[1240px] px-[var(--space-page)]">
        <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2">
          <p className="e-label flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-up" aria-hidden="true" />
            Market open
            <span className="hidden lg:inline">
              &nbsp;·&nbsp; Easting: sector, ordered by capital held &nbsp;·&nbsp; Elevation:
              percent moved
            </span>
          </p>
          {/* The phone sheet drops the index range off the plate, so this is
              where those two figures live there — the annotation carries what
              the drawing had to give up, rather than the number vanishing. */}
          <p className="e-label !text-text-secondary">
            {compact
              ? `Band: ${fmtPercent(BAND.lo)} → ${fmtPercent(BAND.hi)}`
              : `Band: ${INDICES.map((i) => i.label).join(' · ')}`}
            <span className="hidden lg:inline">
              &nbsp;·&nbsp; Dashed: top {HELD.length} held, {COVERED.toFixed(1)}% of capital
            </span>
          </p>
        </div>
      </div>
    </section>
  )
}

/* ============================================================== annotation */

/**
 * A horizontal reference, keyed at the left margin.
 *
 * Set above its own line rather than beside it, so the key reads as a stack in
 * altitude order — indices, then book, then datum — which is the order a
 * landscape is read in and needs no legend to explain.
 */
function Reference({ top, label, value, accent = false }) {
  return (
    <div
      className="absolute left-[var(--space-page)] -translate-y-full pb-1"
      style={{ top: `${top}%` }}
    >
      <p className="e-label flex items-baseline gap-2 whitespace-nowrap">
        <span style={accent ? { color: 'var(--accent-blue)' } : undefined}>{label}</span>
        {value ? (
          <span className="num text-[10.5px] normal-case tracking-normal text-text-tertiary">
            {value}
          </span>
        ) : null}
      </p>
    </div>
  )
}

/**
 * One name, as a spot height.
 *
 * NOT A CARD. A mark on the ground and bare lettering, which is the grammar
 * section 03 uses for its survey stations — the reader recognises the
 * annotation even though the underlying object changed from a peak in plan to a
 * height on a section. A rounded rectangle with a shadow behind it would throw
 * that recognition away and turn the drawing into a dashboard.
 *
 * Held names are marked and labelled above; watched names get the hollow cross
 * and hang their label below, so the two tenures never read as the same thing
 * even at a glance.
 */
function Mark({ m, i, W, H, fill, reduce, move }) {
  const appear = useTransform(fill, [0.15 + i * 0.055, 0.45 + i * 0.055], [0, 1])

  return (
    <motion.div
      className="group absolute"
      style={{
        left: `${(m.x / W) * 100}%`,
        top: `${(m.y / H) * 100}%`,
        opacity: reduce ? 1 : appear,
        zIndex: m.lead ? 2 : 1,
      }}
    >
      {m.held ? (
        <span
          className="absolute grid h-5 w-5 -translate-x-1/2 -translate-y-1/2 place-items-center"
          aria-hidden="true"
        >
          <span className="absolute h-px w-5" style={{ background: 'var(--accent-blue)' }} />
          <span
            className="absolute rounded-full"
            style={{
              width: m.lead ? 9 : 6,
              height: m.lead ? 9 : 6,
              background: 'var(--accent-blue)',
              boxShadow: '0 0 0 3px rgb(var(--bg-base-rgb))',
            }}
          />
        </span>
      ) : (
        <span
          className="absolute grid h-3 w-3 -translate-x-1/2 -translate-y-1/2 place-items-center"
          aria-hidden="true"
        >
          <span className="absolute h-px w-3" style={{ background: 'var(--text-tertiary)' }} />
          <span className="absolute h-3 w-px" style={{ background: 'var(--text-tertiary)' }} />
        </span>
      )}

      {m.held ? (
        <span
          className={`absolute whitespace-nowrap ${
            m.side === 'left'
              ? 'right-[13px] top-1/2 -translate-y-1/2 text-right'
              : m.side === 'right'
                ? 'left-[13px] top-1/2 -translate-y-1/2'
                : 'bottom-[11px] left-1/2 -translate-x-1/2'
          }`}
        >
          <span className="flex items-center gap-1.5">
            <CompanyLogo ticker={m.ticker} name={m.name} size={m.lead ? 22 : 17} />
            <span
              className={`num font-semibold text-text-primary ${m.lead ? 'text-[13px]' : 'text-[11.5px]'}`}
              style={{ opacity: m.lead ? 1 : 0.74 }}
            >
              {m.ticker}
            </span>
            <span
              className={`num font-semibold ${m.change >= 0 ? 'text-up' : 'text-down'} ${
                m.lead ? 'text-[13px]' : 'text-[11px]'
              }`}
              style={{ opacity: m.lead ? 1 : 0.72 }}
            >
              {fmtPercent(m.change)}
            </span>
          </span>
          {/* The heaviest position gets the one full readout on the drawing:
              what it is, and what it did to the book in money. */}
          {m.lead ? (
            <span className="mt-1 flex items-baseline gap-2 whitespace-nowrap">
              <span className="text-[11px] text-text-tertiary">{m.name}</span>
              <span className="num text-[11.5px] text-text-secondary">{fmtSignedMoney(move)}</span>
            </span>
          ) : null}
        </span>
      ) : (
        <span className="absolute left-1/2 top-[11px] -translate-x-1/2 whitespace-nowrap">
          <span className="num text-[11px] text-text-tertiary">{m.ticker}</span>
          <span
            className={`num ml-1.5 text-[10.5px] ${m.change >= 0 ? 'text-up' : 'text-down'}`}
            style={{ opacity: 0.7 }}
          >
            {fmtPercent(m.change)}
          </span>
        </span>
      )}
    </motion.div>
  )
}
