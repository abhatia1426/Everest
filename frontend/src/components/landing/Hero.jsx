import { useRef } from 'react'
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion'

import { EverestScene, useNarrowScene } from './Scene'
import { MaskedLine, EASE_OUT } from './motion'

/**
 * 01 — ARRIVE.
 *
 * THE MOST IMPORTANT SCREEN ON THE SITE, and it has exactly one job: the
 * mountain is the subject, and the words sit in the air beside it.
 *
 * COMPOSITION
 *
 * The massif is not decoration behind a layout — it occupies the frame, runs
 * off every edge, and the type is placed into the negative space the mountain
 * leaves rather than the mountain being sized to fit around a layout. That is
 * the whole difference between art direction and a background image.
 *
 * Everest's summit sits at 61% across and high in the frame, so the open air is
 * the left third and the composition is a diagonal: type top-left, summit
 * top-right, the Nuptse wall closing the bottom. One cohesive content column,
 * one action. Nothing is scattered around the peak.
 *
 * PACING
 *
 * The first viewport is STILL. The camera does not start moving until the
 * reader scrolls, because an opening that animates on arrival gives them
 * something to wait out before they can read. Scroll then recedes the type and
 * starts the climb, handing straight off to 02 with no cut.
 */
export function Hero() {
  const ref = useRef(null)
  const reduce = useReducedMotion()
  const narrow = useNarrowScene()

  /*
   * Measured on the TALL outer section, never on the sticky child — a pinned
   * element does not move relative to the viewport while it is pinned, so
   * measuring it yields a progress that barely changes and a scene that looks
   * frozen.
   */
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] })

  /* The type clears the frame well before the scene finishes, so the mountain
     gets the screen to itself at the top of the ascent. */
  const contentOpacity = useTransform(scrollYProgress, [0, 0.42], [1, 0])
  const contentY = useTransform(scrollYProgress, [0, 0.42], [0, -76])
  const contentBlur = useTransform(scrollYProgress, [0, 0.42], [0, 6])
  const contentFilter = useTransform(contentBlur, (v) => `blur(${v}px)`)

  return (
    <section ref={ref} className="relative h-[190vh]" aria-label="Everest">
      <div className="sticky top-0 h-[100svh] overflow-hidden">
        {/* The environment. Absolutely positioned and full-bleed — it is the
            page's ground, not a figure placed on the page. */}
        <div className="absolute inset-0">
          <EverestScene progress={scrollYProgress} narrow={narrow} />
        </div>

        {/* ------------------------------------------------------------ type */}
        <motion.div
          /* Top-aligned on a phone so the copy owns the upper screen and the
             mountain sits beneath it; centred once there is room to compose the
             two side by side. */
          className="relative z-10 flex h-full items-start px-[var(--space-page)] pt-[14vh]
            sm:items-center sm:pt-0"
          style={{
            opacity: reduce ? 1 : contentOpacity,
            y: reduce ? 0 : contentY,
            filter: reduce ? 'none' : contentFilter,
          }}
        >
          <div className="mx-auto w-full max-w-[1400px]">
            {/*
              ONE COLUMN. Every element in the hero shares a left edge and a
              single vertical rhythm, so the reader's eye makes one pass down
              one object. Two clusters either side of the peak would be two
              objects, and the mountain would become a divider between them.
            */}
            <div className="max-w-[min(780px,94%)] pb-[18vh] sm:pb-[12vh]">
              <motion.p
                initial={reduce ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.9, ease: EASE_OUT, delay: 0.1 }}
                className="e-label mb-6 flex items-center gap-3"
              >
                <span
                  className="h-px w-8 shrink-0"
                  style={{ background: 'currentColor', opacity: 0.5 }}
                  aria-hidden="true"
                />
                AI-Powered Trading Intelligence
              </motion.p>

              <h1 className="e-display">
                <MaskedLine delay={0.16}>See the market.</MaskedLine>
                {/*
                  The second line is set one value quieter. The pair is a
                  statement and its consequence, not two shouts — and the drop
                  in weight is what lets the eye read them in order.
                */}
                <MaskedLine delay={0.26}>
                  <span style={{ color: 'var(--text-secondary)' }}>Know your position.</span>
                </MaskedLine>
              </h1>

              <motion.p
                initial={reduce ? false : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.9, ease: EASE_OUT, delay: 0.5 }}
                className="e-lead mt-7 max-w-[var(--e-measure)]"
              >
                Holdings, options, watchlists and research resolved into one instrument — with
                every price labelled for exactly how current it is.
              </motion.p>

              <motion.div
                initial={reduce ? false : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.9, ease: EASE_OUT, delay: 0.62 }}
                className="mt-9 flex flex-col items-start gap-5"
              >
                <a href="#ascend" className="pill-solid group">
                  Explore Everest
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 13 13"
                    fill="none"
                    aria-hidden="true"
                    className="transition-transform duration-500 group-hover:translate-y-0.5"
                  >
                    <path
                      d="M6.5 1v11M2 7.5l4.5 4.5L11 7.5"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </a>

                {/*
                  THE DATUM.

                  Everest's real summit coordinates and its 2020 surveyed
                  elevation, set as an instrument label. It is the page's first
                  promise that this product deals in measured numbers — and the
                  first hint that the altitudes annotating every section below
                  are a real scale, not a motif.
                */}
                {/* text-secondary, not the label default: at tertiary this sat
                    at roughly 2:1 against a bright sky and vanished in light
                    mode. A datum nobody can read is decoration. */}
                <p className="e-label leading-relaxed !text-text-secondary">
                  27°59′17″N&nbsp;&nbsp;86°55′31″E
                  <span className="mx-2 opacity-40">/</span>
                  8,848.86 m
                </p>
              </motion.div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
