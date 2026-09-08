import { useEffect, useRef, useState } from 'react'
import { animate, motion, useReducedMotion } from 'framer-motion'

/**
 * Shared motion primitives.
 *
 * Everything routes through `useReducedMotion`, so a user who has asked their
 * OS to reduce motion gets the final state immediately instead of a transition.
 */

const EASE = [0.16, 1, 0.3, 1]

export function useMotionSafe() {
  return !useReducedMotion()
}

/**
 * Route-level transition. Keyed on pathname by the caller. Deliberately NOT
 * wrapped in mode="wait" — see AppLayout for why that cost every navigation
 * 300ms before the new page could even mount.
 */
export function PageTransition({ children, className = '' }) {
  const animateOn = useMotionSafe()

  return (
    <motion.div
      className={className}
      // Opacity only, and brief. The old 16px y-translate meant text was still
      // sliding into place while the user was trying to read it, which reads
      // as latency even when the data has already arrived. Content is fully
      // interactive throughout.
      initial={animateOn ? { opacity: 0 } : false}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.12, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  )
}

/**
 * Scroll-triggered reveal. framer-motion's `whileInView` is backed by
 * IntersectionObserver, so nothing animates until it enters the viewport and
 * each section only plays once.
 */
export function Reveal({ children, delay = 0, y = 30, className = '', as = 'div' }) {
  const animateOn = useMotionSafe()
  const Component = motion[as] || motion.div

  return (
    <Component
      className={className}
      initial={animateOn ? { opacity: 0, y } : false}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.5, ease: EASE, delay }}
    >
      {children}
    </Component>
  )
}

/** Wraps a group so children reveal in sequence. Pair with <RevealItem>. */
export function RevealGroup({ children, className = '', stagger = 0.1 }) {
  const animateOn = useMotionSafe()

  return (
    <motion.div
      className={className}
      initial={animateOn ? 'hidden' : false}
      whileInView="visible"
      viewport={{ once: true, margin: '-80px' }}
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: stagger } },
      }}
    >
      {children}
    </motion.div>
  )
}

export function RevealItem({ children, className = '', y = 30 }) {
  return (
    <motion.div
      className={className}
      variants={{
        hidden: { opacity: 0, y },
        visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } },
      }}
    >
      {children}
    </motion.div>
  )
}

/**
 * Entrance stagger for cards that are already on screen at mount (the
 * dashboard), where whileInView would fire everything at once.
 */
export function StaggerGroup({ children, className = '', stagger = 0.02 }) {
  const animateOn = useMotionSafe()

  return (
    <motion.div
      className={className}
      initial={animateOn ? 'hidden' : false}
      animate="visible"
      variants={{ hidden: {}, visible: { transition: { staggerChildren: stagger } } }}
    >
      {children}
    </motion.div>
  )
}

export function StaggerItem({ children, className = '', style }) {
  return (
    <motion.div
      // h-full: as a grid item this div stretches to the row height, and its
      // child panel needs that height available to fill it.
      className={`h-full ${className}`}
      style={style}
      // 0.02s stagger over nine dashboard panels totals ~180ms, against ~720ms
      // before. A stagger long enough to notice is a stagger long enough to
      // make the page feel slow.
      variants={{
        hidden: { opacity: 0, y: 6 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.18, ease: 'easeOut' } },
      }}
    >
      {children}
    </motion.div>
  )
}

/**
 * Counts a number up from 0 on mount. Formatting stays with the caller so
 * currency/percent rules live in one place (lib/format).
 *
 * Only animates the first time a real value arrives — polling every 30s must
 * not restart the count and make the headline figure flicker.
 *
 * Duration is deliberately short. At the previous 1.2s the portfolio value —
 * the single most important number in the product — was unreadable for over a
 * second after the data had already arrived, which is an artificial delay
 * dressed as polish.
 */
export function AnimatedNumber({ value, format, duration = 0.5, className = '' }) {
  const reduceMotion = useReducedMotion()
  const [display, setDisplay] = useState(reduceMotion ? value : 0)
  const hasRun = useRef(false)

  useEffect(() => {
    if (value === null || value === undefined || Number.isNaN(value)) return undefined

    if (reduceMotion || hasRun.current) {
      setDisplay(value)
      return undefined
    }

    hasRun.current = true
    const controls = animate(0, value, {
      duration,
      ease: 'easeOut',
      onUpdate: (latest) => setDisplay(latest),
    })
    return () => controls.stop()
  }, [value, duration, reduceMotion])

  return <span className={className}>{format(display)}</span>
}
