import { useRef } from 'react'
import { motion, useReducedMotion, useScroll, useTransform } from 'motion/react'

import { APEX, pts, SE_RIDGE, VIEW, WEST_RIDGE } from './everest'
import { MaskedLine, useFadeBand } from './motion'
import { TextEffect, useAnimatedNumber } from './primitives'
import { useNarrowScene } from './Scene'

/**
 * 02 — ASCENT.
 *
 * THE SECTION THAT HAD TO STOP REPEATING THE HERO.
 *
 * The previous build mounted a second full `EverestScene` here. Because that
 * scene starts at camera-zero while the hero's ends at camera-one, the seam
 * showed TWO MOUNTAINS AT ONCE — the hero's massif scrolling away in the top
 * sliver and a fresh one starting over below it, split by a hard horizontal
 * edge. A screen later the section was pinned with nothing on it at all: the
 * hero's type had gone and this section's had not yet arrived.
 *
 * THE ONE VISUAL IDEA: the mountain becomes a survey.
 *
 * The massif arrives as the exact silhouette the reader has been looking at and
 * converts — in place, on the same path — into a technical elevation drawing
 * with an axis, datums and camps. A datum line then rises through it as you
 * scroll, filling the mountain in beneath you. You are not looking at a picture
 * of a climb; you are watching a measurement being taken.
 *
 * IT IS DRAWN IN THE HERO'S OWN COORDINATE SPACE.
 *
 * The first attempt renormalised the ridge into a 1000x620 chart box and set it
 * beside the copy. It worked mechanically and failed completely as a
 * transition: a small diagram in the right-hand column has no visual
 * relationship to the full-bleed massif that just left, so the eye read a new
 * object rather than the same one changing register.
 *
 * So this uses `VIEW`, `MASSIF_OUTLINE` and the real `WEST_RIDGE` /`SE_RIDGE`
 * points at full bleed with the same `xMidYMax slice` framing as the hero. The
 * surveyed line lands exactly where the painted ridge was. That single decision
 * is what makes this a transformation instead of a scene change.
 *
 * NO SECOND MASSIF SCENE, so there is no camera to keep in sync and no change
 * to the frozen Hero or to the shared `Scene`.
 */

/* ------------------------------------------------------------ altitude map */

/*
 * Two fixed points tie the drawing's geometry to real elevations: the apex is
 * 8,848 m, and the west ridge where it leaves the frame is taken as 4,900 m.
 * Everything else — camps, datums, the readout — interpolates between them, so
 * a camp marker sits at the height on the drawing that it sits at on the
 * mountain rather than wherever looked good.
 */
const SUMMIT_M = 8848
const FOOT_M = 4900
const FOOT_Y = 742

const yForAlt = (m) => APEX[1] + ((SUMMIT_M - m) * (FOOT_Y - APEX[1])) / (SUMMIT_M - FOOT_M)

/** The skyline, in view space: up the West Ridge, over the top, down the SE. */
const SKY = [...WEST_RIDGE].reverse().concat(SE_RIDGE.slice(1))
const LINE = pts(SKY)

/**
 * The same skyline, closed into a fillable body.
 *
 * THE FILL HAS TO HUG THE RIDGE. Clipping the full `MASSIF_OUTLINE` below the
 * datum looked correct in principle and read as a solid blue SLAB: the massif
 * polygon is nearly frame-width by 6,000 m and closes on a hard vertical edge
 * at the South Col, so "the ground you have climbed" became a rectangle with a
 * seam down it.
 *
 * Closing the skyline itself — and running both ends well outside the frame —
 * gives a body whose top edge IS the ridge. Clipped below a rising datum it
 * reads the way a waterline rises on a shore: flat where the datum cuts across
 * open air, following the mountain wherever the mountain is lower.
 */
const BODY = pts([...SKY, [1760, 660], [1760, VIEW.h + 60], [-160, VIEW.h + 60]])

const CAMPS = [
  { m: 5364, name: 'Base Camp' },
  { m: 6400, name: 'Camp II' },
  { m: 7200, name: 'Camp III' },
  { m: 7906, name: 'South Col' },
  { m: 8848, name: 'Summit' },
]

