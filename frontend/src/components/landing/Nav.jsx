import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'

import { EverestMark, Wordmark } from '../Brand'
import { useTheme } from '../../hooks/useTheme'
import { EASE_OUT } from './motion'

/**
 * NAVIGATION AS OBJECTS IN THE SCENE.
 *
 * There is no header. No bar, no strip, no divider, nothing spanning the
 * viewport. A full-width surface across the top of a page announces "website"
 * before the reader has looked at anything, and this opening is built to read
 * as a place.
 *
 * So there are THREE floating objects, deliberately not in a row:
 *
 *   top-left     identity
 *   top-right    the two account actions, as one capsule
 *   right edge   a vertical rail: the sky control, and the index
 *
 * Splitting them across two axes is what stops the eye assembling them back
 * into a bar. The vertical rail is the important one — it sits at the reader's
 * eye line rather than in the chrome zone, so it reads as an instrument mounted
 * in the view rather than as a menu.
 *
 * Everything is glass, so the atmosphere stays continuously visible behind and
 * between the controls. The mountain is never interrupted by a solid band.
 *
 * The index is a real disclosure: aria-expanded, aria-controls, Escape to
 * close, focus returned to the trigger, click-outside dismissal.
 */

/**
 * The page, indexed by ALTITUDE rather than by number.
 *
 * The whole story is a climb, so the index is a route card: each section is
 * annotated with the height it sits at, ascending toward the summit. It tells
 * the reader where they are in a way a list of section names cannot.
 */
const STAGES = [
  { label: 'Ascent', href: '#ascend', alt: '5,364 m', note: 'Leaving the ground' },
  { label: 'Terrain', href: '#terrain', alt: '6,065 m', note: 'The market, mapped' },
  { label: 'Portfolio', href: '#portfolio', alt: '6,400 m', note: 'Everything you own' },
  { label: 'Market', href: '#market', alt: '6,800 m', note: 'What moved, and why' },
  { label: 'Exposure', href: '#exposure', alt: '7,162 m', note: 'Where the risk sits' },
  { label: 'Signal', href: '#signal', alt: '7,906 m', note: 'Noise, filtered' },
  { label: 'Instrument', href: '#instrument', alt: '8,516 m', note: 'One company, in full' },
  { label: 'Summit', href: '#summit', alt: '8,848 m', note: 'The whole view' },
]

