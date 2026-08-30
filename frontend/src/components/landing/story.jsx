import { useRef } from 'react'
import { Link } from 'react-router-dom'
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion'

import { EverestScene, useNarrowScene } from './Scene'
import { MaskedLine, Rise, EASE_OUT } from './motion'
import {
  AllocationPanel,
  DEMO_HOLDINGS,
  IntelligencePanel,
  OptionsPanel,
  TickerPanel,
  WatchlistPanel,
} from './panels'

/**
 * THE ASCENT — sections 02 through 09.
 *
 * ONE CONTINUOUS EXPERIENCE, not nine blocks. The rule the whole file is built
 * around: at no point should a reader think "now I am on a different part of
 * the website". The visual language evolves along a single chain —
 *
 *   mountain -> terrain -> contours -> data -> portfolio -> market
 *            -> exposure -> signal -> instrument -> summit
 *
 * and each section inherits the previous one's device before introducing its
 * own. Contours arrive over the mountain in 02 and are still present, fading,
 * in 04. The skyline becomes the price line in 03 and that same line reappears
 * as the market traverse in 05.
 *
 * SECTION HEIGHTS ARE SIZED TO THEIR CONTENT. Only the two scenes that
 * genuinely transform (02, 03) are pinned and tall. Everything else is between
 * 70 and 110vh, because a page padded out with empty pinned viewports reads as
 * slow rather than as cinematic.
 *
 * NO REPEATED LAYOUT. No section is headline-over-three-cards, and no two
 * consecutive sections share a composition: full-bleed scene, split with the
 * product right, full-bleed traverse, elevation profile, resolving noise field,
 * a single instrument, and a close. That variety is doing the same job the
 * altitude labels do — telling the reader they have moved.
 */

/* ========================================================== section chrome */

/**
 * The spine.
 *
 * Every section is annotated with its stage index and the altitude it sits at,
 * ascending toward the summit. It is a survey annotation rather than a section
 * number, and it is what tells the reader they are climbing without a progress
 * bar ever appearing on screen.
 */
function Stage({ index, altitude, label, className = '' }) {
  return (
    <Rise className={`flex items-center gap-4 ${className}`}>
      <span className="e-label !text-text-secondary">{index}</span>
      <span
        className="h-px w-10 shrink-0"
        style={{ background: 'var(--border-strong)' }}
        aria-hidden="true"
      />
      <span className="e-label">{label}</span>
      <span className="num ml-auto text-[10.5px] tracking-[0.14em] text-text-tertiary sm:ml-0">
        {altitude}
      </span>
    </Rise>
  )
}

/** Consistent section shell: the 1240px measure and the page gutter. */
function Shell({ children, className = '' }) {
  return (
    <div className={`mx-auto w-full max-w-[1240px] px-[var(--space-page)] ${className}`}>
      {children}
    </div>
  )
}

/* =========================================================== 04 PORTFOLIO */

/*
 * Section 04 now lives in `landing/Portfolio.jsx`.
 *
 * It was moved out rather than edited in place because the redesign is a
 * different object entirely — the book drawn as a core through the capital,
 * rather than a product panel beside a headline — and because leaving the old
 * implementation exported here would have given the page two Portfolios and
 * two places to state the book's total. The imports it alone was using
 * (`MassifContours`, `VIEW`, `RiseGroup`, `RiseItem`, `PortfolioPanel`) went
 * with it; everything else in this file is untouched.
 */

/**
 * A product surface, lifted off the page.
 *
 * The panels are opaque and the environment behind them is not, so without a
 * little elevation they read as pasted-on rectangles. A soft ambient pool
 * beneath each one is what makes it sit IN the scene.
 */
function Floating({ children, className = '' }) {
  return (
    <div className={`relative ${className}`}>
      <div
        className="pointer-events-none absolute -inset-8 -z-10 rounded-[40px] opacity-70"
        style={{
          background:
            'radial-gradient(60% 55% at 50% 45%, rgb(var(--accent-blue-rgb) / 0.13), transparent 72%)',
        }}
        aria-hidden="true"
      />
      {children}
    </div>
  )
}

/* ============================================================ 06 EXPOSURE */

