import { useState } from 'react'
import { motion, useMotionValueEvent, useReducedMotion, useSpring } from 'motion/react'

/**
 * Motion primitives, adapted.
 *
 * Two patterns from motion-primitives.com, reimplemented here rather than
 * vendored wholesale: a staggered text reveal and a spring-driven numeral.
 * They are the only two that earn a place in this page — the rest of that
 * library (spotlights, tilts, cursors, border trails) is decoration, and this
 * is a financial product.
 *
 * WHY `motion/react` AND NOT `framer-motion`.
 *
 * `motion` was installed alongside the existing `framer-motion`, and running
 * two animation libraries would mean two frameloops and two React contexts —
 * scroll-linked values in one would not share a frame with the other, and
 * `AnimatePresence` from one cannot see components from the other.
 *
 * It was checked rather than assumed: `motion` declares a dependency on
 * `framer-motion@^13`, there is no nested copy in node_modules, and
 * `motion/dist/es/react.mjs` is literally `export * from 'framer-motion'`.
 * Both specifiers resolve to the same hoisted singleton, so new code can use
 * `motion/react` while the frozen Hero and Nav keep their `framer-motion`
 * imports, with no duplicated state.
 */

/* --------------------------------------------------------------- text */

const REVEAL = {
  hidden: { opacity: 0, y: 12, filter: 'blur(6px)' },
  visible: { opacity: 1, y: 0, filter: 'blur(0px)' },
}

/**
 * TEXT EFFECT — a line of copy resolving word by word.
 *
 * The motion-primitives "fade-in-blur" preset: each word rises a little and
 * comes INTO focus rather than simply fading. The blur is what makes it read as
 * something resolving out of atmosphere instead of an opacity tween, which is
 * exactly the register this page is in — and it is why this is used for the
 * supporting copy while headlines keep the harder-edged masked-line reveal.
 *
 * Deliberately restrained: 0.05s between words, and never applied to anything
 * longer than a sentence or two. Per-character staggering on a paragraph is the
 * single most reliable way to make a premium page feel like a template.
 */
export function TextEffect({ children, className = '', delay = 0, per = 0.05, once = true }) {
  const reduce = useReducedMotion()
  const words = String(children).split(' ')

  if (reduce) return <p className={className}>{children}</p>

  return (
    <motion.p
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={{ once, margin: '-12% 0px' }}
      transition={{ staggerChildren: per, delayChildren: delay }}
      aria-label={String(children)}
    >
      {words.map((word, i) => (
        <motion.span
          key={i}
          variants={REVEAL}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="inline-block whitespace-pre"
          aria-hidden="true"
        >
          {word}
          {i < words.length - 1 ? ' ' : ''}
        </motion.span>
      ))}
    </motion.p>
  )
}

/* ------------------------------------------------------------- numbers */

/**
 * ANIMATED NUMBER — a readout that settles rather than snaps.
 *
 * A spring on the value, not a linear tween. An altimeter driven linearly off
 * scroll reads as a progress bar in numeric form; a lightly damped spring
 * overshoots by a hair and settles, which is what a real instrument does and
 * what makes the number feel like it is MEASURING something rather than being
 * interpolated for show.
 *
 * Rendered through state rather than into a MotionValue-bound style, because
 * the value is text content — there is no CSS property to drive.
 */
export function useAnimatedNumber(value, format = (v) => Math.round(v).toLocaleString()) {
  const reduce = useReducedMotion()
  const spring = useSpring(value, { stiffness: 90, damping: 22, mass: 0.6 })
  const [shown, setShown] = useState(() => format(value.get?.() ?? 0))

  useMotionValueEvent(spring, 'change', (v) => setShown(format(v)))

  /* Under reduced motion the spring is bypassed entirely and the readout tracks
     the source value directly — still live and still correct, just not eased. */
  useMotionValueEvent(value, 'change', (v) => {
    if (reduce) setShown(format(v))
  })

  /* No mount effect to seed the value: the state initialiser already reads the
     source, and the subscription above keeps it current. Seeding it again from
     an effect only bought a second synchronous render on mount. */

  return shown
}

/**
 * The hook is the real export.
 *
 * A readout on this page has to be able to render inside an <svg> as much as in
 * the DOM — the altimeter rides the datum line in the survey drawing, and there
 * is no way to put a <span> inside <text>. Returning a string lets the caller
 * decide the element; this wrapper is just the common DOM case.
 */
export function AnimatedNumber({ value, format, className = '' }) {
  const shown = useAnimatedNumber(value, format)
  return (
    <span className={className} style={{ fontVariantNumeric: 'tabular-nums' }}>
      {shown}
    </span>
  )
}
