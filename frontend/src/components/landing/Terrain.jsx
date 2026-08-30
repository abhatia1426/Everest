import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, useReducedMotion, useScroll, useTransform } from 'motion/react'

import { CompanyLogo } from '../ui/CompanyLogo'
import { fmtPercent } from '../../lib/format'
import { MaskedLine } from './motion'
import { TextEffect } from './primitives'
import { INTERVAL, SHEET_TALL, SHEET_WIDE, SPOT_HEIGHTS, STATIONS } from './terrain.field'

/**
 * 03 — TERRAIN.
 *
 * WHAT THIS SECTION IS NOT.
 *
 * It is not another mountain-to-chart transformation. Section 02 owns that move
 * and does it once; repeating it here would make the page feel like it only has
 * one trick. The previous build of this section plotted Everest's ridge as a
 * price series — which, now that 02 exists, is the same idea told twice.
 *
 * THE ONE VISUAL IDEA: a plan view.
 *
 * 02 was a side elevation of a single mountain. 03 is the map sheet — the same
 * survey, seen from above, of the whole book. That is a change of PROJECTION
 * and of SCALE, not a change of subject, which is exactly the relationship the
 * two sections need: you climbed it, you measured it, now you are looking down
 * at everything it covers.
 *
 * THE CONTOURS ARE REAL.
 *
 * `terrain.field` builds an elevation surface from the actual portfolio and
 * pulls genuine iso-lines out of it with marching squares. A peak is a
 * position, its height is that position's share of capital, and every ring is a
 * line of equal weight. Nothing is drawn by hand and nothing is decorative:
 * where the rings crowd, the capital is concentrated, and the reader sees that
 * before reading a single label.
 *
 * NOT PINNED. The map is a composition, not a sequence — it is complete and
 * legible the moment it is on screen, and pinning a viewport to watch lines
 * appear would be exactly the gratuitous pinned scene the brief rules out.
 * Scroll only paces the plotting.
 */

/*
 * THE PLATE, in two shapes.
 *
 * The wrapper's aspect always equals the viewBox's, which is what lets the HTML
 * station overlay be positioned in plain percentages with no letterbox maths.
 *
 * The phone gets a genuinely portrait sheet rather than the landscape one
 * shrunk: at 390px the 8:5 plate came out 360x225, which is not a map, it is a
 * strip. A survey drawn for the sheet it is printed on is the whole idea here.
 */
const geom = (sheet, narrow) => {
  const { w, h, peak } = sheet
  const axisTop = 60
  const axisBottom = h - (narrow ? 70 : 96)
  return {
    w,
    h,
    peak,
    axisTop,
    axisBottom,
    /*
     * THE CARRIED ELEMENT.
     *
     * Section 02 draws its altitude axis at x=1286 of a 1600 viewBox sliced to
     * the viewport — screen x ~1206 at 1440 wide. Putting this scale in the
     * same column means the vertical axis does not move across the section
     * boundary: it simply stops being labelled in metres and starts being
     * labelled in share of book. That is the transition stated as an object
     * rather than asserted in copy — the instrument is the same, the units
     * changed because the scale of the subject changed.
     */
    axisX: w - (narrow ? 74 : 150),
    yForWeight: (v) => axisBottom - (v / peak) * (axisBottom - axisTop),
    /* Ticks derive from the real peak. A fixed 0-25 ladder had its top rung
       above the plate the moment overlapping positions pushed the summit past
       25%, and a scale with a clipped label is worse than no scale. */
    ticks: Array.from({ length: Math.floor(peak / 5) + 1 }, (_, i) => i * 5),
  }
}

/**
 * THIS SECTION NEEDS ITS OWN BREAKPOINT.
 *
 * The hero's `useNarrowScene` flips at 780px, which is right for reframing a
 * mountain and wrong here. The inline station labels are fixed-size while the
 * plate scales, so they need roughly 1000px of plate before they stop
 * colliding: at 834px the sheet was legible but crowded, with AAPL and MSFT
 * touching and the title block sitting on top of the contours.
 *
 * A local query keeps that judgement in the section it belongs to and leaves
 * the frozen `Scene` alone.
 */