/**
 * 06 — UNDERSTAND YOUR EXPOSURE.
 *
 * Concentration drawn as elevation. Each holding is a peak whose height is its
 * weight, and the point of the picture is immediate and uncomfortable in the
 * right way: two summits dominate the skyline, and that is what the book
 * actually looks like.
 *
 * This is the section that most earns the metaphor. A pie chart states the same
 * numbers; a skyline makes you feel the exposure.
 */
export function Exposure() {
  const holdings = [...DEMO_HOLDINGS].sort((a, b) => b.weight - a.weight)
  const max = holdings[0].weight

  return (
    <section id="exposure" className="relative overflow-hidden py-[9vh]">
      <Shell>
        <Stage index="06" altitude="7,162 m" label="Understand your exposure" />

        <div className="mt-10 grid gap-12 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)] lg:items-end">
          <div>
            <h2 className="e-title max-w-[16ch]">
              <MaskedLine>Concentration</MaskedLine>
              <MaskedLine delay={0.08}>
                <span style={{ color: 'var(--text-secondary)' }}>has a skyline.</span>
              </MaskedLine>
            </h2>
            <p className="e-lead mt-6 max-w-[var(--e-measure)]">
              Weight by position, drawn as elevation. Two names carry 45% of this book — a shape you
              register in a second and would have to work out from a table.
            </p>

            {/* ------------------------------------------- the exposure range */}
            <div className="mt-12 flex items-end gap-3 sm:gap-5" aria-hidden="true">
              {holdings.map((h, i) => (
                <ExposurePeak key={h.ticker} holding={h} height={(h.weight / max) * 240} index={i} />
              ))}
            </div>
            <div
              className="mt-0 h-px w-full"
              style={{ background: 'var(--border-strong)' }}
              aria-hidden="true"
            />

            <div className="mt-4 flex gap-3 sm:gap-5">
              {holdings.map((h) => (
                <div key={h.ticker} className="flex-1 text-center">
                  <p className="num text-[12px] font-semibold text-text-primary">{h.ticker}</p>
                  <p className="num text-[11px] text-text-tertiary">{h.weight.toFixed(1)}%</p>
                </div>
              ))}
            </div>
          </div>

          <Rise delay={0.1}>
            <Floating>
              <AllocationPanel />
            </Floating>
          </Rise>
        </div>
      </Shell>
    </section>
  )
}

/**
 * One holding, as a peak.
 *
 * Drawn as an asymmetric triangle rather than a bar: a bar chart here would
 * quietly abandon the metaphor at the exact moment the page is making its
 * strongest claim about it, and the reader would feel the section change
 * costume even if they could not say why.
 */
function ExposurePeak({ holding, height, index }) {
  const reduce = useReducedMotion()
  const lean = index % 2 ? 0.58 : 0.42

  return (
    <motion.div
      className="relative flex-1 origin-bottom"
      initial={reduce ? false : { scaleY: 0, opacity: 0 }}
      whileInView={{ scaleY: 1, opacity: 1 }}
      viewport={{ once: true, margin: '-12% 0px' }}
      transition={{ duration: 0.9, ease: EASE_OUT, delay: index * 0.07 }}
      style={{ height }}
    >
      <svg className="h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
        <polygon points={`0,100 ${lean * 100},0 100,100`} fill="var(--tr4)" />
        {/* The lit flank, so the range is modelled by the same light as the
            hero rather than being a flat silhouette. */}
        <polygon points={`0,100 ${lean * 100},0 ${lean * 100},100`} fill="var(--tr6)" />
        {/* Snow above the treeline: the top of the biggest positions. */}
        <polygon
          points={`${lean * 100 - 18},26 ${lean * 100},0 ${lean * 100 + 18},26 ${lean * 100},18`}
          fill="var(--tr9)"
          opacity="0.85"
        />
      </svg>
      <span className="sr-only">
        {holding.ticker} {holding.weight}%
      </span>
    </motion.div>
  )
}

/* ============================================================== 07 SIGNAL */

/**
 * 07 — FILTER THE NOISE.
 *
 * The one section that argues by demonstration rather than by picture. A dense
 * field of market chatter fills the frame, and as the reader scrolls it thins
 * until three measured statements are left standing in it.
 *
 * The noise is real in form — headlines, tickers, ratings, the texture of a
 * feed — because noise drawn as abstract squiggles is not noise, it is a
 * pattern, and the reader would not recognise the problem being solved.
 */
