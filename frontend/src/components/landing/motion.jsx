import { useRef } from 'react'
import {
  motion,
  useInView,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from 'framer-motion'

/**
 * The landing page's motion vocabulary.
 *
 * NO NEW DEPENDENCY. framer-motion 13 already ships `useScroll`, `useTransform`
 * and `useSpring`, which covers scroll-linked parallax, masked reveals and
 * staggered entrances. GSAP/ScrollTrigger would add ~50kB to a marketing page
 * to do what is already installed — the reference site using it is not a reason
 * for us to.
 *
 * EVERY primitive here degrades to its final state under `prefers-reduced-
 * motion`. That is checked once per component rather than globally, because a
 * reduced-motion user should still get the composition, just instantly.
 *
 * The shared easing is a long, flat-out curve: motion decelerates over most of
 * its duration, which is what separates "expensive" from "bouncy". No springs
 * with overshoot anywhere on this page.
 */
export const EASE_OUT = [0.16, 1, 0.3, 1]

/* -------------------------------------------------------------- reveals */

/**
 * A single line of display type rising out of a mask.
 *
 * The line translates up from fully below its own clipping box, so it appears
 * to emerge from the page rather than fade in on top of it. Used for every
 * headline; it is the page's signature move and deliberately not used for
 * anything smaller than a section title.
 */
export function MaskedLine({ children, delay = 0, className = '' }) {
  const reduce = useReducedMotion()
  const maskRef = useRef(null)

  /*
   * VISIBILITY IS OBSERVED ON THE MASK, NOT THE LINE.
   *
   * `whileInView` on the inner element deadlocks here: it starts translated
   * 105% down, which puts it entirely outside the mask's `overflow: hidden`
   * box, so IntersectionObserver reports it as never intersecting — the
   * element hides itself, therefore never becomes visible, therefore never
   * animates in. The headline sat permanently clipped.
   *
   * The mask itself is always in the layout and always visible, so it is the
   * correct thing to observe.
   */
  const inView = useInView(maskRef, { once: true, margin: '-8% 0px' })

  if (reduce) {
    return <span className={`line-mask ${className}`}>{children}</span>
  }

  return (
    <span ref={maskRef} className={`line-mask ${className}`}>
      <motion.span
        initial={{ y: '110%' }}
        animate={inView ? { y: '0%' } : { y: '110%' }}
        transition={{ duration: 0.9, ease: EASE_OUT, delay }}
        style={{ display: 'block', willChange: 'transform' }}
      >
        {children}
      </motion.span>
    </span>
  )
}

/** Quiet entrance for supporting content. Short, small travel, never bouncy. */
export function Rise({ children, delay = 0, y = 18, className = '', once = true }) {
  const reduce = useReducedMotion()

  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once, margin: '-10% 0px' }}
      transition={{ duration: 0.7, ease: EASE_OUT, delay }}
    >
      {children}
    </motion.div>
  )
}

/** Staggered group. Pair with <RiseItem>. */
export function RiseGroup({ children, className = '', stagger = 0.07, delay = 0 }) {
  const reduce = useReducedMotion()

  return (
    <motion.div
      className={className}
      initial={reduce ? false : 'hidden'}
      whileInView="visible"
      viewport={{ once: true, margin: '-10% 0px' }}
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: stagger, delayChildren: delay } },
      }}
    >
      {children}
    </motion.div>
  )
}

export function RiseItem({ children, className = '', y = 20 }) {
  return (
    <motion.div
      className={className}
      variants={{
        hidden: { opacity: 0, y },
        visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease: EASE_OUT } },
      }}
    >
      {children}
    </motion.div>
  )
}

/* ------------------------------------------------------------- parallax */

/**
 * Scroll-linked vertical drift.
 *
 * `range` is the total travel in pixels across the element's whole pass
 * through the viewport. Kept small (24-80px) on purpose: parallax that is
 * noticeable as an effect has gone too far, and large offsets fight the
 * reader's sense of where things are.
 *
 * The spring is critically damped — it smooths scroll jitter without adding
 * overshoot, so panels settle rather than wobble.
 */
export function useParallax(range = 60, { damping = 30, stiffness = 120 } = {}) {
  const ref = useRef(null)
  const reduce = useReducedMotion()

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'end start'],
  })

  const raw = useTransform(scrollYProgress, [0, 1], [range / 2, -range / 2])
  const y = useSpring(raw, { damping, stiffness, mass: 0.4 })

  return { ref, y: reduce ? 0 : y }
}

/**
 * Scroll-linked scale + fade, for the hero product panel as it recedes.
 *
 * Anchored to the top of the document rather than to the element, because the
 * hero starts already in view — an element-relative range would begin
 * mid-animation on first paint.
 */