function useCompactSheet() {
  const [compact, setCompact] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)')
    const apply = () => setCompact(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  return compact
}

export function Terrain() {
  const ref = useRef(null)
  const reduce = useReducedMotion()

  /*
   * Paced, not pinned. The map plots itself across the run in which it is
   * actually on screen, so the reveal is finished well before the reader would
   * otherwise be waiting on it.
   */
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 0.85', 'center 0.35'] })
  const plot = useTransform(scrollYProgress, [0, 1], [0, 1])

  const narrow = useCompactSheet()
  const sheet = narrow ? SHEET_TALL : SHEET_WIDE
  const g = useMemo(() => geom(sheet, narrow), [sheet, narrow])
  const { w: W, h: H } = g
  const covered = useMemo(() => STATIONS.reduce((a, s) => a + s.weight, 0), [])

  return (
    <section ref={ref} id="terrain" className="relative overflow-hidden pb-[11vh] pt-[7vh]">
      <div className="mx-auto w-full max-w-[1240px] px-[var(--space-page)]">
        {/* ------------------------------------------------------ heading */}
        <div className="max-w-[560px]">
          <p className="e-label mb-6 flex items-center gap-3">
            <span
              className="h-px w-8 shrink-0"
              style={{ background: 'currentColor', opacity: 0.5 }}
              aria-hidden="true"
            />
            03 — Terrain
          </p>

          <h2 className="e-title">
            <MaskedLine>Your book</MaskedLine>
            <MaskedLine delay={0.08}>
              <span style={{ color: 'var(--text-secondary)' }}>has a shape.</span>
            </MaskedLine>
          </h2>

          <TextEffect className="e-lead mt-7 max-w-[var(--e-measure)]" delay={0.15}>
            Plotted by sector and session move, with elevation as share of capital. The contours are
            lines of equal weight — where they crowd, your money is concentrated.
          </TextEffect>
        </div>

        {/* --------------------------------------------------- the map sheet */}
        {/*
          A NEATLINE, not a card.

          The border here is the map's neatline — the ruled edge every survey
          sheet has — and the block inside it is a title block. That is why this
          reads as an instrument rather than as the panel-in-a-rounded-rectangle
          the brief rules out: the frame is part of the drawing's own grammar.
        */}
        <div
          className="relative mt-14 w-full overflow-hidden"
          style={{ border: '1px solid var(--border-strong)', borderRadius: 2 }}
        >
          <div className="relative w-full" style={{ aspectRatio: `${W} / ${H}` }}>
            <svg
              viewBox={`0 0 ${W} ${H}`}
              className="absolute inset-0 h-full w-full"
              aria-hidden="true"
            >
              <defs>
                {/* Hypsometric wash: the high ground reads warmer without any
                    filled-polygon reconstruction. One soft radial per peak. */}
                <radialGradient id="terrain-high">
                  <stop offset="0%" stopColor="var(--accent-blue)" stopOpacity="0.2" />
                  <stop offset="100%" stopColor="var(--accent-blue)" stopOpacity="0" />
                </radialGradient>
              </defs>

              {/* 1. The survey grid. Quiet, and squared to the plate. */}
              <g stroke="var(--grid-line)" strokeWidth="1">
                {Array.from({ length: Math.floor(W / 100) - 1 }).map((_, i) => (
                  <line key={`v${i}`} x1={(i + 1) * 100} x2={(i + 1) * 100} y1="0" y2={H} />
                ))}
                {Array.from({ length: Math.floor(H / 100) - 1 }).map((_, i) => (
                  <line key={`h${i}`} x1="0" x2={W} y1={(i + 1) * 100} y2={(i + 1) * 100} />
                ))}
              </g>

              {/* 2. Elevation wash under each position. */}
              {STATIONS.map((s) => (
                <ellipse
                  key={`w-${s.ticker}`}
                  cx={s.x * W}
                  cy={s.y * H}
                  rx={s.weight * 15}
                  ry={s.weight * 11}
                  fill="url(#terrain-high)"
                />
              ))}

              {/* 3. THE CONTOURS. Highest ground first. */}
              {sheet.contours.map((c, i) => (
                <Contour
                  key={c.level}
                  c={c}
                  i={i}
                  n={sheet.contours.length}
                  plot={plot}
                  reduce={reduce}
                />
              ))}

              {/* 4. The elevation scale, on the RIGHT.
                     Section 02 put its altitude axis on the right of the frame
                     and labelled it in metres. This is the same axis in the
                     same place, relabelled in share of book — the scale carries
                     across the seam and only its units change, which is the
                     whole argument of the transition in one object. */}
              <g>
                <line
                  x1={g.axisX}
                  x2={g.axisX}
                  y1={g.axisTop}
                  y2={g.axisBottom}
                  stroke="var(--border-strong)"
                  strokeWidth="1"
                />
                {g.ticks.map((v) => (
                  <g key={v} transform={`translate(0 ${g.yForWeight(v)})`}>
                    <line
                      x1={g.axisX - 8}
                      x2={g.axisX}
                      y1="0"
                      y2="0"
                      stroke="var(--border-strong)"
                      strokeWidth="1"
                    />
                  </g>
                ))}
              </g>
            </svg>

            {/*
              TICK LABELS IN HTML, not SVG text.

              SVG text scales with the plate, so a single font size rendered at
              ~9px on a 360px phone sheet and ~21px on an 800px tablet one — the
              same scale reading as a whisper in one place and a headline in the
              other. In the HTML layer they are simply 11px everywhere.
            */}
            {g.ticks.map((v) => (
              <span
                key={v}
                className="num absolute -translate-y-1/2 text-[11px] text-text-tertiary"
                style={{
                  left: `${((g.axisX + 10) / W) * 100}%`,
                  top: `${(g.yForWeight(v) / H) * 100}%`,
                }}
              >
                {v}%
              </span>
            ))}

            {/* 5. SURVEY STATIONS — HTML, so the real CompanyLogo is used.
                   The map is annotated with the product's own components rather
                   than with drawn stand-ins, which is what keeps this a view of
                   the portfolio instead of an illustration of one. */}
            {STATIONS.map((s, i) => (
              <Station key={s.ticker} s={s} i={i} plot={plot} reduce={reduce} narrow={narrow} />
            ))}
            {/* Watched names are dropped on the phone. Nine annotations on a
                360px plate is not a restrained map, it is a pile. The five
                owned positions are the subject; the watchlist is context. */}
            {!narrow &&
              SPOT_HEIGHTS.map((s, i) => (
                <SpotHeight key={s.ticker} s={s} i={i} plot={plot} reduce={reduce} />
              ))}

            {/* 6. THE TITLE BLOCK — wide sheet only. On the compact sheet it
                   covered a quarter of the map; its rows move below the plate
                   instead, where they have room to be read. */}
            {!narrow && <TitleBlock covered={covered} />}
          </div>
        </div>

        {/* The station legend — the phone's substitute for inline labels, and
            the place the logos and weights live there. */}
        <div className="mt-5 grid grid-cols-1 gap-x-6 gap-y-2 lg:hidden">
          {STATIONS.map((s, i) => (
            <div key={s.ticker} className="flex items-center gap-2.5">
              <span
                className="num grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full text-[10px] font-semibold"
                style={{ border: '1px solid var(--accent-blue)', color: 'var(--accent-blue)' }}
              >
                {i + 1}
              </span>
              <CompanyLogo ticker={s.ticker} name={s.name} size={18} />
              <span className="num text-[12px] font-semibold text-text-primary">{s.ticker}</span>
              <span className="num ml-auto text-[11.5px] text-text-secondary">
                {s.weight.toFixed(1)}%
              </span>
            </div>
          ))}
        </div>

        {/* On the compact sheet the title block's rows live here. */}
        <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-2 lg:hidden">
          {[
            ['Sheet', '03 · Plan view'],
            ['Datum', '$179,386.40'],
            ['Contour interval', `${INTERVAL.toFixed(1)}% of book`],
            ['Coverage', `Top ${STATIONS.length} · ${covered.toFixed(1)}%`],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="e-label">{k}</dt>
              <dd className="num mt-0.5 text-[11.5px] text-text-primary">{v}</dd>
            </div>
          ))}
        </dl>

        {/* The sheet's edge annotation, outside the neatline where a real sheet
            carries its projection note. */}
        <div className="mt-4 flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2">
          <p className="e-label">
            Easting: sector, ordered by weight &nbsp;·&nbsp; Northing: session move
          </p>
          <p className="e-label !text-text-secondary">
            Contour interval {INTERVAL.toFixed(1)}% of book
          </p>
        </div>
      </div>
    </section>
  )
}