export function Signal() {
  const ref = useRef(null)
  const reduce = useReducedMotion()
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] })
  const noiseOpacity = useTransform(scrollYProgress, [0.16, 0.58], [0.5, 0.045])
  const noiseBlur = useTransform(scrollYProgress, [0.16, 0.58], [0, 3])
  const noiseFilter = useTransform(noiseBlur, (v) => `blur(${v}px)`)

  return (
    <section ref={ref} id="signal" className="relative overflow-hidden py-[9vh]">
      <motion.div
        className="pointer-events-none absolute inset-0 select-none"
        style={{
          opacity: reduce ? 0.06 : noiseOpacity,
          filter: reduce ? 'none' : noiseFilter,
        }}
        aria-hidden="true"
      >
        <NoiseField />
      </motion.div>

      <Shell className="relative">
        <Stage index="07" altitude="7,906 m" label="Filter the noise" />

        <div className="mt-10 max-w-[600px]">
          <h2 className="e-title">
            <MaskedLine>Most of it</MaskedLine>
            <MaskedLine delay={0.08}>
              <span style={{ color: 'var(--text-secondary)' }}>is weather.</span>
            </MaskedLine>
          </h2>
          <p className="e-lead mt-6 max-w-[var(--e-measure)]">
            Everest reads your actual book and reports what is measurably true of it — including
            what it cannot determine. It does not forecast the market, and it does not pretend the
            noise was signal.
          </p>
        </div>

        <Rise delay={0.1} className="mt-12 max-w-[720px]">
          <Floating>
            <IntelligencePanel />
          </Floating>
        </Rise>
      </Shell>
    </section>
  )
}

/** The chatter. Deterministic, so it does not reshuffle on every render. */
function NoiseField() {
  const rows = [
    'NVDA upgraded to Buy · price target raised to $1,120 · analyst note',
    'FOMC minutes: members split on the pace of cuts · Reuters',
    'AAPL supplier checks point to softer Q3 builds · rumour',
    'Semis lead the tape · SOX +2.4% · breadth narrowing',
    'LLY halted, news pending · resumes 10:42 ET',
    'Oil slips below $71 as inventories build · headline',
    'MSFT cloud growth reiterated · unchanged guidance',
    '10Y yield 4.18% · curve steepens 3bp · flows',
    'AMZN downgraded on margin concerns · two-notch cut',
    'Retail sentiment gauge at three-month high · survey',
    'META options skew flattens into earnings · unusual activity',
    'Dollar firms; EM equities under pressure · macro',
  ]

  return (
    <div className="flex h-full w-full flex-col justify-center gap-2 overflow-hidden">
      {Array.from({ length: 16 }).map((_, i) => (
        <p
          key={i}
          className="whitespace-nowrap text-[13px] text-text-secondary"
          style={{ transform: `translateX(${((i * 137) % 40) - 20}%)` }}
        >
          {rows[i % rows.length]} &nbsp;·&nbsp; {rows[(i + 5) % rows.length]} &nbsp;·&nbsp;{' '}
          {rows[(i + 9) % rows.length]}
        </p>
      ))}
    </div>
  )
}

/* ========================================================== 08 INSTRUMENT */

/**
 * 08 — ONE INSTRUMENT.
 *
 * Macro to micro. Everything up to here has been the whole book; this section
 * descends into a single security and shows the same rigour applied at the
 * smallest scale — identity, price, history, fundamentals, and the option
 * position written against it with its capital at risk stated plainly.
 *
 * Two panels side by side is the only place on the page where product surfaces
 * are stacked, and it is earned: the argument is precisely that these are one
 * instrument rather than two tools.
 */