export function Nav() {
  const reduce = useReducedMotion()
  const [open, setOpen] = useState(false)
  const triggerRef = useRef(null)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!open) return

    const onKey = (e) => {
      if (e.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    const onPointer = (e) => {
      if (menuRef.current?.contains(e.target) || triggerRef.current?.contains(e.target)) return
      setOpen(false)
    }

    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointer)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointer)
    }
  }, [open])

  const enter = (delay) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, y: -10 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.8, ease: EASE_OUT, delay },
        }

  return (
    <>
      {/* ------------------------------------------------------- identity */}
      <motion.div {...enter(0.1)} className="fixed left-[var(--space-page)] top-5 z-50 sm:top-6">
        <Link
          to="/"
          aria-label="Everest home"
          className="glass-pill flex items-center gap-2.5 px-4 py-2.5 text-text-primary
            hover:scale-[1.02]"
        >
          <EverestMark size={17} />
          <Wordmark size="text-[13px]" tracking="0.18em" />
        </Link>
      </motion.div>

      {/* --------------------------------------------------------- account */}
      <motion.div {...enter(0.18)} className="fixed right-[var(--space-page)] top-5 z-50 sm:top-6">
        {/*
          ONE capsule, two actions. Sign in and Get started as separate floating
          pills is two objects doing one job, and it is the shape that most
          reliably reads as the right-hand end of a navbar.
        */}
        <div className="glass-pill flex items-center p-1">
          <Link
            to="/login"
            className="hidden rounded-full px-3.5 py-2 text-[13px] font-medium text-text-primary
              transition-opacity duration-200 hover:opacity-70 sm:block"
          >
            Sign in
          </Link>
          <Link
            to="/register"
            className="rounded-full px-3.5 py-2 text-[13px] font-semibold transition-transform
              duration-300 hover:scale-[1.03]"
            style={{ background: 'var(--text-primary)', color: 'var(--bg-base)' }}
          >
            Get started
          </Link>
        </div>
      </motion.div>

      {/* ------------------------------------------------------- the rail */}
      {/*
        At the reader's eye line on the right edge, NOT in the chrome zone.
        This is the object that decides whether the navigation reads as part of
        the environment or as a header that happens to be rounded.
      */}
      <motion.div
        initial={reduce ? false : { opacity: 0, x: 14 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.9, ease: EASE_OUT, delay: 0.3 }}
        className="fixed right-[var(--space-page)] top-1/2 z-50 -translate-y-1/2"
      >
        <div className="glass-pill flex flex-col items-center gap-1 p-1.5">
          <SkyToggle />

          <span
            className="my-0.5 h-px w-4"
            style={{ background: 'rgb(var(--tint) / 0.16)' }}
            aria-hidden="true"
          />

          <div className="relative">
            <button
              ref={triggerRef}
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-controls="everest-index"
              aria-label="Route index"
              title="Route index"
              className="grid h-9 w-9 place-items-center rounded-full text-text-primary
                transition-colors duration-200 hover:bg-[rgb(var(--tint)/0.1)]"
            >
              {/*
                Contour rings, not a hamburger. The icon is drawn from the same
                topographic language as the rest of the page, so the control
                belongs to this product rather than to every product.
              */}
              <motion.svg
                width="17"
                height="17"
                viewBox="0 0 17 17"
                fill="none"
                animate={reduce ? {} : { rotate: open ? 90 : 0 }}
                transition={{ duration: 0.5, ease: EASE_OUT }}
              >
                <path
                  d="M1 12.5h15"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  opacity="0.45"
                />
                <path
                  d="M3 8.75h11"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  opacity="0.7"
                />
                <path d="M5.5 5h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                <path
                  d="M7.5 1.5h2"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                />
              </motion.svg>
            </button>

            <AnimatePresence>
              {open ? (
                /*
                  POSITIONING AND ANIMATION ON SEPARATE ELEMENTS.

                  Framer writes `transform` into the inline style to animate x
                  and scale, and an inline transform beats Tailwind's
                  `-translate-y-1/2` class. With both on one element the
                  centring silently lost, and the menu hung off the bottom of
                  the viewport with its last two stages unreachable.

                  The outer div owns the anchor; the motion div owns the motion.
                */
                <div className="absolute right-[calc(100%+12px)] top-1/2 -translate-y-1/2">
                  <motion.div
                    id="everest-index"
                    ref={menuRef}
                    initial={reduce ? false : { opacity: 0, x: 12, scale: 0.97 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={reduce ? { opacity: 0 } : { opacity: 0, x: 12, scale: 0.97 }}
                    transition={{ duration: 0.36, ease: EASE_OUT }}
                    style={{ transformOrigin: 'right center' }}
                    className="glass-pill w-[268px] !rounded-[22px] p-2"
                  >
                    <p className="e-label px-3 pb-2 pt-1.5">Route</p>
                    {STAGES.map((s) => (
                      <a
                        key={s.href}
                        href={s.href}
                        onClick={() => setOpen(false)}
                        className="group flex items-baseline gap-3 rounded-2xl px-3 py-2
                        transition-colors duration-200 hover:bg-[rgb(var(--tint)/0.08)]"
                      >
                        <span className="num w-[46px] shrink-0 text-[10.5px] text-text-tertiary">
                          {s.alt}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[13px] font-medium text-text-primary">
                            {s.label}
                          </span>
                          <span className="mt-0.5 block text-[11px] leading-snug text-text-tertiary">
                            {s.note}
                          </span>
                        </span>
                      </a>
                    ))}
                  </motion.div>
                </div>
              ) : null}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>
    </>
  )
}

/**
 * The sky control.
 *
 * ONE disc, two states. A second disc in the page background colour slides
 * across the first: moved away it reveals a full sun, moved over it carves a
 * crescent moon out of the same circle. No icon swap, no crossfade between two
 * glyphs — the control performs the thing it changes, which is the sky.
 */
function SkyToggle() {
  const { isDark, toggleTheme } = useTheme()
  const reduce = useReducedMotion()

  return (
    <button
      type="button"
      onClick={toggleTheme}
      role="switch"
      aria-checked={!isDark}
      aria-label={`Switch to ${isDark ? 'light' : 'dark'} mode`}
      title={`Switch to ${isDark ? 'day' : 'night'} — the mountain follows`}
      className="group relative grid h-9 w-9 cursor-pointer place-items-center overflow-hidden
        rounded-full transition-transform duration-300 hover:scale-105"
    >
      <motion.span
        className="absolute h-[19px] w-[19px] rounded-full"
        animate={{
          background: isDark
            ? 'radial-gradient(circle at 38% 34%, #e8eefb, #93a3c4 68%)'
            : 'radial-gradient(circle at 42% 38%, #fff4d2, #f5b93c 66%)',
          boxShadow: isDark ? '0 0 12px rgba(180,200,240,0.35)' : '0 0 14px rgba(245,185,60,0.45)',
        }}
        transition={{ duration: reduce ? 0 : 0.7, ease: EASE_OUT }}
      />
      <motion.span
        className="absolute h-[17px] w-[17px] rounded-full"
        style={{ background: 'var(--bg-base)' }}
        animate={{ x: isDark ? 6 : 20, y: isDark ? -5 : -15, opacity: isDark ? 1 : 0 }}
        transition={{ duration: reduce ? 0 : 0.7, ease: EASE_OUT }}
      />
      <span className="sr-only">{isDark ? 'Dark' : 'Light'} mode</span>
    </button>
  )
}