/**
 * One contour ring.
 *
 * Levels arrive highest-first as the reader scrolls, so the map plots from the
 * summits outward — the order a surveyor works in, and it means the largest
 * positions are readable before the fine detail lands. Opacity falls with
 * altitude so the high ground stays the subject.
 */
function Contour({ c, i, n, plot, reduce }) {
  const settled = 0.62 - (i / n) * 0.34
  const opacity = useTransform(plot, [(i / n) * 0.8, (i / n) * 0.8 + 0.22], [0, settled])

  return (
    <motion.path
      d={c.d}
      fill="none"
      stroke="var(--text-primary)"
      strokeWidth={c.index % 5 === 0 ? 2 : 1.1}
      style={{ opacity: reduce ? settled : opacity }}
    />
  )
}

/** An owned position: a survey mark with the product's own logo beside it. */
function Station({ s, i, plot, reduce, narrow }) {
  const appear = useTransform(plot, [0.42 + i * 0.05, 0.62 + i * 0.05], [0, 1])

  /*
   * Labels hang toward the middle of the sheet.
   *
   * Every pill extending right meant the eastern positions pushed their labels
   * into the margin and into each other — AMZN's ran straight through the GOOGL
   * spot height. Flipping past the halfway point keeps annotation inside the
   * neatline and stops the two halves of the map competing for the same strip.
   */
  const flip = s.x > 0.55

  /*
   * The OUTER element is zero-size and sits exactly on the survey point, so the
   * mark can be centred on it while the label hangs off one side. Reversing a
   * centred flex row (the first attempt) only reordered the children — the
   * group stayed centred on the point, so the pill still straddled it and AMZN
   * kept running through the GOOGL spot height.
   */
  return (
    <motion.div
      className="absolute"
      style={{ left: `${s.x * 100}%`, top: `${s.y * 100}%`, opacity: reduce ? 1 : appear }}
    >
      {/* The mark itself: a triangulation cross, drawn at the exact point. */}
      <span
        className="absolute grid h-6 w-6 -translate-x-1/2 -translate-y-1/2 place-items-center"
        aria-hidden="true"
      >
        <span className="absolute h-px w-6" style={{ background: 'var(--accent-blue)' }} />
        <span className="absolute h-6 w-px" style={{ background: 'var(--accent-blue)' }} />
        <span
          className="absolute h-2 w-2 rounded-full"
          style={{
            background: 'var(--accent-blue)',
            boxShadow: '0 0 0 3px rgb(var(--bg-base-rgb))',
          }}
        />
      </span>

      {/*
        ON A PHONE THE MARK IS NUMBERED AND THE NAMES GO IN A LEGEND.

        Inline pills cannot work at 360px: AAPL and MSFT sit ~36px apart on the
        plate and each label is three times that wide, so one always buried the
        other. Numbering the stations and listing them beneath the sheet is what
        an actual map does when the ground is crowded, and it keeps every name,
        logo and weight legible instead of half-hidden.
      */}
      {narrow ? (
        <span
          className="num absolute grid h-[18px] w-[18px] -translate-x-1/2 -translate-y-[26px]
            place-items-center rounded-full text-[10px] font-semibold"
          style={{
            background: 'rgb(var(--bg-base-rgb) / 0.9)',
            border: '1px solid var(--accent-blue)',
            color: 'var(--accent-blue)',
          }}
        >
          {i + 1}
        </span>
      ) : (
        <span
          className={`absolute flex -translate-y-1/2 items-center gap-2 whitespace-nowrap rounded-full
            py-1 pl-1 pr-2.5 ${flip ? 'right-[16px]' : 'left-[16px]'}`}
          style={{
            background: 'rgb(var(--bg-base-rgb) / 0.82)',
            border: '1px solid var(--border)',
          }}
        >
          <CompanyLogo ticker={s.ticker} name={s.name} size={20} />
          <span className="num text-[12px] font-semibold text-text-primary">{s.ticker}</span>
          <span className="num text-[11.5px] text-text-secondary">{s.weight.toFixed(1)}%</span>
        </span>
      )}
    </motion.div>
  )
}