export function Instrument() {
  return (
    <section id="instrument" className="relative overflow-hidden py-[9vh]">
      <Shell>
        <Stage index="08" altitude="8,516 m" label="One instrument" />

        <div className="mt-10 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <h2 className="e-title max-w-[13ch]">
            <MaskedLine>All the way</MaskedLine>
            <MaskedLine delay={0.08}>
              <span style={{ color: 'var(--text-secondary)' }}>down to one.</span>
            </MaskedLine>
          </h2>
          <p className="e-lead max-w-[var(--e-measure)]">
            The same instrument that values a whole book resolves a single name — with the contract
            you hold against it, its breakeven, and exactly what is at risk.
          </p>
        </div>

        <div className="mt-12 grid gap-6 lg:grid-cols-2 lg:items-start">
          <Rise>
            <Floating>
              <TickerPanel />
            </Floating>
          </Rise>
          <Rise delay={0.1} className="lg:mt-16">
            <Floating>
              <OptionsPanel />
            </Floating>
          </Rise>
        </div>

        {/*
          The watchlist as a footer strip, at the point where the page zooms
          back out — macro, micro, and back to macro, which is the movement the
          section is named for.
        */}
        <Rise delay={0.16} className="mt-14">
          <p className="e-label mb-4">And everything you are following</p>
          <WatchlistPanel />
        </Rise>
      </Shell>
    </section>
  )
}

/* ============================================================== 09 SUMMIT */

/**
 * 09 — SUMMIT.
 *
 * The journey reaches its highest point, so the composition finally opens: the
 * type is centred, the massif returns whole and small beneath it, and there is
 * more air here than anywhere else on the page.
 *
 * The mark appears for only the second time in the whole document — once in the
 * navigation, once here. Arrival and resolution, nothing in between.
 */
export function Summit() {
  const ref = useRef(null)
  const reduce = useReducedMotion()
  const narrow = useNarrowScene()
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end end'] })
  const rise = useTransform(scrollYProgress, [0, 1], [70, 0])

  return (
    <section ref={ref} id="summit" className="relative overflow-hidden">
      {/*
        The mountain, complete, closing the page where it opened it.

        FULL HEIGHT, not a 62% strip along the bottom. `slice` scales to cover,
        so in a short wide box it cropped to a horizontal band through the
        middle of the massif — a ribbon of disconnected facets that read as a
        rendering fault rather than as a peak. The scene needs its own aspect
        ratio to compose in; the fade to the page does the blending instead.
      */}
      <motion.div
        className="pointer-events-none absolute inset-0 opacity-[0.5]"
        style={{
          y: reduce ? 0 : rise,
          /*
             MASKED AT BOTH ENDS. The scene fills the section box, and the
             section ends before the footer — so without a mask the massif was
             sliced by two hard horizontal edges, one at the section boundary
             and one at the footer, which read as a rendering fault rather than
             as a horizon. The mask lets the mountain rise into the composition
             and dissolve out of it.
          */
          maskImage:
            'linear-gradient(to bottom, transparent 0%, #000 26%, #000 66%, transparent 96%)',
          WebkitMaskImage:
            'linear-gradient(to bottom, transparent 0%, #000 26%, #000 66%, transparent 96%)',
        }}
        aria-hidden="true"
      >
        <EverestScene progress={scrollYProgress} narrow={narrow} />
      </motion.div>

      <Shell className="relative flex min-h-[92vh] flex-col items-center justify-center py-[14vh] text-center">
        <Rise>
          <p className="e-label mb-8">09 — Summit &nbsp;/&nbsp; 8,848.86 m</p>
        </Rise>

        <h2 className="e-display max-w-[14ch]">
          <MaskedLine>See the market.</MaskedLine>
          <MaskedLine delay={0.1}>
            <span style={{ color: 'var(--text-secondary)' }}>Know your position.</span>
          </MaskedLine>
        </h2>

        <Rise delay={0.2}>
          <p className="e-lead mx-auto mt-8 max-w-[46ch]">
            Everest is free to use, and every number on it tells you how current it is. Bring your
            positions and see the whole book from above.
          </p>
        </Rise>

        <Rise delay={0.3}>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link to="/register" className="pill-solid">
              Get started
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
                <path
                  d="M1 6.5h11M7.5 2l4.5 4.5L7.5 11"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </Link>
            <Link
              to="/login"
              className="glass-pill px-5 py-3 text-[14px] font-semibold text-text-primary"
            >
              Sign in
            </Link>
          </div>
        </Rise>

        <Rise delay={0.4}>
          <p className="e-label mt-10">
            No card required &nbsp;·&nbsp; Delayed and live data labelled throughout
          </p>
        </Rise>
      </Shell>
    </section>
  )
}

/* ----------------------------------------------------------------- shared */

export { Floating, Shell, Stage }