/** Clear of the floating theme rail on the right edge at every breakpoint. */
const AXIS_X = 1286

/** Where the climber stands on the ascending flank at a given altitude. */
function pointAtAlt(m) {
  const y = yForAlt(m)
  for (let i = 1; i < SKY.length; i += 1) {
    if (SKY[i][1] <= y && SKY[i - 1][1] > y) {
      const k = (SKY[i - 1][1] - y) / (SKY[i - 1][1] - SKY[i][1] || 1)
      return [SKY[i - 1][0] + (SKY[i][0] - SKY[i - 1][0]) * k, y]
    }
  }
  return [APEX[0], y]
}

/**
 * NARROW FRAMING.
 *
 * On a phone `xMidYMax slice` crops the 1600-unit viewBox to roughly 420 units
 * around x=800 — which threw away the axis at x=1286 entirely. The section lost
 * its scale, its camps and its readout, and what remained was a diagonal line
 * running through the paragraph: all of the instrument, none of the meaning.
 *
 * So narrow gets a genuinely different frame rather than a scaled one. The
 * viewBox is cropped to just the summit and the axis and fitted with `meet`, the
 * drawing moves to a band beneath the copy, and every label is scaled up by
 * `LABEL_SCALE` to survive the reduction.
 */
/*
 * Where the climb rests when motion is reduced.
 *
 * 7,400 m put the datum line at the exact height the lead paragraph sets, so
 * the dashed rule ran through the sentence for every reduced-motion reader —
 * a static frame has to be composed as carefully as an animated one. Camp II
 * sits clear of the copy and is a real waypoint rather than an arbitrary stop.
 */
const REST_M = 6400
const REST_LABEL = '6,400'

const NARROW_BOX = '600 176 866 596'
const LABEL_SCALE = 1.62