export function useHeroRecede() {
  const ref = useRef(null)
  const reduce = useReducedMotion()

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start start', 'end start'],
  })

  const scale = useTransform(scrollYProgress, [0, 1], [1, 0.94])
  const opacity = useTransform(scrollYProgress, [0, 0.75], [1, 0])
  const y = useTransform(scrollYProgress, [0, 1], [0, -40])

  return {
    ref,
    scale: reduce ? 1 : scale,
    opacity: reduce ? 1 : opacity,
    y: reduce ? 0 : y,
  }
}

/**
 * Fade IN over one window and OUT over another, as a plain function.
 *
 * WHY NOT A FOUR-STOP RANGE. The obvious spelling is
 *
 *   useTransform(p, [0.06, 0.2, 0.44, 0.56], [0, 1, 1, 0])
 *
 * and on this codebase it does not work: sampled across a whole section the
 * value reads 0 almost everywhere, while a two-stop transform on the SAME
 * MotionValue tracks perfectly. The plateau — two adjacent identical outputs —
 * is what breaks it.
 *
 * Rather than depend on the interpolator's behaviour with degenerate segments,
 * this computes the envelope directly. It is more obvious to read, it cannot
 * silently produce a section whose copy never appears, and the failure mode if
 * the numbers are wrong is visible rather than total.
 */
export function useFadeBand(progress, inStart, inEnd, outStart, outEnd) {
  return useTransform(progress, (p) => {
    const up = Math.min(1, Math.max(0, (p - inStart) / (inEnd - inStart)))
    const down = Math.min(1, Math.max(0, (outEnd - p) / (outEnd - outStart)))
    return Math.min(up, down)
  })
}

/* --------------------------------------------------------- pinned scenes */

/**
 * A PINNED SCROLL SCENE — the hero's architecture, made reusable.
 *
 * The scroll timeline is measured on an OUTER, TALL section; the thing you
 * actually see is a `sticky` child one viewport high inside it. Scrolling past
 * the tall section therefore runs 0 -> 1 while the visible content stays put,
 * which is what makes the scene read as a camera move rather than a page
 * scroll.
 *
 * THE ONE FOOTGUN THIS EXISTS TO PREVENT: measuring the sticky child instead
 * of the tall parent. A `position: sticky` element does not move relative to
 * the viewport while it is pinned, so `useScroll` on it yields a progress that
 * barely changes — the scene looks frozen, and it is easy to misread that as
 * "MotionValues aren't propagating". They are; the target was just wrong.
 *
 * Returns the raw `scrollYProgress`.
 */
export function useScrollScene(offset = ['start start', 'end start']) {
  const ref = useRef(null)
  const { scrollYProgress } = useScroll({ target: ref, offset })
  return { ref, progress: scrollYProgress }
}

/**
 * The markup half of the same contract.
 *
 * `children` is a render prop receiving the scene's `progress` MotionValue, so
 * a scene cannot be built with the ref on the wrong element.
 *
 * ON PASSING MOTIONVALUES: both directions work. A parent may `useTransform`
 * and hand the DERIVED MotionValue to a child, or hand down the RAW progress
 * for the child to derive from — including through `React.memo`. This was
 * measured against this app, not assumed. Passing the raw value down is still
 * the house style: each scene component then owns its own timing curve, and
 * the parent does not accumulate transforms for children it does not render.
 *
 * @param {number} height  scroll length in viewport heights. 200 = one full
 *                         extra screen of scroll to play the scene through.
 */
export function ScrollScene({ children, height = 200, className = '', ...rest }) {
  const { ref, progress } = useScrollScene()

  return (
    <section
      ref={ref}
      className={`relative ${className}`}
      style={{ height: `${height}vh` }}
      {...rest}
    >
      <div className="sticky top-0 h-screen overflow-hidden">{children(progress)}</div>
    </section>
  )
}

/* -------------------------------------------------------------- chrome */

/**
 * Editorial section marker: an index, a rule, and a label.
 *
 * This is the device that gives the page a spine. It tells the reader where
 * they are in the story without a progress bar, and it is why the page reads
 * as one designed sequence rather than a stack of independent blocks.
 */
export function SectionMarker({ index, label, className = '' }) {
  return (
    <Rise className={`flex items-center gap-4 ${className}`}>
      <span className="t-index">{index}</span>
      <span
        className="h-px w-10 shrink-0"
        style={{ background: 'var(--border-strong)' }}
        aria-hidden="true"
      />
      <span className="t-index !text-text-secondary">{label}</span>
    </Rise>
  )
}