/**
 * A watched name.
 *
 * Marked, but with no ground under it — nothing is invested, so it contributes
 * nothing to the elevation field. The distinction needs no caption: a spot
 * height with no contours around it reads as flat ground to anyone who has seen
 * a map, and it is the honest picture of a watchlist.
 */
function SpotHeight({ s, i, plot, reduce }) {
  const appear = useTransform(plot, [0.62 + i * 0.04, 0.8 + i * 0.04], [0, 1])

  return (
    <motion.div
      className="absolute -translate-x-1/2 -translate-y-1/2"
      style={{ left: `${s.x * 100}%`, top: `${s.y * 100}%`, opacity: reduce ? 1 : appear }}
    >
      {/* Stacked UNDER the mark, not beside it. Beside, a watched name sat at
          the same northing as a held one and their labels ran together — the
          station pills are fixed-size while the plate scales, so they crowd
          harder the narrower the viewport gets. Vertical stacking cannot
          collide with a horizontal pill. */}
      <div className="flex flex-col items-center">
        <span className="relative grid h-3 w-3 place-items-center" aria-hidden="true">
          <span className="absolute h-px w-3" style={{ background: 'var(--text-tertiary)' }} />
          <span className="absolute h-3 w-px" style={{ background: 'var(--text-tertiary)' }} />
        </span>
        <span className="mt-1 whitespace-nowrap">
          <span className="num text-[11px] text-text-tertiary">{s.ticker}</span>
          <span
            className={`num ml-1.5 text-[10.5px] ${s.change >= 0 ? 'text-up' : 'text-down'}`}
            style={{ opacity: 0.75 }}
          >
            {fmtPercent(s.change)}
          </span>
        </span>
      </div>
    </motion.div>
  )
}

/**
 * The title block.
 *
 * Every survey sheet carries one: what the sheet is, at what scale, to what
 * datum. It is the most authentically instrument-like object available here and
 * it does real work — it is where the map states its own units, so none of the
 * axes need explaining in prose.
 */
function TitleBlock({ covered }) {
  const rows = [
    ['Sheet', '03 · Plan view'],
    ['Contour interval', `${INTERVAL.toFixed(1)}% of book`],
    ['Datum', 'Total value $179,386.40'],
    ['Coverage', `Top ${STATIONS.length} positions · ${covered.toFixed(1)}%`],
  ]

  return (
    <div
      className="absolute bottom-0 left-0"
      style={{
        borderTop: '1px solid var(--border-strong)',
        borderRight: '1px solid var(--border-strong)',
      }}
    >
      <div className="px-5 py-4" style={{ background: 'rgb(var(--bg-base-rgb) / 0.86)' }}>
        <p className="e-label !text-text-secondary">Everest — Portfolio terrain</p>
        <dl className="mt-3 grid grid-cols-[auto_auto] gap-x-6 gap-y-1.5">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="e-label">{k}</dt>
              <dd className="num text-[11.5px] text-text-primary">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  )
}