export function Ascent() {
  const ref = useRef(null)
  const reduce = useReducedMotion()
  const narrow = useNarrowScene()
  const s = narrow ? LABEL_SCALE : 1

  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] })

  /*
   * THE SEAM, handled explicitly.
   *
   * A second timeline measuring the section's APPROACH — 0 when its top is at
   * the bottom of the viewport, 1 when it reaches the top and pins. The stage
   * dissolves in across the back half of that run, which is exactly the window
   * in which the hero's massif is scrolling away above it.
   *
   * Without this the drawing sat at full strength while the hero's mountain was
   * still on screen, and the reader saw both at once with a hard section edge
   * between them — the original defect, reproduced with different artwork.
   */
  const { scrollYProgress: approach } = useScroll({
    target: ref,
    offset: ['start end', 'start start'],
  })
  const stageIn = useTransform(approach, [0.42, 0.98], [0, 1])

  /*
   * AND THE EXIT.
   *
   * A 100vh sticky child inside a 190vh section stays pinned only until there
   * is one viewport left — progress 0.47 — after which the stage scrolls away
   * on its own. Left at full strength it scrolled UP THROUGH THE FIXED NAV, so
   * the camp labels crossed behind the Get-started pill, and it met the next
   * section on a hard horizontal cut.
   *
   * Dissolving it out over the back half turns that into a proper handoff: the
   * survey recedes as the terrain below rises into its place.
   */
  const stageOut = useTransform(scrollYProgress, [0.58, 0.9], [1, 0])
  const stageOpacity = useTransform([stageIn, stageOut], ([a, b]) => Math.min(a, b))

  /*
   * The climb — compressed into the PINNED window.
   *
   * At [0.08, 0.84] the ascent was still gaining altitude long after the stage
   * had unpinned, so the most dramatic part of it (Camp III to the summit)
   * played out while the whole drawing was sliding off the top of the screen
   * and nobody could see it. Everything now completes and settles by 0.42,
   * comfortably inside the pin, and the rest of the section is the exit.
   *
   * Every other value in the section derives from this one, which is what keeps
   * the drawing, the axis, the camps and the readout on a single timeline
   * instead of five that drift apart at different scroll speeds.
   */
  const altitude = useTransform(scrollYProgress, [0.05, 0.4], [5364, SUMMIT_M])
  const datumY = useTransform(altitude, yForAlt)
  const fillY = useTransform(altitude, yForAlt)
  const fillH = useTransform(altitude, (m) => VIEW.h - yForAlt(m) + 40)

  /* THE TRANSFORMATION: the solid mass dissolves exactly as the surveyed line
     draws itself along the identical path. One shape, two registers — not a
     crossfade between two different pictures. */
  /* The two must OVERLAP. At [0,0.24] against a line drawing to 0.38 the mass
     had already gone while the survey was only half drawn, so for a third of
     the section there was neither a mountain nor a finished drawing on screen —
     a dissolve with a hole in the middle. The mass now outlives the line. */
  const massOpacity = useTransform(scrollYProgress, [0.02, 0.18], [0.85, 0])
  const outlineDraw = useTransform(scrollYProgress, [0.01, 0.16], [0, 1])
  const axisOpacity = useTransform(scrollYProgress, [0.08, 0.18], [0, 1])

  const copyOpacity = useFadeBand(scrollYProgress, 0.03, 0.1, 0.4, 0.48)
  const copyY = useTransform(scrollYProgress, [0.03, 0.48], [24, -24])

  const climberX = useTransform(altitude, (m) => pointAtAlt(m)[0])
  const climberY = useTransform(altitude, (m) => pointAtAlt(m)[1])

  const readout = useAnimatedNumber(altitude)
  const still = (mv, v) => (reduce ? v : mv)

  return (
    <section ref={ref} id="ascend" className="relative h-[190vh]">
      {/*
        THE BRIDGE.

        The hero's scene fades to the page background across the bottom of its
        own SVG, but that fade only completes on its final pixel — so where the
        hero section ends and this one begins, its still-lit foreground met flat
        `bg-base` on a hard horizontal line, and the seam read as two stacked
        images rather than one continuous page.

        This finishes the fade from below: 140px of page background ramping up
        over the hero's last sliver. It sits ABOVE this section (negative top)
        and paints after the hero in document order, so it needs no z-index and
        no change to the frozen Hero — it only completes a dissolve the hero
        already begins. Built on `--bg-base`, so it is correct in both themes
        rather than guessing at the foreground's colour.
      */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 -top-[140px] h-[140px]"
        style={{
          background:
            'linear-gradient(to top, rgb(var(--bg-base-rgb)) 0%, rgb(var(--bg-base-rgb) / 0) 100%)',
        }}
      />

      <div className="sticky top-0 h-[100svh] overflow-hidden">
        {/* ------------------------------------------------- the survey */}
        <motion.div
          className={
            narrow
              ? 'absolute inset-x-0 bottom-[6vh] top-[44%]'
              : 'absolute inset-0'
          }
          style={{ opacity: still(stageOpacity, 1) }}
        >
          <svg
            className="h-full w-full"
            viewBox={narrow ? NARROW_BOX : `0 0 ${VIEW.w} ${VIEW.h}`}
            preserveAspectRatio={narrow ? 'xMidYMid meet' : 'xMidYMax slice'}
            role="img"
            aria-label="Everest's skyline redrawn as a survey elevation, with camps marked from Base Camp at 5,364 m to the summit at 8,848 m"
          >
            <defs>
              <linearGradient id="ascent-climbed" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--accent-blue)" stopOpacity="0.2" />
                <stop offset="100%" stopColor="var(--accent-blue)" stopOpacity="0.02" />
              </linearGradient>
              {/* The arriving mass carries a little modelling. A single flat
                  navy fill read as a paper cut-out at the exact moment it is
                  standing in for the hero's fully modelled massif. */}
              <linearGradient id="ascent-mass" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--tr5)" />
                <stop offset="55%" stopColor="var(--tr3)" />
                <stop offset="100%" stopColor="var(--tr1)" />
              </linearGradient>
              <clipPath id="ascent-below">
                <motion.rect
                  x="-80"
                  width={VIEW.w + 160}
                  y={still(fillY, yForAlt(REST_M))}
                  height={still(fillH, VIEW.h - yForAlt(REST_M) + 40)}
                />
              </clipPath>
            </defs>

            {/* 1. THE MASS — the mountain arriving as the reader last saw it,
                   and dissolving as the survey takes over.

                   Uses BODY rather than `MASSIF_OUTLINE`. The massif polygon
                   closes on a vertical edge at the South Col because the painted
                   scene has Lhotse and Nuptse standing in front of it; with
                   nothing in front of it here, that edge showed as a hard
                   tonal step down the right of the frame. BODY runs off both
                   sides of the viewport instead. */}
            <motion.polygon
              points={BODY}
              fill="url(#ascent-mass)"
              style={{ opacity: still(massOpacity, 0) }}
            />

            {/* 2. THE GROUND YOU HAVE CLIMBED, clipped below the datum. */}
            <g clipPath="url(#ascent-below)">
              <polygon points={BODY} fill="url(#ascent-climbed)" />
            </g>

            {/* 3. THE SURVEYED OUTLINE, drawing along the same skyline. */}
            <motion.polyline
              points={LINE}
              fill="none"
              stroke="var(--text-primary)"
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
              style={{ pathLength: still(outlineDraw, 1), opacity: 0.9 }}
            />

            {/* 4. THE AXIS AND ITS CAMPS. */}
            <motion.g style={{ opacity: still(axisOpacity, 1) }}>
              <line
                x1={AXIS_X}
                x2={AXIS_X}
                y1={yForAlt(SUMMIT_M)}
                y2={yForAlt(5000)}
                stroke="var(--border-strong)"
                strokeWidth="1"
              />
              {Array.from({ length: 20 }).map((_, i) => {
                const m = 5000 + i * 200
                return (
                  <line
                    key={m}
                    x1={AXIS_X - 5}
                    x2={AXIS_X}
                    y1={yForAlt(m)}
                    y2={yForAlt(m)}
                    stroke="var(--border-strong)"
                    strokeWidth="1"
                    opacity="0.55"
                  />
                )
              })}
              {CAMPS.map((c) => (
                <Camp key={c.m} camp={c} altitude={altitude} reduce={reduce} s={s} narrowLabels={narrow} />
              ))}
            </motion.g>

            {/* 5. THE DATUM — run the full width of the frame, so it reads as a
                   measurement taken across the whole subject rather than as a
                   marker sitting on the mountain. */}
            <motion.g style={{ y: still(datumY, yForAlt(REST_M)) }}>
              <line
                x1="0"
                x2={AXIS_X}
                y1="0"
                y2="0"
                stroke="var(--accent-blue)"
                strokeWidth="1.25"
                strokeDasharray="3 7"
                opacity="0.9"
              />
              {/* Docked against the axis, not floated at the left of the frame.
                  At x=24 the badge sat inside the 80px that `slice` crops on a
                  1440 viewport and the reading was simply cut in half. Beside
                  the scale is also where an instrument's readout belongs. */}
              <rect
                x={narrow ? 614 : AXIS_X - 178}
                y={-35 * s}
                width={156 * s}
                height={31 * s}
                rx={7 * s}
                fill="rgb(var(--bg-base-rgb) / 0.82)"
                stroke="var(--border-strong)"
              />
              <text
                x={narrow ? 630 : AXIS_X - 162}
                y={-13 * s}
                fill="var(--text-primary)"
                fontSize={17 * s}
                fontWeight="600"
                className="num"
              >
                {reduce ? REST_LABEL : readout}
                <tspan fill="var(--text-tertiary)" fontSize={12 * s}>
                  {'  '}m
                </tspan>
              </text>
            </motion.g>

            {/* 6. THE CLIMBER — the one element moving in two axes, which is
                   what makes it read as a position and not a level. */}
            <motion.circle
              r="5.5"
              fill="var(--accent-blue)"
              stroke="rgb(var(--bg-base-rgb))"
              strokeWidth="2.5"
              style={{
                cx: still(climberX, pointAtAlt(REST_M)[0]),
                cy: still(climberY, pointAtAlt(REST_M)[1]),
              }}
            />
          </svg>
        </motion.div>

        {/* ----------------------------------------------------------- copy */}
        <motion.div
          /* TOP-ALIGNED, not centred. Centred, the lead paragraph sat at the
             exact height the surveyed ridge crosses the left of the frame and
             the white line ran straight through the sentence. Held high, the
             copy occupies the open sky in the upper left and the ridge sweeps
             beneath it — which is also the hero's composition, so the reader's
             eye does not have to re-find the text across the seam. */
          className="relative z-10 flex h-full items-start px-[var(--space-page)] pt-[13vh] sm:pt-[15vh]"
          style={{ opacity: still(copyOpacity, 1), y: still(copyY, 0) }}
        >
          <div className="mx-auto w-full max-w-[1400px]">
            <div className="max-w-[min(520px,94%)]">
              <p className="e-label mb-6 flex items-center gap-3">
                <span
                  className="h-px w-8 shrink-0"
                  style={{ background: 'currentColor', opacity: 0.5 }}
                  aria-hidden="true"
                />
                02 — Ascent
              </p>

              <h2 className="e-title">
                <MaskedLine>Every price looks</MaskedLine>
                <MaskedLine delay={0.08}>urgent from</MaskedLine>
                <MaskedLine delay={0.16}>
                  <span style={{ color: 'var(--text-secondary)' }}>the ground.</span>
                </MaskedLine>
              </h2>

              {/* No technical caption under the copy. It sat exactly where the
                  datum line crosses the left of the frame, so the two rendered
                  on top of each other — and the axis already carries the
                  drawing's annotation. One survey label per survey. */}
              <TextEffect className="e-lead mt-7 max-w-[var(--e-measure)]" delay={0.2}>
                Altitude sorts them. What survives the climb is structure — exposure,
                concentration, and the few moves that actually changed your position.
              </TextEffect>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}

/**
 * One camp on the axis.
 *
 * REACHED IS A STATE, NOT AN ENTRANCE. The marker fills and the label lifts to
 * full contrast the moment the datum passes its altitude, and stays there. It
 * is the only progressive reveal in the section and it earns its place by
 * reporting something true — how far up you are — rather than decorating an
 * arrival.
 */
function Camp({ camp, altitude, reduce, s = 1, narrowLabels = false }) {
  /*
   * Every hook unconditionally, at the top. Written inline in the JSX these sat
   * behind `reduce ? … : useTransform(…)` — a hook inside a ternary, which
   * changes the hook count between renders the moment the media query flips and
   * corrupts React's hook order for the subtree. The branch belongs on the
   * VALUE, never on the call.
   */
  const reached = useTransform(altitude, [camp.m - 110, camp.m], [0, 1])
  const markerFill = useTransform(reached, [0, 1], ['rgba(0,0,0,0)', 'var(--accent-blue)'])
  const nameOpacity = useTransform(reached, [0, 1], [0.5, 1])
  const metreOpacity = useTransform(reached, [0, 1], [0.4, 0.85])

  return (
    <g transform={`translate(0 ${yForAlt(camp.m)})`}>
      <motion.circle
        cx={AXIS_X}
        cy="0"
        r={4.5 * s}
        stroke="var(--text-tertiary)"
        strokeWidth={1.5 * s}
        style={{ fill: reduce ? 'var(--accent-blue)' : markerFill }}
      />
      {/*
        On a phone the labels sit INSIDE the axis, right-aligned.

        The theme rail floats fixed against the right edge at the vertical
        centre of the viewport, which on narrow is exactly where the drawing
        band puts the upper camps — so left-aligned labels ran underneath it and
        "Summit" was unreadable. Flipping them to the inside moves them into the
        empty sky above the ridge, which is the only clear space on the frame.
      */}
      <motion.text
        x={narrowLabels ? AXIS_X - 18 * s : AXIS_X + 18 * s}
        textAnchor={narrowLabels ? 'end' : 'start'}
        y={1 * s}
        fontSize={15 * s}
        fontWeight="500"
        fill="var(--text-primary)"
        style={{ opacity: reduce ? 1 : nameOpacity }}
      >
        {camp.name}
      </motion.text>
      <motion.text
        x={narrowLabels ? AXIS_X - 18 * s : AXIS_X + 18 * s}
        textAnchor={narrowLabels ? 'end' : 'start'}
        y={20 * s}
        fontSize={13 * s}
        fill="var(--text-tertiary)"
        className="num"
        style={{ opacity: reduce ? 1 : metreOpacity }}
      >
        {camp.m.toLocaleString()} m
      </motion.text>
    </g>
  )
}
